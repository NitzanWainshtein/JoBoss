"""
joBoss Swipes Lambda
Feature #SWP-001 — swipe right/left
Feature #SWP-002 — enforce daily application limit per plan
Feature #SWP-003 — undo last swipe
"""

import json
import os
import uuid
import boto3
from datetime import datetime, timezone, timedelta
from decimal import Decimal

dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
swipes_table = dynamodb.Table(os.environ.get("SWIPES_TABLE", "joboss-swipes"))
applications_table = dynamodb.Table(os.environ.get("APPLICATIONS_TABLE", "joboss-applications"))
subs_table = dynamodb.Table(os.environ.get("SUBSCRIPTIONS_TABLE", "joboss-subscriptions"))
users_table = dynamodb.Table(os.environ.get("USERS_TABLE", "joboss-users"))
jobs_table = dynamodb.Table(os.environ.get("JOBS_TABLE", "joboss-jobs"))

sqs = boto3.client("sqs", region_name="us-east-1")
SQS_QUEUE_URL = os.environ.get("SQS_QUEUE_URL", "")

CORS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
}

# ── Single source of truth for per-tier daily limits ─────────────────────────
# daily_swipes  → max counted swipes per day; -1 = unlimited.
# daily_applies → kept for parity with the subscriptions service; -1 = unlimited.
# ai_tailoring  → whether AI CV tailoring is available on the tier.
# NOTE: only LIKE swipes (applications) are metered — PASS/left-swipes are never
# counted, so the daily reset is implicit via the today-window count below.
TIER_LIMITS = {
    "FREE":         {"daily_swipes": 5,   "daily_applies": 5,  "ai_tailoring": False},
    "PREMIUM":      {"daily_swipes": 30,  "daily_applies": -1, "ai_tailoring": True},
    "PREMIUM_PLUS": {"daily_swipes": -1,  "daily_applies": -1, "ai_tailoring": True},
}


def get_swipe_limit(plan):
    return TIER_LIMITS.get(plan, TIER_LIMITS["FREE"])["daily_swipes"]


def get_user_profile(user_id):
    """Fetch the user record from joboss-users. Returns {} on any failure."""
    try:
        result = users_table.get_item(Key={"userId": user_id})
        return result.get("Item") or {}
    except Exception as e:
        print(f"USER FETCH ERROR: userId={user_id}, error={e}")
        return {}


def get_job_apply_url(job_id):
    """Fetch applyUrl from joboss-jobs. Returns '' on any failure."""
    try:
        result = jobs_table.get_item(Key={"jobId": job_id}, ProjectionExpression="applyUrl")
        return result.get("Item", {}).get("applyUrl", "") or ""
    except Exception as e:
        print(f"JOB FETCH ERROR: jobId={job_id}, error={e}")
        return ""


def send_to_auto_apply_queue(user_id, job_id, body, plan, apply_url=""):
    """
    Push a message to joboss-auto-apply-queue.
    Fails silently — a queue hiccup must never block the swipe response.
    """
    if not SQS_QUEUE_URL:
        print("AUTO_APPLY: SQS_QUEUE_URL not configured, skipping")
        return
    try:
        ai_tailoring = TIER_LIMITS.get(plan, TIER_LIMITS["FREE"])["ai_tailoring"]
        message = {
            "userId": user_id,
            "jobId": job_id,
            "jobUrl": apply_url,
            "jobTitle": body.get("title", ""),
            "company": body.get("company", ""),
            "aiTailoring": ai_tailoring,
        }
        send_kwargs = {"QueueUrl": SQS_QUEUE_URL, "MessageBody": json.dumps(message)}
        if SQS_QUEUE_URL.endswith(".fifo"):
            send_kwargs["MessageGroupId"] = user_id
        sqs.send_message(**send_kwargs)
        print(f"AUTO_APPLY: queued userId={user_id}, jobId={job_id}, aiTailoring={ai_tailoring}")
    except Exception as e:
        print(f"AUTO_APPLY ERROR: userId={user_id}, jobId={job_id}, error={e}")


def resp(status, body):
    return {"statusCode": status, "headers": CORS, "body": json.dumps(body, default=str)}


def get_user_id(event):
    return (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("claims", {})
        .get("sub")
    )


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def get_effective_plan(user_id):
    try:
        result = subs_table.get_item(Key={"userId": user_id})
        sub = result.get("Item")
        if not sub:
            print(f"PLAN LOOKUP: no subscription record for userId={user_id} → FREE")
            return "FREE"
        status = sub.get("status", "EXPIRED")
        plan = sub.get("plan", "FREE")
        print(f"PLAN LOOKUP: userId={user_id}, status={status}, plan={plan}")
        # TRIAL is the legacy internal trial (with trialEndAt); TRIALING is the
        # Stripe-managed trial — Stripe flips it via webhook when it ends.
        if status in ("ACTIVE", "TRIAL", "TRIALING"):
            if status == "TRIAL":
                trial_end = int(sub.get("trialEndAt", 0))
                if datetime.now(timezone.utc).timestamp() > trial_end:
                    print(f"PLAN LOOKUP: trial expired for userId={user_id} → FREE")
                    return "FREE"
            return plan
        print(f"PLAN LOOKUP: inactive status={status} for userId={user_id} → FREE")
        return "FREE"
    except Exception as e:
        print(f"PLAN LOOKUP ERROR: userId={user_id}, error={e}")
        return "FREE"


def count_today_applications(user_id):
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_iso = today.isoformat()
    tomorrow_iso = (today + timedelta(days=1)).isoformat()

    # If admin reset quota today, count only from that reset point
    try:
        user_record = users_table.get_item(
            Key={"userId": user_id},
            ProjectionExpression="quotaResetAt",
        ).get("Item", {})
        reset_at = user_record.get("quotaResetAt", "")
        if reset_at and reset_at > today_iso:
            count_from = reset_at
        else:
            count_from = today_iso
    except Exception:
        count_from = today_iso

    # Query by partition key (userId) instead of scanning the whole table.
    # quotaExempt records (auto-apply that failed) refund the daily credit.
    count = 0
    kwargs = {
        "KeyConditionExpression": boto3.dynamodb.conditions.Key("userId").eq(user_id),
        "FilterExpression": (
            boto3.dynamodb.conditions.Attr("createdAt").between(count_from, tomorrow_iso)
            & (~boto3.dynamodb.conditions.Attr("quotaExempt").exists()
               | boto3.dynamodb.conditions.Attr("quotaExempt").eq(False))
        ),
        "ConsistentRead": True,
        "Select": "COUNT",
    }
    while True:
        result = applications_table.query(**kwargs)
        count += result.get("Count", 0)
        if "LastEvaluatedKey" not in result:
            break
        kwargs["ExclusiveStartKey"] = result["LastEvaluatedKey"]
    print(f"QUOTA COUNT: userId={user_id}, from={count_from}, count={count}")
    return count


def get_reset_time():
    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return tomorrow.isoformat().replace("+00:00", "Z")


def create_swipe(event):
    user_id = get_user_id(event)
    if not user_id:
        return resp(401, {"message": "Unauthorized"})

    body = json.loads(event.get("body") or "{}")
    job_id = body.get("jobId")
    decision = body.get("decision", "").upper()

    if not job_id or decision not in ("LIKE", "PASS"):
        return resp(400, {"message": "jobId and decision (LIKE|PASS) required"})

    plan = get_effective_plan(user_id)
    daily_limit = get_swipe_limit(plan)
    used_after = None

    if decision == "LIKE":
        print(f"SWIPE CHECK: userId={user_id}, resolved_plan={plan}, daily_limit={daily_limit}")

        if daily_limit != -1:
            count = count_today_applications(user_id)
            if count >= daily_limit:
                return resp(429, {
                    "message": "Daily swipe limit reached",
                    "code": "LIMIT_REACHED",
                    "plan": plan,
                    "limit": daily_limit,
                    "used": count,
                    "remaining": 0,
                    "resetAt": get_reset_time(),
                })

        # Determine the auto-apply track up front so the record reflects it
        # immediately: "pending" when Auto Apply runs, "manual" when it doesn't.
        user_profile = get_user_profile(user_id)
        auto_apply_on = user_profile.get("autoApply") is True

        ai_tailoring_on = auto_apply_on and TIER_LIMITS.get(plan, TIER_LIMITS["FREE"])["ai_tailoring"]

        if auto_apply_on:
            # When AI tailoring is also enabled, hold off on SQS: write
            # "pending_tailoring" so the ai-tailor Lambda can detect this state,
            # finish tailoring, and then dispatch to SQS with the tailored CV URL.
            # When AI tailoring is off (or Free plan), send to SQS immediately.
            initial_auto_status = "pending_tailoring" if ai_tailoring_on else "pending"
        else:
            initial_auto_status = "manual"

        app_item = {
            "userId": user_id,
            "jobId": job_id,
            "company": body.get("company", ""),
            "title": body.get("title", ""),
            "status": "SUBMITTED",
            "autoApplyStatus": initial_auto_status,
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
        }
        applications_table.put_item(Item=app_item)

        # Race guard: the pre-check above isn't atomic with the write, so two
        # concurrent LIKEs can both pass it. Recount AFTER writing; if we
        # overshot the limit, roll our write back and reject. Worst case both
        # racers roll back (the user just swipes again) — the limit itself is
        # never exceeded. Auto-apply dispatch happens only after this guard.
        if daily_limit != -1:
            used_after = count_today_applications(user_id)
            if used_after > daily_limit:
                applications_table.delete_item(Key={"userId": user_id, "jobId": job_id})
                print(f"SWIPE RACE ROLLBACK: userId={user_id}, jobId={job_id}, count={used_after} > limit={daily_limit}")
                return resp(429, {
                    "message": "Daily swipe limit reached",
                    "code": "LIMIT_REACHED",
                    "plan": plan,
                    "limit": daily_limit,
                    "used": daily_limit,
                    "remaining": 0,
                    "resetAt": get_reset_time(),
                })

        if auto_apply_on and not ai_tailoring_on:
            # Tailoring not involved — go straight to SQS.
            apply_url = get_job_apply_url(job_id)
            print(f"AUTO_APPLY: resolved applyUrl={apply_url!r} for jobId={job_id}")
            send_to_auto_apply_queue(user_id, job_id, body, plan, apply_url=apply_url)
        elif auto_apply_on and ai_tailoring_on:
            print(f"AUTO_APPLY: waiting for tailoring — autoApplyStatus=pending_tailoring userId={user_id} jobId={job_id}")

    swipe_item = {
        "userId": user_id,
        "jobId": job_id,
        "decision": decision,
        "swipedAt": now_iso(),
    }
    swipes_table.put_item(Item=swipe_item)

    if daily_limit == -1:
        used_after = 0
        remaining = -1
    else:
        if used_after is None:
            used_after = count_today_applications(user_id)
        remaining = max(0, daily_limit - used_after)

    return resp(201, {
        "message": "Swipe recorded",
        "decision": decision,
        "quota": {
            "plan": plan,
            "limit": daily_limit,
            "used": used_after,
            "remaining": remaining,
            "unlimited": daily_limit == -1,
            "resetAt": get_reset_time() if daily_limit != -1 else None,
        },
    })


def get_my_swipes(event):
    user_id = get_user_id(event)
    if not user_id:
        return resp(401, {"message": "Unauthorized"})

    result = swipes_table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key("userId").eq(user_id)
    )
    return resp(200, {"swipes": result.get("Items", [])})


def delete_swipe(event):
    user_id = get_user_id(event)
    if not user_id:
        return resp(401, {"message": "Unauthorized"})

    path = event.get("path", "") or event.get("rawPath", "")
    job_id = path.rstrip("/").split("/")[-1]
    if not job_id or job_id == "swipes":
        return resp(400, {"message": "jobId required"})

    # If auto-apply already submitted this application for real, deleting the
    # record would erase the only trace of a submission that actually happened.
    try:
        app = applications_table.get_item(
            Key={"userId": user_id, "jobId": job_id},
            ProjectionExpression="autoApplyStatus",
        ).get("Item", {})
        if app.get("autoApplyStatus") == "success":
            return resp(409, {
                "message": "Application was already submitted by Auto Apply and cannot be undone",
                "code": "ALREADY_APPLIED",
            })
    except Exception as e:
        print(f"UNDO CHECK ERROR: userId={user_id}, jobId={job_id}, error={e}")

    swipes_table.delete_item(Key={"userId": user_id, "jobId": job_id})

    # joboss-applications uses (userId, jobId) composite key
    applications_table.delete_item(Key={"userId": user_id, "jobId": job_id})

    return resp(200, {"message": "Swipe undone"})


def get_quota_status(event):
    user_id = get_user_id(event)
    if not user_id:
        return resp(401, {"message": "Unauthorized"})

    plan = get_effective_plan(user_id)
    daily_limit = get_swipe_limit(plan)

    if daily_limit == -1:
        return resp(200, {
            "plan": plan,
            "limit": -1,
            "used": 0,
            "remaining": -1,
            "unlimited": True,
            "resetAt": None,
        })

    used = count_today_applications(user_id)
    print(f"QUOTA CHECK: userId={user_id}, count={used}, plan={plan}, limit={daily_limit}")
    remaining = max(0, daily_limit - used)

    result = {
        "plan": plan,
        "limit": daily_limit,
        "used": used,
        "remaining": remaining,
        "unlimited": False,
        "resetAt": get_reset_time(),
    }

    # For PREMIUM only: include monthly AI tailoring usage alongside the swipe quota.
    # FREE has no tailoring; PREMIUM_PLUS is unlimited (no counter needed).
    if plan == "PREMIUM":
        AI_MONTHLY_LIMIT = 10
        user = get_user_profile(user_id)
        now_month = datetime.now(timezone.utc).strftime("%Y-%m")
        stored_month = user.get("aiTailoringsMonth", "")
        tailor_used = int(user.get("aiTailoringsUsed", 0)) if stored_month == now_month else 0
        result["tailorLimit"] = AI_MONTHLY_LIMIT
        result["tailorUsed"] = tailor_used
        result["tailorRemaining"] = max(0, AI_MONTHLY_LIMIT - tailor_used)

    return resp(200, result)


def handler(event, context):
    method = (
        event.get("httpMethod")
        or event.get("requestContext", {}).get("http", {}).get("method", "")
    ).upper()
    path = event.get("path", "") or event.get("rawPath", "")

    if method == "OPTIONS":
        return resp(200, {})

    user_id = get_user_id(event)
    if user_id:
        profile = get_user_profile(user_id)
        if profile.get("blocked"):
            return resp(403, {"error": "Account suspended", "code": "ACCOUNT_SUSPENDED"})

    if method == "GET" and "/quota" in path:
        return get_quota_status(event)

    if method == "GET":
        return get_my_swipes(event)

    if method == "POST":
        return create_swipe(event)

    if method == "DELETE":
        return delete_swipe(event)

    return resp(405, {"message": f"Method {method} not allowed"})
