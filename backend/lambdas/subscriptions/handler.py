# JoBoss feature:
# - F-12: Subscription & Stripe Payment

"""
joBoss Subscriptions Lambda — Stripe-integrated
Routes:
  GET  /subscriptions/me       → get subscription + quota status
  POST /subscriptions/checkout → create Stripe Checkout Session
  POST /subscriptions/consume  → increment daily application counter
  DELETE /subscriptions/me     → cancel subscription (Stripe + DB)
  POST /subscriptions/webhook  → Stripe webhook (no auth)
"""

import json
import os
from datetime import datetime, timezone, timedelta
from decimal import Decimal

import boto3
import stripe
from botocore.exceptions import ClientError

REGION = os.getenv("AWS_REGION", "us-east-1")
USERS_TABLE = os.getenv("USERS_TABLE", "joboss-users")
SUBSCRIPTIONS_TABLE = os.getenv("SUBSCRIPTIONS_TABLE", "joboss-subscriptions")
APPLICATIONS_TABLE = os.getenv("APPLICATIONS_TABLE", "joboss-applications")

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PREMIUM_PRICE_ID = os.getenv("STRIPE_PREMIUM_PRICE_ID", "")
STRIPE_PREMIUM_PLUS_PRICE_ID = os.getenv("STRIPE_PREMIUM_PLUS_PRICE_ID", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://d231wno34rvped.cloudfront.net")

stripe.api_key = STRIPE_SECRET_KEY

# ── Single source of truth for per-tier daily limits ─────────────────────────
# Mirrors TIER_LIMITS in the swipes Lambda. daily_swipes is the binding daily
# gate (counts LIKE swipes); -1 = unlimited.
TIER_LIMITS = {
    "FREE":         {"daily_swipes": 5,   "daily_applies": 5,  "ai_tailoring": False},
    "PREMIUM":      {"daily_swipes": 30,  "daily_applies": -1, "ai_tailoring": True},
    "PREMIUM_PLUS": {"daily_swipes": -1,  "daily_applies": -1, "ai_tailoring": True},
}

# Daily limit reported/enforced per plan = the binding swipe gate.
PLAN_LIMITS = {plan: limits["daily_swipes"] for plan, limits in TIER_LIMITS.items()}

PLANS = {
    "FREE": {
        "name": "חינמי",
        "price_monthly": 0,
        "daily_swipes": TIER_LIMITS["FREE"]["daily_swipes"],
        "daily_applications": 5,
        "ai_tailoring_monthly": 0,
        "auto_apply": False,
        "analytics": False,
        "priority_matching": False,
        "stripe_price_id": None,
    },
    "PREMIUM": {
        "name": "פרימיום",
        "price_monthly": 36,
        "daily_swipes": TIER_LIMITS["PREMIUM"]["daily_swipes"],
        "daily_applications": -1,
        "ai_tailoring_monthly": 10,
        "auto_apply": True,
        "analytics": "basic",
        "priority_matching": False,
        "stripe_price_id": STRIPE_PREMIUM_PRICE_ID,
        "trial_days": 7,
    },
    "PREMIUM_PLUS": {
        "name": "פרימיום+",
        "price_monthly": 72,
        "daily_swipes": TIER_LIMITS["PREMIUM_PLUS"]["daily_swipes"],
        "daily_applications": -1,
        "ai_tailoring_monthly": -1,
        "auto_apply": True,
        "analytics": "advanced",
        "priority_matching": True,
        "stripe_price_id": STRIPE_PREMIUM_PLUS_PRICE_ID,
        "trial_days": 7,
    },
}

dynamodb = boto3.resource("dynamodb", region_name=REGION)
users_table = dynamodb.Table(USERS_TABLE)
subs_table = dynamodb.Table(SUBSCRIPTIONS_TABLE)
applications_table = dynamodb.Table(APPLICATIONS_TABLE)


# CORS: reflect the request Origin only when allowlisted (CloudFront prod +
# local dev). Stripe webhooks are server-to-server (no Origin header) and are
# unaffected by CORS.
ALLOWED_ORIGINS = {FRONTEND_URL, "http://localhost:5173"}
_cors_origin = FRONTEND_URL


def _set_cors_origin(event):
    global _cors_origin
    headers = event.get("headers") or {}
    origin = headers.get("origin") or headers.get("Origin") or ""
    _cors_origin = origin if origin in ALLOWED_ORIGINS else FRONTEND_URL


def cors():
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": _cors_origin,
        "Access-Control-Allow-Headers": "Content-Type,Authorization,Stripe-Signature",
        "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    }


def _serialize(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj == obj.to_integral_value() else float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def resp(status, body):
    return {"statusCode": status, "headers": cors(), "body": json.dumps(body, default=_serialize)}


def get_user_id(event):
    claims = (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("claims", {})
    )
    uid = claims.get("sub")
    if uid:
        return uid

    # No fallback: identity must come from the API Gateway Cognito authorizer.
    # (Accepting userId from the query string / body / an unverified JWT would
    # let anyone act on another user's subscription.)
    return None


def get_body(event):
    raw = event.get("body") or "{}"
    if isinstance(raw, str):
        return json.loads(raw)
    return raw


def get_next_reset():
    now = datetime.now(timezone.utc)
    return (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()


def get_subscription(user_id):
    result = subs_table.get_item(Key={"userId": user_id})
    return result.get("Item")


def get_or_create_subscription(user_id):
    sub = get_subscription(user_id)
    if sub:
        return sub
    now = datetime.now(timezone.utc).isoformat()
    sub = {
        "userId": user_id,
        "plan": "FREE",
        "status": "FREE",
        "dailyApplications": 0,
        "limitResetAt": get_next_reset(),
        "createdAt": now,
        "updatedAt": now,
    }
    subs_table.put_item(Item=sub)
    return sub


def reset_daily_if_needed(user_id, sub):
    reset_at = sub.get("limitResetAt")
    now = datetime.now(timezone.utc)
    should_reset = False
    if not reset_at:
        should_reset = True
    else:
        try:
            should_reset = datetime.fromisoformat(reset_at.replace("Z", "+00:00")) <= now
        except ValueError:
            should_reset = True

    if should_reset:
        new_reset = get_next_reset()
        subs_table.update_item(
            Key={"userId": user_id},
            UpdateExpression="SET dailyApplications = :zero, limitResetAt = :reset, updatedAt = :now",
            ExpressionAttributeValues={
                ":zero": 0,
                ":reset": new_reset,
                ":now": now.isoformat(),
            },
        )
        sub["dailyApplications"] = 0
        sub["limitResetAt"] = new_reset

    return sub


def count_today_applications(user_id):
    """Single source of truth for daily quota usage — mirrors the swipes Lambda.

    Counts today's rows in joboss-applications (LIKE swipes create one each,
    undo deletes it), honoring an admin quotaResetAt later than midnight.
    This replaces the old `dailyApplications` counter on the subscription
    record, which could drift from what the swipes Lambda actually enforced.
    """
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_iso = today.isoformat()
    tomorrow_iso = (today + timedelta(days=1)).isoformat()

    count_from = today_iso
    try:
        user_record = users_table.get_item(
            Key={"userId": user_id},
            ProjectionExpression="quotaResetAt",
        ).get("Item", {})
        reset_at = user_record.get("quotaResetAt", "")
        if reset_at and reset_at > today_iso:
            count_from = reset_at
    except Exception:
        pass

    # quotaExempt records (auto-apply that failed) refund the daily credit —
    # must match the swipes Lambda filter exactly.
    count = 0
    kwargs = {
        "KeyConditionExpression": boto3.dynamodb.conditions.Key("userId").eq(user_id),
        "FilterExpression": (
            boto3.dynamodb.conditions.Attr("createdAt").between(count_from, tomorrow_iso)
            & (~boto3.dynamodb.conditions.Attr("quotaExempt").exists()
               | boto3.dynamodb.conditions.Attr("quotaExempt").eq(False))
        ),
        "Select": "COUNT",
    }
    while True:
        result = applications_table.query(**kwargs)
        count += result.get("Count", 0)
        if "LastEvaluatedKey" not in result:
            break
        kwargs["ExclusiveStartKey"] = result["LastEvaluatedKey"]
    return count


def effective_plan(sub):
    plan = sub.get("plan", "FREE")
    status = sub.get("status", "FREE")
    # TRIALING comes from the Stripe subscription.updated webhook during a trial.
    # CANCELLING = cancel_at_period_end: still entitled until the period ends.
    if status not in ("ACTIVE", "TRIAL", "TRIALING", "FREE", "CANCELLING"):
        return "FREE"
    return plan


# ── Route handlers ────────────────────────────────────────────────────────────

def handle_get_me(event):
    user_id = get_user_id(event)
    if not user_id:
        return resp(401, {"error": "Unauthorized"})

    sub = get_or_create_subscription(user_id)
    sub = reset_daily_if_needed(user_id, sub)
    plan = effective_plan(sub)
    limit = PLAN_LIMITS.get(plan, 5)
    # Same source the swipes Lambda enforces against — keeps the UI number
    # identical to what actually gates the next LIKE.
    used = 0 if limit == -1 else count_today_applications(user_id)

    return resp(200, {
        "userId": user_id,
        "plan": plan,
        "planKey": plan,
        "planDetails": PLANS.get(plan, PLANS["FREE"]),
        "plans": PLANS,
        "subscription": sub,
        "status": sub.get("status", "FREE"),
        "dailyLimit": limit,
        "used": used,
        "remaining": max(0, limit - used) if limit != -1 else -1,
        "unlimited": limit == -1,
        "resetAt": sub.get("limitResetAt"),
        "stripeSubscriptionId": sub.get("stripeSubscriptionId"),
        "currentPeriodEnd": sub.get("currentPeriodEnd"),
    })


def handle_checkout(event):
    user_id = get_user_id(event)
    if not user_id:
        return resp(401, {"error": "Unauthorized"})

    body = get_body(event)
    plan = body.get("plan", "PREMIUM").upper()

    price_id = STRIPE_PREMIUM_PLUS_PRICE_ID if plan == "PREMIUM_PLUS" else STRIPE_PREMIUM_PRICE_ID

    if not price_id:
        return resp(500, {"error": "Stripe price ID not configured"})

    trial_days = PLANS.get(plan, {}).get("trial_days")

    # Only grant a trial once per account. Without this a user could trial,
    # cancel, and trial again forever — Stripe honours trial_period_days on
    # every checkout we send it, it does not track prior trials for us.
    existing = get_subscription(user_id) or {}
    if existing.get("trialUsed"):
        trial_days = None

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            **({"subscription_data": {"trial_period_days": trial_days}} if trial_days else {}),
            success_url=f"{FRONTEND_URL}/subscription?subscription=success",
            cancel_url=f"{FRONTEND_URL}/subscription?subscription=cancelled",
            client_reference_id=user_id,
            metadata={"userId": user_id, "plan": plan},
        )
        return resp(200, {"checkoutUrl": session.url, "sessionId": session.id})
    except stripe.error.StripeError as e:
        return resp(500, {"error": "Stripe error", "details": str(e)})


# NOTE: POST /subscriptions/consume was removed — nothing called it, and its
# private dailyApplications counter drifted from the real quota source
# (count_today_applications, mirroring the swipes Lambda).


def handle_cancel(event):
    user_id = get_user_id(event)
    if not user_id:
        return resp(401, {"error": "Unauthorized"})

    sub = get_subscription(user_id)
    stripe_sub_id = sub.get("stripeSubscriptionId") if sub else None

    if stripe_sub_id:
        try:
            stripe.Subscription.modify(stripe_sub_id, cancel_at_period_end=True)
        except stripe.error.StripeError as e:
            return resp(500, {"error": "Stripe error", "details": str(e)})

    now = datetime.now(timezone.utc).isoformat()
    subs_table.update_item(
        Key={"userId": user_id},
        UpdateExpression="SET #s = :s, updatedAt = :now",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":s": "CANCELLING", ":now": now},
    )

    return resp(200, {"message": "Subscription set to cancel at period end"})


def handle_webhook(event):
    payload = event.get("body") or ""
    headers = event.get("headers") or {}
    sig = headers.get("Stripe-Signature") or headers.get("stripe-signature") or ""

    try:
        webhook_event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except stripe.error.SignatureVerificationError:
        return resp(400, {"error": "Invalid webhook signature"})
    except Exception as e:
        return resp(400, {"error": str(e)})

    # Work off the raw JSON, not the StripeObject. Newer stripe-python resolves
    # unknown attributes through __getattr__, which raises AttributeError(name) —
    # so `data.get(...)` blew up with a bare "AttributeError: get" and Stripe saw
    # a 5xx. The signature is already verified above; re-parsing is just to get
    # plain dicts, nested ones included.
    parsed = json.loads(payload if isinstance(payload, str) else payload.decode())
    event_type = parsed["type"]
    data = parsed["data"]["object"]

    now = datetime.now(timezone.utc).isoformat()

    if event_type == "checkout.session.completed":
        user_id = data.get("client_reference_id") or (data.get("metadata") or {}).get("userId")
        plan = (data.get("metadata") or {}).get("plan", "PREMIUM")
        stripe_sub_id = data.get("subscription")
        trial_granted = bool(PLANS.get(plan, {}).get("trial_days"))

        # checkout.session.completed does not carry the billing period, and
        # relying on a later customer.subscription.updated left the user with no
        # renewal date at all if that event was not configured. Fetch it now so
        # the date exists the moment the purchase lands.
        period_end = None
        trial_end = None
        if stripe_sub_id:
            try:
                stripe_sub = stripe.Subscription.retrieve(stripe_sub_id)
                # stripe-python 15.x speaks a 2025+ API version, where
                # current_period_start/end moved OFF the subscription and onto
                # its items. That is why getattr returned None with no error:
                # the attribute genuinely is not there any more. Read the
                # subscription level first for older API versions, then fall
                # back to the first item.
                trial_end = getattr(stripe_sub, "trial_end", None)
                period_end = getattr(stripe_sub, "current_period_end", None)
                if not period_end:
                    try:
                        first_item = stripe_sub["items"]["data"][0]
                        period_end = (getattr(first_item, "current_period_end", None)
                                      or first_item["current_period_end"])
                    except Exception as item_err:
                        print(f"[SUBS] no period end on items either: {item_err}")
                print(f"[SUBS] period_end={period_end} trial_end={trial_end}")
            except Exception as e:
                print(f"[SUBS] could not fetch period end: {e}")

        if user_id:
            subs_table.update_item(
                Key={"userId": user_id},
                UpdateExpression=(
                    "SET #plan = :plan, #status = :status, "
                    "stripeSubscriptionId = :subId, updatedAt = :now, "
                    "trialUsed = if_not_exists(trialUsed, :trialUsed)"
                    + (", currentPeriodEnd = :pe" if period_end else "")
                    + (", trialEndAt = :te" if trial_end else "")
                ),
                ExpressionAttributeNames={"#plan": "plan", "#status": "status"},
                ExpressionAttributeValues={
                    ":plan": plan,
                    ":status": "TRIAL" if trial_end else "ACTIVE",
                    ":subId": stripe_sub_id or "",
                    ":now": now,
                    # Sticky: once true it stays true, so a later checkout without
                    # a trial cannot clear the flag and re-open the loophole.
                    ":trialUsed": trial_granted,
                    **({":pe": int(period_end)} if period_end else {}),
                    **({":te": int(trial_end)} if trial_end else {}),
                },
            )
            # Mirror plan onto users table so other Lambdas see it
            users_table.update_item(
                Key={"userId": user_id},
                UpdateExpression="SET #plan = :plan, updatedAt = :now",
                ExpressionAttributeNames={"#plan": "plan"},
                ExpressionAttributeValues={":plan": plan, ":now": now},
            )

    elif event_type in ("customer.subscription.deleted", "customer.subscription.updated"):
        stripe_sub_id = data.get("id")
        status = data.get("status", "")

        # Find user by stripeSubscriptionId via scan (small table)
        result = subs_table.scan(
            FilterExpression=boto3.dynamodb.conditions.Attr("stripeSubscriptionId").eq(stripe_sub_id)
        )
        items = result.get("Items", [])

        if items:
            user_id = items[0]["userId"]
            # Terminal states wipe the plan. past_due is NOT terminal — keep the
            # purchased plan and let effective_plan() gate access while status
            # is PAST_DUE; if we wiped the plan here, a recovered payment
            # (status back to active) would restore an ACTIVE subscription with
            # plan=FREE and the paying user would stay downgraded forever.
            if status in ("canceled", "unpaid"):
                new_plan, new_status = "FREE", "FREE"
            else:
                new_plan = items[0].get("plan", "FREE")
                new_status = status.upper()  # ACTIVE / TRIALING / PAST_DUE / ...
                # Stripe reports cancel_at_period_end separately from status: the
                # subscription stays "active" until the period actually ends.
                if data.get("cancel_at_period_end"):
                    new_status = "CANCELLING"

            period_end = data.get("current_period_end")
            subs_table.update_item(
                Key={"userId": user_id},
                UpdateExpression=(
                    "SET #plan = :plan, #status = :status, updatedAt = :now"
                    + (", currentPeriodEnd = :pe" if period_end else "")
                ),
                ExpressionAttributeNames={"#plan": "plan", "#status": "status"},
                ExpressionAttributeValues={
                    ":plan": new_plan,
                    ":status": new_status,
                    ":now": now,
                    # Seconds since epoch, exactly what the UI expects.
                    **({":pe": int(period_end)} if period_end else {}),
                },
            )
            users_table.update_item(
                Key={"userId": user_id},
                UpdateExpression="SET #plan = :plan, updatedAt = :now",
                ExpressionAttributeNames={"#plan": "plan"},
                ExpressionAttributeValues={":plan": new_plan, ":now": now},
            )

    return resp(200, {"received": True})


# ── Entry point ───────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    _set_cors_origin(event)
    method = event.get("httpMethod", "GET").upper()
    path = event.get("path", "")

    if method == "OPTIONS":
        return resp(200, {})

    try:
        if method == "GET":
            return handle_get_me(event)
        if method == "POST" and "webhook" in path:
            return handle_webhook(event)
        if method == "POST" and "consume" in path:
            return resp(410, {"error": "Endpoint removed — quota is counted from applications"})
        if method == "POST":
            return handle_checkout(event)
        if method == "DELETE":
            return handle_cancel(event)
        return resp(405, {"error": f"Method {method} not allowed"})

    except ClientError as e:
        print(f"[SUBS_ERROR] ClientError: {e}")
        return resp(500, {"error": "AWS error"})
    except Exception as e:
        print(f"[SUBS_ERROR] {type(e).__name__}: {e}")
        return resp(500, {"error": "Internal error"})
