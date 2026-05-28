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

CORS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
}

PLAN_LIMITS = {
    "FREE":         {"daily_applications": 5},
    "PREMIUM":      {"daily_applications": -1},
    "PREMIUM_PLUS": {"daily_applications": -1},
}


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
            return "FREE"
        status = sub.get("status", "EXPIRED")
        if status in ("ACTIVE", "TRIAL"):
            if status == "TRIAL":
                trial_end = int(sub.get("trialEndAt", 0))
                if datetime.now(timezone.utc).timestamp() > trial_end:
                    return "FREE"
            return sub.get("plan", "FREE")
        return "FREE"
    except Exception:
        return "FREE"


def count_today_applications(user_id):
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_iso = today.isoformat()
    tomorrow_iso = (today + timedelta(days=1)).isoformat()

    # Fetch items (not just COUNT) so we can log the matched dates
    result = applications_table.scan(
        FilterExpression=boto3.dynamodb.conditions.Attr("userId").eq(user_id)
        & boto3.dynamodb.conditions.Attr("createdAt").between(today_iso, tomorrow_iso),
        ConsistentRead=True,
        ProjectionExpression="createdAt",
    )
    items = result.get("Items", [])
    count = len(items)
    matched = sorted([item.get("createdAt", "?") for item in items])
    print(f"SCAN RESULT: today={today_iso}, tomorrow={tomorrow_iso}, count={count}, matched={matched}")
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

    if decision == "LIKE":
        plan = get_effective_plan(user_id)
        daily_limit = PLAN_LIMITS.get(plan, {}).get("daily_applications", 5)

        if daily_limit != -1:
            count = count_today_applications(user_id)
            if count >= daily_limit:
                return resp(429, {
                    "message": "Daily application limit reached",
                    "code": "LIMIT_REACHED",
                    "plan": plan,
                    "limit": daily_limit,
                    "used": count,
                    "remaining": 0,
                    "resetAt": get_reset_time(),
                })

        app_item = {
            "userId": user_id,
            "jobId": job_id,
            "company": body.get("company", ""),
            "title": body.get("title", ""),
            "status": "SUBMITTED",
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
        }
        applications_table.put_item(Item=app_item)

    swipe_item = {
        "userId": user_id,
        "jobId": job_id,
        "decision": decision,
        "swipedAt": now_iso(),
    }
    swipes_table.put_item(Item=swipe_item)

    plan = get_effective_plan(user_id)
    daily_limit = PLAN_LIMITS.get(plan, {}).get("daily_applications", 5)
    if daily_limit == -1:
        remaining = -1
    else:
        used = count_today_applications(user_id)
        remaining = max(0, daily_limit - used)

    return resp(201, {
        "message": "Swipe recorded",
        "decision": decision,
        "quota": {
            "plan": plan,
            "limit": daily_limit,
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

    swipes_table.delete_item(Key={"userId": user_id, "jobId": job_id})

    # joboss-applications uses (userId, jobId) composite key
    applications_table.delete_item(Key={"userId": user_id, "jobId": job_id})

    return resp(200, {"message": "Swipe undone"})


def get_quota_status(event):
    user_id = get_user_id(event)
    if not user_id:
        return resp(401, {"message": "Unauthorized"})

    plan = get_effective_plan(user_id)
    daily_limit = PLAN_LIMITS.get(plan, {}).get("daily_applications", 5)

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

    return resp(200, {
        "plan": plan,
        "limit": daily_limit,
        "used": used,
        "remaining": remaining,
        "unlimited": False,
        "resetAt": get_reset_time(),
    })


def handler(event, context):
    method = (
        event.get("httpMethod")
        or event.get("requestContext", {}).get("http", {}).get("method", "")
    ).upper()
    path = event.get("path", "") or event.get("rawPath", "")

    if method == "OPTIONS":
        return resp(200, {})

    if method == "GET" and "/quota" in path:
        return get_quota_status(event)

    if method == "GET":
        return get_my_swipes(event)

    if method == "POST":
        return create_swipe(event)

    if method == "DELETE":
        return delete_swipe(event)

    return resp(405, {"message": f"Method {method} not allowed"})
