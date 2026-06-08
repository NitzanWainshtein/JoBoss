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
SUBS_TABLE    = os.getenv("SUBS_TABLE",    "joboss-subscriptions")
IMPORTER_FN   = os.getenv("IMPORTER_FN",  "joboss-jobs-importer")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
lam      = boto3.client("lambda",    region_name=REGION)
ses      = boto3.client("ses",       region_name=REGION)
SES_SENDER = os.getenv("SES_SENDER", "joboss.appteam@gmail.com")

users_table  = dynamodb.Table(USERS_TABLE)
apps_table   = dynamodb.Table(APPS_TABLE)
swipes_table = dynamodb.Table(SWIPES_TABLE)
jobs_table   = dynamodb.Table(JOBS_TABLE)
subs_table   = dynamodb.Table(SUBS_TABLE)


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

    users = scan_all(users_table,
                     ProjectionExpression="userId, #p, createdAt, lastActiveAt, aiTailoringsUsed",
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
    new_users_this_week = sum(1 for u in users if date_of(u) >= this_week)

    plan_counts = {}
    for u in users:
        p = u.get("plan", "FREE")
        plan_counts[p] = plan_counts.get(p, 0) + 1

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
        "newUsersThisWeek": new_users_this_week,
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
    now = datetime.now(timezone.utc).isoformat()
    # Update both tables
    users_table.update_item(
        Key={"userId": user_id},
        UpdateExpression="SET #p = :p",
        ExpressionAttributeNames={"#p": "plan"},
        ExpressionAttributeValues={":p": new_plan},
    )
    subs_status = "FREE" if new_plan == "FREE" else "ACTIVE"
    try:
        subs_table.update_item(
            Key={"userId": user_id},
            UpdateExpression="SET #p = :p, #s = :s, updatedAt = :t",
            ExpressionAttributeNames={"#p": "plan", "#s": "status"},
            ExpressionAttributeValues={":p": new_plan, ":s": subs_status, ":t": now},
        )
    except Exception as e:
        print(f"[UPDATE_PLAN] subs update failed: {e}")
    return resp(200, {"success": True, "plan": new_plan})


def handle_reset_user_quota(admin_id, user_id):
    log_action(admin_id, "RESET_QUOTA", f"userId={user_id}")
    users_table.update_item(
        Key={"userId": user_id},
        UpdateExpression="SET dailySwipesUsed = :z, aiTailoringsUsed = :z, aiTailoringsMonth = :m",
        ExpressionAttributeValues={":z": 0, ":m": ""},
    )
    return resp(200, {"success": True})


def _send_block_email(user_email, blocked):
    if not user_email:
        return
    if blocked:
        subject = "הודעה חשובה מ-JoBoss - חשבונך הושהה"
        body = (
            "שלום,\n\n"
            "חשבונך ב-JoBoss הושהה על ידי צוות האדמין.\n\n"
            "לפרטים נוספים ולבירור ניתן לפנות לצוות JoBoss:\n"
            "joboss.appteam@gmail.com\n\n"
            "בברכה,\nצוות JoBoss"
        )
    else:
        subject = "הודעה מ-JoBoss - חשבונך שוחרר"
        body = (
            "שלום,\n\n"
            "חשבונך ב-JoBoss שוחרר והינו פעיל מחדש.\n\n"
            "כעת ניתן להתחבר ולהמשיך להשתמש בשירות.\n\n"
            "בברכה,\nצוות JoBoss"
        )
    try:
        ses.send_email(
            Source=SES_SENDER,
            Destination={"ToAddresses": [user_email]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body":    {"Text": {"Data": body,    "Charset": "UTF-8"}},
            },
        )
    except Exception as e:
        print(f"SES send failed: {e}")


def handle_block_user(admin_id, user_id, body):
    blocked = body.get("blocked", True)
    log_action(admin_id, "BLOCK_USER" if blocked else "UNBLOCK_USER", f"userId={user_id}")
    user_record = users_table.get_item(Key={"userId": user_id}).get("Item", {})
    users_table.update_item(
        Key={"userId": user_id},
        UpdateExpression="SET blocked = :b",
        ExpressionAttributeValues={":b": blocked},
    )
    _send_block_email(user_record.get("email", ""), blocked)
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

def handle_reset_my_swipes(admin_id):
    """Delete all swipe records for admin — lets them see all jobs again."""
    log_action(admin_id, "RESET_MY_SWIPES")
    deleted = 0
    try:
        result = swipes_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("userId").eq(admin_id)
        )
        with swipes_table.batch_writer() as batch:
            for item in result.get("Items", []):
                batch.delete_item(Key={"userId": item["userId"], "jobId": item["jobId"]})
                deleted += 1
    except Exception as e:
        print(f"[RESET_SWIPES] {e}")
        return resp(500, {"error": str(e)})
    return resp(200, {"success": True, "deleted": deleted})


def handle_reset_my_quota(admin_id, body):
    plan = body.get("plan", "").upper()
    log_action(admin_id, "RESET_MY_QUOTA", f"plan={plan or 'keep'}")
    now = datetime.now(timezone.utc).isoformat()

    # 1. Update joboss-users
    user_expr = "SET dailySwipesUsed = :z, aiTailoringsUsed = :z, aiTailoringsMonth = :m"
    user_vals = {":z": 0, ":m": ""}
    if plan in ("FREE", "PREMIUM", "PREMIUM_PLUS"):
        user_expr += ", #p = :p"
        user_vals[":p"] = plan
        users_table.update_item(
            Key={"userId": admin_id},
            UpdateExpression=user_expr,
            ExpressionAttributeNames={"#p": "plan"},
            ExpressionAttributeValues=user_vals,
        )
    else:
        users_table.update_item(
            Key={"userId": admin_id},
            UpdateExpression=user_expr,
            ExpressionAttributeValues=user_vals,
        )
        # Get current plan from users table if not provided
        item = users_table.get_item(Key={"userId": admin_id}).get("Item", {})
        plan = item.get("plan", "FREE")

    # 2. Update joboss-subscriptions (what SwipePage and ProfilePage actually read)
    # status must be "ACTIVE" for paid plans, "FREE" for free tier
    subs_status = "FREE" if plan == "FREE" else "ACTIVE"
    try:
        subs_table.update_item(
            Key={"userId": admin_id},
            UpdateExpression="SET #p = :p, #s = :s, dailyApplications = :z, updatedAt = :t",
            ExpressionAttributeNames={"#p": "plan", "#s": "status"},
            ExpressionAttributeValues={":p": plan, ":s": subs_status, ":z": 0, ":t": now},
        )
    except Exception as e:
        print(f"[RESET_QUOTA] subs update failed: {e}")

    return resp(200, {"success": True, "plan": plan})


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

        if method == "POST" and path.endswith("/admin/reset-my-swipes"):
            return handle_reset_my_swipes(admin_id)

        return resp(404, {"error": f"Unknown admin route: {method} {path}"})

    except ClientError as e:
        print(f"[ADMIN_ERROR] ClientError: {e}")
        return resp(500, {"error": "AWS service error", "details": str(e)})
    except Exception as e:
        print(f"[ADMIN_ERROR] {type(e).__name__}: {e}")
        return resp(500, {"error": "Internal error", "details": str(e)})
