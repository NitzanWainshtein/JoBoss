import base64
import json
import os
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError

REGION        = os.getenv("AWS_REGION", "us-east-1")
USERS_TABLE   = os.getenv("USERS_TABLE",   "joboss-users")
APPS_TABLE    = os.getenv("APPS_TABLE",    "joboss-applications")
SWIPES_TABLE  = os.getenv("SWIPES_TABLE",  "joboss-swipes")
JOBS_TABLE    = os.getenv("JOBS_TABLE",    "joboss-jobs")
USAGE_TABLE   = os.getenv("USAGE_TABLE",   "joboss-usage")
IMPORTER_FN   = os.getenv("IMPORTER_FN",  "joboss-jobs-importer")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
lam      = boto3.client("lambda",    region_name=REGION)

users_table  = dynamodb.Table(USERS_TABLE)
apps_table   = dynamodb.Table(APPS_TABLE)
swipes_table = dynamodb.Table(SWIPES_TABLE)
jobs_table   = dynamodb.Table(JOBS_TABLE)


# ── helpers ──────────────────────────────────────────────────────────────────

def decimal_to_native(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError


def resp(code, body):
    return {
        "statusCode": code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        },
        "body": json.dumps(body, default=decimal_to_native),
    }


def get_claims(event):
    return (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("claims", {})
    )


def get_user_id_from_token(event):
    claims = get_claims(event)
    uid = claims.get("sub")
    if uid:
        return uid
    headers = event.get("headers") or {}
    token = headers.get("Authorization") or headers.get("authorization") or ""
    token = token.replace("Bearer ", "", 1).strip()
    parts = token.split(".")
    if len(parts) < 2:
        return None
    try:
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        return json.loads(base64.urlsafe_b64decode(payload))["sub"]
    except Exception:
        return None


def is_admin(event):
    claims = get_claims(event)
    groups = claims.get("cognito:groups", "") or ""
    if isinstance(groups, list):
        return "ADMIN" in groups
    # API GW serialises list as comma-separated string
    return "ADMIN" in [g.strip() for g in groups.split(",")]


def log_action(admin_id, action, details=""):
    print(f"[ADMIN_AUDIT] admin={admin_id} action={action} details={details}")


def get_body(event):
    raw = event.get("body") or "{}"
    if isinstance(raw, str):
        return json.loads(raw)
    return raw


def scan_all(table, **kwargs):
    """Paginate through full table scan."""
    items = []
    while True:
        result = table.scan(**kwargs)
        items.extend(result.get("Items", []))
        if "LastEvaluatedKey" not in result:
            break
        kwargs["ExclusiveStartKey"] = result["LastEvaluatedKey"]
    return items


# ── stats ─────────────────────────────────────────────────────────────────────

def handle_stats(admin_id):
    log_action(admin_id, "GET_STATS")

    now = datetime.now(timezone.utc)
    today     = now.strftime("%Y-%m-%d")
    this_week = (now.replace(day=now.day - now.weekday())).strftime("%Y-%m-%d")
    this_month= now.strftime("%Y-%m")

    users = scan_all(users_table, ProjectionExpression="userId, #p, createdAt, lastActiveAt",
                     ExpressionAttributeNames={"#p": "plan"})

    apps  = scan_all(apps_table, ProjectionExpression="userId, jobId, createdAt, #s",
                     ExpressionAttributeNames={"#s": "status"})

    swipes = scan_all(swipes_table, ProjectionExpression="userId, jobId, decision, swipedAt")

    def date_of(item, field="createdAt"):
        v = item.get(field, "") or ""
        return v[:10]

    apps_today  = sum(1 for a in apps  if date_of(a) == today)
    apps_week   = sum(1 for a in apps  if date_of(a) >= this_week)
    apps_month  = sum(1 for a in apps  if date_of(a, "createdAt")[:7] == this_month)
    swipes_total= len(swipes)
    likes_total = sum(1 for s in swipes if s.get("decision") == "LIKE")

    ai_tailorings = sum(int(u.get("aiTailoringsUsed", 0) or 0) for u in users)

    plan_counts = {}
    for u in users:
        p = u.get("plan", "FREE")
        plan_counts[p] = plan_counts.get(p, 0) + 1

    conversion = round(len(apps) / likes_total * 100, 1) if likes_total else 0

    # Bedrock availability check
    try:
        bedrock = boto3.client("bedrock-runtime", region_name=REGION)
        bedrock_ok = True
    except Exception:
        bedrock_ok = False

    return resp(200, {
        "totalUsers": len(users),
        "planBreakdown": plan_counts,
        "appsToday": apps_today,
        "appsThisWeek": apps_week,
        "appsThisMonth": apps_month,
        "totalApps": len(apps),
        "totalSwipes": swipes_total,
        "totalLikes": likes_total,
        "aiTailoringsTotal": ai_tailorings,
        "conversionRate": conversion,
        "bedrockAvailable": bedrock_ok,
        "generatedAt": now.isoformat(),
    })


# ── users ─────────────────────────────────────────────────────────────────────

SAFE_USER_FIELDS = {
    "userId", "fullName", "email", "plan", "createdAt", "lastActiveAt",
    "blocked", "aiTailoringsUsed", "aiTailoringsMonth", "dailySwipesUsed",
    "preferredLocation", "experienceLevel",
}


def safe_user(u):
    base = {k: v for k, v in u.items() if k in SAFE_USER_FIELDS}
    return base


def handle_list_users(admin_id):
    log_action(admin_id, "LIST_USERS")
    users = scan_all(users_table)

    app_counts = {}
    all_apps = scan_all(apps_table, ProjectionExpression="userId, #s",
                        ExpressionAttributeNames={"#s": "status"})
    for a in all_apps:
        uid = a.get("userId", "")
        app_counts.setdefault(uid, {"total": 0, "ACCEPTED": 0, "REJECTED": 0})
        app_counts[uid]["total"] += 1
        s = (a.get("status") or "").upper()
        if s in ("ACCEPTED", "REJECTED"):
            app_counts[uid][s] += 1

    result = []
    for u in users:
        safe = safe_user(u)
        uid = safe.get("userId", "")
        safe["appCount"]      = app_counts.get(uid, {}).get("total", 0)
        safe["acceptedCount"] = app_counts.get(uid, {}).get("ACCEPTED", 0)
        safe["rejectedCount"] = app_counts.get(uid, {}).get("REJECTED", 0)
        result.append(safe)

    result.sort(key=lambda u: u.get("createdAt", ""), reverse=True)
    return resp(200, {"users": result, "total": len(result)})


def handle_update_user_plan(admin_id, user_id, body):
    new_plan = body.get("plan", "").upper()
    if new_plan not in ("FREE", "PREMIUM", "PREMIUM_PLUS"):
        return resp(400, {"error": "Invalid plan"})
    log_action(admin_id, "UPDATE_PLAN", f"userId={user_id} plan={new_plan}")
    users_table.update_item(
        Key={"userId": user_id},
        UpdateExpression="SET #p = :p",
        ExpressionAttributeNames={"#p": "plan"},
        ExpressionAttributeValues={":p": new_plan},
    )
    return resp(200, {"success": True, "plan": new_plan})


def handle_reset_user_quota(admin_id, user_id):
    log_action(admin_id, "RESET_QUOTA", f"userId={user_id}")
    users_table.update_item(
        Key={"userId": user_id},
        UpdateExpression="SET dailySwipesUsed = :z, aiTailoringsUsed = :z, aiTailoringsMonth = :m",
        ExpressionAttributeValues={":z": 0, ":m": ""},
    )
    return resp(200, {"success": True})


def handle_block_user(admin_id, user_id, body):
    blocked = body.get("blocked", True)
    log_action(admin_id, "BLOCK_USER" if blocked else "UNBLOCK_USER", f"userId={user_id}")
    users_table.update_item(
        Key={"userId": user_id},
        UpdateExpression="SET blocked = :b",
        ExpressionAttributeValues={":b": blocked},
    )
    return resp(200, {"success": True, "blocked": blocked})


def handle_delete_user(admin_id, user_id):
    log_action(admin_id, "DELETE_USER", f"userId={user_id}")
    users_table.delete_item(Key={"userId": user_id})
    return resp(200, {"success": True})


# ── jobs ──────────────────────────────────────────────────────────────────────

def handle_list_jobs(admin_id):
    log_action(admin_id, "LIST_JOBS")
    jobs = scan_all(jobs_table, ProjectionExpression=
                    "jobId, company, title, #loc, active, createdAt",
                    ExpressionAttributeNames={"#loc": "location"})

    swipe_counts = {}
    all_swipes = scan_all(swipes_table, ProjectionExpression="jobId, decision")
    for s in all_swipes:
        jid = s.get("jobId", "")
        swipe_counts.setdefault(jid, {"likes": 0, "passes": 0})
        if s.get("decision") == "LIKE":
            swipe_counts[jid]["likes"] += 1
        else:
            swipe_counts[jid]["passes"] += 1

    for j in jobs:
        jid = j.get("jobId", "")
        j["likes"]  = swipe_counts.get(jid, {}).get("likes", 0)
        j["passes"] = swipe_counts.get(jid, {}).get("passes", 0)

    jobs.sort(key=lambda j: j.get("likes", 0), reverse=True)
    return resp(200, {"jobs": jobs, "total": len(jobs)})


def handle_toggle_job(admin_id, job_id, body):
    active = body.get("active")
    if active is None:
        item = jobs_table.get_item(Key={"jobId": job_id}).get("Item", {})
        active = not item.get("active", True)
    log_action(admin_id, "TOGGLE_JOB", f"jobId={job_id} active={active}")
    jobs_table.update_item(
        Key={"jobId": job_id},
        UpdateExpression="SET active = :a",
        ExpressionAttributeValues={":a": active},
    )
    return resp(200, {"success": True, "active": active})


def handle_trigger_import(admin_id):
    log_action(admin_id, "TRIGGER_IMPORT")
    try:
        lam.invoke(FunctionName=IMPORTER_FN, InvocationType="Event", Payload=b"{}")
        return resp(200, {"success": True, "message": "Import triggered"})
    except Exception as e:
        return resp(500, {"error": str(e)})


# ── admin self-service ────────────────────────────────────────────────────────

def handle_reset_my_quota(admin_id, body):
    plan = body.get("plan", "").upper()
    log_action(admin_id, "RESET_MY_QUOTA", f"plan={plan or 'keep'}")
    update_expr = "SET dailySwipesUsed = :z, aiTailoringsUsed = :z, aiTailoringsMonth = :m"
    expr_vals   = {":z": 0, ":m": ""}
    if plan in ("FREE", "PREMIUM", "PREMIUM_PLUS"):
        update_expr += ", #p = :p"
        expr_vals[":p"] = plan
        users_table.update_item(
            Key={"userId": admin_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames={"#p": "plan"},
            ExpressionAttributeValues=expr_vals,
        )
    else:
        users_table.update_item(
            Key={"userId": admin_id},
            UpdateExpression=update_expr,
            ExpressionAttributeValues=expr_vals,
        )
    return resp(200, {"success": True})


# ── router ────────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    method = (event.get("httpMethod") or
              event.get("requestContext", {}).get("http", {}).get("method", "GET")).upper()

    if method == "OPTIONS":
        return resp(200, {"message": "OK"})

    if not is_admin(event):
        return resp(403, {"error": "Admin access required"})

    admin_id = get_user_id_from_token(event) or "unknown"
    path = (event.get("path") or event.get("rawPath") or "").rstrip("/")
    body = get_body(event)

    try:
        # Stats
        if method == "GET" and path.endswith("/admin/stats"):
            return handle_stats(admin_id)

        # Users list
        if method == "GET" and path.endswith("/admin/users"):
            return handle_list_users(admin_id)

        # User actions
        if "/admin/users/" in path:
            parts = path.split("/")
            user_id = parts[parts.index("users") + 1] if "users" in parts else None
            if not user_id:
                return resp(400, {"error": "userId missing"})

            if "reset-quota" in path and method == "POST":
                return handle_reset_user_quota(admin_id, user_id)
            if "block" in path and method == "PUT":
                return handle_block_user(admin_id, user_id, body)
            if "plan" in path and method == "PUT":
                return handle_update_user_plan(admin_id, user_id, body)
            if method == "DELETE":
                return handle_delete_user(admin_id, user_id)

        # Jobs list
        if method == "GET" and path.endswith("/admin/jobs"):
            return handle_list_jobs(admin_id)

        # Trigger import
        if method == "POST" and path.endswith("/admin/jobs/import"):
            return handle_trigger_import(admin_id)

        # Toggle job
        if "/admin/jobs/" in path and method == "PUT":
            parts = path.split("/")
            job_id = parts[parts.index("jobs") + 1] if "jobs" in parts else None
            if job_id:
                return handle_toggle_job(admin_id, job_id, body)

        # Admin self reset
        if method == "POST" and path.endswith("/admin/reset-my-quota"):
            return handle_reset_my_quota(admin_id, body)

        return resp(404, {"error": f"Unknown admin route: {method} {path}"})

    except ClientError as e:
        print(f"[ADMIN_ERROR] ClientError: {e}")
        return resp(500, {"error": "AWS service error", "details": str(e)})
    except Exception as e:
        print(f"[ADMIN_ERROR] {type(e).__name__}: {e}")
        return resp(500, {"error": "Internal error", "details": str(e)})
