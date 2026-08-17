# JoBoss features:
# - F-14: Admin Dashboard & Statistics
# - F-15: Admin User Management
# - F-16: Admin Job Management

import json
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError

REGION        = os.getenv("AWS_REGION", "us-east-1")
USERS_TABLE   = os.getenv("USERS_TABLE",   "joboss-users")
APPS_TABLE    = os.getenv("APPS_TABLE",    "joboss-applications")
SWIPES_TABLE  = os.getenv("SWIPES_TABLE",  "joboss-swipes")
JOBS_TABLE    = os.getenv("JOBS_TABLE",    "joboss-jobs")
SUBS_TABLE    = os.getenv("SUBS_TABLE",    "joboss-subscriptions")
IMPORTER_FN   = os.getenv("IMPORTER_FN",  "joboss-jobs-importer")
IMPORT_RUN_WINDOW_SECS = 240  # generous: observed runs take 45-190s

USER_POOL_ID  = os.getenv("USER_POOL_ID",  "us-east-1_a8enAwcyl")
APP_CLIENT_ID = os.getenv("APP_CLIENT_ID", "5o1mg9dtkh7kjuvqu145oafv00")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
lam      = boto3.client("lambda",    region_name=REGION)
ses      = boto3.client("ses",       region_name=REGION)
cognito  = boto3.client("cognito-idp", region_name=REGION)
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


# CORS: reflect the request Origin only when allowlisted (CloudFront prod +
# local dev). The Chrome extension is unaffected — host_permissions bypass CORS.
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://d231wno34rvped.cloudfront.net")
ALLOWED_ORIGINS = {FRONTEND_URL, "http://localhost:5173"}
_cors_origin = FRONTEND_URL


def _set_cors_origin(event):
    global _cors_origin
    headers = event.get("headers") or {}
    origin = headers.get("origin") or headers.get("Origin") or ""
    _cors_origin = origin if origin in ALLOWED_ORIGINS else FRONTEND_URL


def resp(code, body):
    return {
        "statusCode": code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": _cors_origin,
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
    # Identity must come from the API Gateway Cognito authorizer claims.
    # (Decoding the Authorization header without signature verification would
    # let a forged token impersonate an admin if a route is ever exposed.)
    return get_claims(event).get("sub")


def get_cognito_username_by_sub(sub):
    """Return the actual Cognito Username for a given sub (UUID)."""
    try:
        r = cognito.list_users(
            UserPoolId=USER_POOL_ID,
            Filter=f'sub = "{sub}"',
            Limit=1,
        )
        users = r.get("Users", [])
        return users[0]["Username"] if users else None
    except Exception as e:
        print(f"[GET_USERNAME] {e}")
        return None


def is_admin(event):
    # Fast path: JWT claims (works when token was issued after group assignment)
    claims = get_claims(event)
    groups = claims.get("cognito:groups", "") or ""
    if isinstance(groups, list):
        if "ADMIN" in groups:
            return True
    elif "ADMIN" in [g.strip() for g in groups.split(",") if g.strip()]:
        return True

    # Fallback: check Cognito directly (handles tokens issued before group was assigned)
    user_id = get_user_id_from_token(event)
    if not user_id:
        return False
    try:
        username = get_cognito_username_by_sub(user_id)
        if not username:
            return False
        resp_groups = cognito.admin_list_groups_for_user(
            Username=username,
            UserPoolId=USER_POOL_ID,
        )
        return any(g["GroupName"] == "ADMIN" for g in resp_groups.get("Groups", []))
    except Exception as e:
        print(f"[IS_ADMIN_FALLBACK] {e}")
        return False


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
    this_week = (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d")
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


def get_admin_emails():
    admin_emails = set()
    kwargs = {"UserPoolId": USER_POOL_ID, "GroupName": "ADMIN"}
    while True:
        try:
            r = cognito.list_users_in_group(**kwargs)
        except Exception:
            break
        for u in r.get("Users", []):
            for attr in u.get("Attributes", []):
                if attr["Name"] == "email":
                    admin_emails.add(attr["Value"].lower())
        next_token = r.get("NextToken")
        if not next_token:
            break
        kwargs["NextToken"] = next_token
    return admin_emails


def handle_list_users(admin_id):
    log_action(admin_id, "LIST_USERS")
    users = scan_all(users_table)
    admin_emails = get_admin_emails()

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
        safe["isAdmin"]       = (safe.get("email", "").lower() in admin_emails)
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
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    users_table.update_item(
        Key={"userId": user_id},
        UpdateExpression="SET dailySwipesUsed = :z, aiTailoringsUsed = :z, aiTailoringsMonth = :m, quotaResetAt = :now",
        ExpressionAttributeValues={":z": 0, ":m": "", ":now": now},
    )
    return resp(200, {"success": True})


def _send_block_email(user_email, blocked):
    if not user_email:
        return

    if blocked:
        subject = "הודעה חשובה מ-JoBoss - חשבונך הושהה"
        html = """
<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;color:#1E2A4A;line-height:1.8;max-width:480px;margin:0 auto;text-align:right;">
  <p>שלום,</p>
  <p>חשבונך ב-JoBoss <strong>הושהה</strong> על ידי צוות האדמין.</p>
  <p>לפרטים נוספים ולבירור ניתן לפנות לצוות JoBoss:</p>
  <p><a href="mailto:joboss.appteam@gmail.com" style="color:#6C4FD4;">joboss.appteam@gmail.com</a></p>
  <br/>
  <p>בברכה,<br/>צוות JoBoss</p>
</div>"""
        text = "שלום,\n\nחשבונך ב-JoBoss הושהה על ידי צוות האדמין.\n\nלפרטים: joboss.appteam@gmail.com\n\nבברכה,\nצוות JoBoss"
    else:
        subject = "הודעה מ-JoBoss - חשבונך שוחרר"
        html = """
<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;color:#1E2A4A;line-height:1.8;max-width:480px;margin:0 auto;text-align:right;">
  <p>שלום,</p>
  <p>חשבונך ב-JoBoss <strong>שוחרר</strong> והינו פעיל מחדש.</p>
  <p>כעת ניתן להתחבר ולהמשיך להשתמש בשירות.</p>
  <br/>
  <p>בברכה,<br/>צוות JoBoss</p>
</div>"""
        text = "שלום,\n\nחשבונך ב-JoBoss שוחרר והינו פעיל מחדש.\n\nבברכה,\nצוות JoBoss"

    try:
        ses.send_email(
            Source=SES_SENDER,
            Destination={"ToAddresses": [user_email]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {
                    "Text": {"Data": text, "Charset": "UTF-8"},
                    "Html": {"Data": html, "Charset": "UTF-8"},
                },
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
    if blocked:
        # Revoke refresh tokens so the user (and the Chrome extension) can't
        # keep using the account once the current access token expires.
        try:
            username = get_cognito_username_by_sub(user_id)
            if username:
                cognito.admin_user_global_sign_out(UserPoolId=USER_POOL_ID, Username=username)
        except Exception as e:
            print(f"[BLOCK_USER] global sign out failed: {e}")
    _send_block_email(user_record.get("email", ""), blocked)
    return resp(200, {"success": True, "blocked": blocked})


def handle_grant_admin(admin_id, user_id, body):
    password = body.get("password", "")
    if not password:
        return resp(400, {"error": "Password required"})

    # Verify the requesting admin's own password via Cognito
    admin_record = users_table.get_item(Key={"userId": admin_id}).get("Item", {})
    admin_email = admin_record.get("email", "")
    if not admin_email:
        return resp(400, {"error": "Admin email not found"})
    try:
        cognito.initiate_auth(
            ClientId=APP_CLIENT_ID,
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={"USERNAME": admin_email, "PASSWORD": password},
        )
    except cognito.exceptions.NotAuthorizedException:
        return resp(401, {"error": "סיסמה שגויה"})
    except Exception as e:
        return resp(500, {"error": f"Password verification failed: {str(e)}"})

    # Add target user to ADMIN Cognito group — look up by sub to get actual username
    user_record = users_table.get_item(Key={"userId": user_id}).get("Item", {})
    target_email = user_record.get("email", "")
    if not target_email:
        return resp(404, {"error": "User not found"})
    target_username = get_cognito_username_by_sub(user_id)
    if not target_username:
        return resp(404, {"error": "Cognito user not found"})
    try:
        cognito.admin_add_user_to_group(
            UserPoolId=USER_POOL_ID,
            Username=target_username,
            GroupName="ADMIN",
        )
    except Exception as e:
        return resp(500, {"error": f"Failed to grant admin: {str(e)}"})

    log_action(admin_id, "GRANT_ADMIN", f"targetUserId={user_id} targetEmail={target_email}")
    return resp(200, {"success": True, "email": target_email})


def handle_revoke_admin(admin_id, user_id, body):
    password = body.get("password", "")
    if not password:
        return resp(400, {"error": "Password required"})

    admin_record = users_table.get_item(Key={"userId": admin_id}).get("Item", {})
    admin_email = admin_record.get("email", "")
    if not admin_email:
        return resp(400, {"error": "Admin email not found"})
    try:
        cognito.initiate_auth(
            ClientId=APP_CLIENT_ID,
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={"USERNAME": admin_email, "PASSWORD": password},
        )
    except cognito.exceptions.NotAuthorizedException:
        return resp(401, {"error": "סיסמה שגויה"})
    except Exception as e:
        return resp(500, {"error": f"Password verification failed: {str(e)}"})

    # Prevent removing the last admin
    admin_emails = get_admin_emails()
    if len(admin_emails) <= 1:
        return resp(409, {"error": "לא ניתן להסיר את האדמין האחרון במערכת"})

    user_record = users_table.get_item(Key={"userId": user_id}).get("Item", {})
    target_email = user_record.get("email", "")
    if not target_email:
        return resp(404, {"error": "User not found"})
    target_username = get_cognito_username_by_sub(user_id)
    if not target_username:
        return resp(404, {"error": "Cognito user not found"})
    try:
        cognito.admin_remove_user_from_group(
            UserPoolId=USER_POOL_ID,
            Username=target_username,
            GroupName="ADMIN",
        )
    except Exception as e:
        return resp(500, {"error": f"Failed to revoke admin: {str(e)}"})

    log_action(admin_id, "REVOKE_ADMIN", f"targetUserId={user_id} targetEmail={target_email}")
    return resp(200, {"success": True, "email": target_email})


def handle_delete_user(admin_id, user_id):
    log_action(admin_id, "DELETE_USER", f"userId={user_id}")

    user_record = users_table.get_item(Key={"userId": user_id}).get("Item", {})
    email = user_record.get("email", "")

    # Delete from Cognito so the user can no longer log in.
    # Look up the real Username by sub (it isn't necessarily the email).
    username = get_cognito_username_by_sub(user_id) or email
    if username:
        try:
            cognito.admin_delete_user(UserPoolId=USER_POOL_ID, Username=username)
            print(f"Deleted Cognito user: {username}")
        except cognito.exceptions.UserNotFoundException:
            print(f"Cognito user not found (already deleted?): {username}")
        except Exception as e:
            print(f"Cognito delete failed: {e}")

    # Warn loudly if there's a live Stripe subscription — this Lambda has no
    # Stripe client, so billing must be cancelled via the Stripe dashboard.
    try:
        sub = subs_table.get_item(Key={"userId": user_id}).get("Item", {})
        if sub.get("stripeSubscriptionId") and sub.get("status") not in ("FREE", "CANCELLED"):
            print(f"[DELETE_USER] WARNING: user {user_id} has active Stripe "
                  f"subscription {sub['stripeSubscriptionId']} — cancel it in Stripe!")
    except Exception as e:
        print(f"[DELETE_USER] subs lookup failed: {e}")

    # Remove related records so they don't linger as orphans.
    try:
        subs_table.delete_item(Key={"userId": user_id})
    except Exception as e:
        print(f"[DELETE_USER] subs delete failed: {e}")

    for tbl in (swipes_table, apps_table):
        try:
            result = tbl.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key("userId").eq(user_id)
            )
            with tbl.batch_writer() as batch:
                for item in result.get("Items", []):
                    batch.delete_item(Key={"userId": item["userId"], "jobId": item["jobId"]})
        except Exception as e:
            print(f"[DELETE_USER] cleanup failed for {tbl.name}: {e}")

    users_table.delete_item(Key={"userId": user_id})
    return resp(200, {"success": True})


# ── jobs ──────────────────────────────────────────────────────────────────────

def handle_list_jobs(admin_id):
    log_action(admin_id, "LIST_JOBS")
    # The field is isActive, not active — the old projection asked for a name
    # that does not exist, so every job came back with no status at all.
    jobs = scan_all(jobs_table, ProjectionExpression=
                    "jobId, company, title, #loc, isActive, createdAt, #src, applyUrl",
                    ExpressionAttributeNames={"#loc": "location", "#src": "source"})

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

    jobs.sort(key=lambda j: j.get("createdAt", ""), reverse=True)
    return resp(200, {"jobs": jobs, "total": len(jobs)})


def handle_delete_jobs(admin_id, body):
    """Bulk delete. Also clears the swipes that referenced them, otherwise a
    user's history points at jobs that no longer exist."""
    job_ids = body.get("jobIds") or []
    if not isinstance(job_ids, list) or not job_ids:
        return resp(400, {"error": "jobIds required"})
    if len(job_ids) > 200:
        return resp(400, {"error": "too many at once (max 200)"})

    log_action(admin_id, "DELETE_JOBS", f"count={len(job_ids)}")

    deleted = 0
    with jobs_table.batch_writer() as batch:
        for jid in job_ids:
            batch.delete_item(Key={"jobId": jid})
            deleted += 1

    # Best effort: a failure here must not make the delete look unsuccessful.
    swipes_removed = 0
    try:
        targets = set(job_ids)
        stale = [sw for sw in scan_all(swipes_table, ProjectionExpression="userId, jobId")
                 if sw.get("jobId") in targets]
        with swipes_table.batch_writer() as batch:
            for sw in stale:
                batch.delete_item(Key={"userId": sw["userId"], "jobId": sw["jobId"]})
                swipes_removed += 1
    except Exception as e:
        print(f"[ADMIN_ERROR] swipe cleanup after job delete: {e}")

    return resp(200, {"success": True, "deleted": deleted, "swipesRemoved": swipes_removed})


def handle_list_pending_review_jobs(admin_id):
    """Jobs the automated closure checker (F-18) could not confidently classify
    after 2 consecutive full-pipeline attempts (Tier 1 HTTP + Tier 2 Playwright) —
    see backend/lambdas/jobs_status_checker/jobs_repository.py's module docstring
    for the full state machine. These are neither auto-deleted nor auto-kept;
    an admin resolves each via handle_resolve_job_review below."""
    log_action(admin_id, "LIST_PENDING_REVIEW_JOBS")
    jobs = scan_all(
        jobs_table,
        FilterExpression=Attr("reviewStatus").eq("pending_review"),
        ProjectionExpression=(
            "jobId, company, title, #loc, applyUrl, reviewReason, "
            "reviewFlaggedAt, checkFailCount, createdAt"
        ),
        ExpressionAttributeNames={"#loc": "location"},
    )
    jobs.sort(key=lambda j: j.get("reviewFlaggedAt", ""), reverse=True)
    return resp(200, {"jobs": jobs, "total": len(jobs)})


def handle_resolve_job_review(admin_id, job_id, body):
    """Admin verdict on a pending-review job.

    action="delete": the admin manually confirmed the posting is gone — delete it,
    same as an automated "closed" verdict would have.
    action="keep": the admin confirmed it is still open (or the check itself was
    the problem — a site that always blocks bots, say). Clears every field the
    checker uses, so it resumes normal daily checking from a clean slate rather
    than immediately re-escalating on the next inconclusive result.
    """
    action = (body.get("action") or "").lower()
    if action not in ("delete", "keep"):
        return resp(400, {"error": "action must be 'delete' or 'keep'"})

    item = jobs_table.get_item(Key={"jobId": job_id}).get("Item")
    if not item:
        return resp(404, {"error": "Job not found"})
    if item.get("reviewStatus") != "pending_review":
        return resp(409, {"error": "Job is not pending review"})

    log_action(admin_id, "RESOLVE_JOB_REVIEW",
               f"jobId={job_id} action={action} title={item.get('title', '')!r}")

    if action == "delete":
        jobs_table.delete_item(Key={"jobId": job_id})
        return resp(200, {"success": True, "action": "delete", "jobId": job_id})

    jobs_table.update_item(
        Key={"jobId": job_id},
        UpdateExpression=(
            "SET checkFailCount = :zero "
            "REMOVE reviewStatus, reviewReason, reviewFlaggedAt, tier2Pending, lastCheckReason"
        ),
        ExpressionAttributeValues={":zero": 0},
    )
    return resp(200, {"success": True, "action": "keep", "jobId": job_id})


def handle_import_status(admin_id, since_iso):
    """How many jobs the run started at `since_iso` has inserted so far.

    Counted straight off createdAt rather than diffed against a snapshot of the
    table size. The previous version compared total/active counts taken at
    trigger time, which was wrong three ways even before it ran: it needed a
    state row the code never managed to write, that row would have been stored in
    the jobs table itself (inflating the very counts it was being compared
    against, and liable to be served to users as a bogus job), and the "removed"
    half measured TTL expiry and closure-checker deletions that happen to land in
    the same window — the importer only ever inserts, so it removes nothing.
    """
    if not since_iso:
        return resp(400, {"error": "since is required (ISO timestamp from the import trigger)"})

    try:
        started = datetime.fromisoformat(since_iso.replace("Z", "+00:00"))
    except ValueError:
        return resp(400, {"error": f"since is not an ISO timestamp: {since_iso}"})
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)

    added = 0
    for j in scan_all(jobs_table, ProjectionExpression="createdAt"):
        created = j.get("createdAt")
        if not created:
            continue
        try:
            when = datetime.fromisoformat(str(created).replace("Z", "+00:00"))
        except ValueError:
            continue
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        if when >= started:
            added += 1

    age = (datetime.now(timezone.utc) - started).total_seconds()
    return resp(200, {
        # The importer is invoked async and cannot report back, so "finished" can
        # only mean "long enough has passed that it must have". Until then the
        # count is reported as partial so the UI can show progress instead of a
        # blank spinner.
        "running": age < IMPORT_RUN_WINDOW_SECS,
        "ageSecs": int(age),
        "added": added,
        "since": started.isoformat(),
    })


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
        # Stamped before the invoke so a job inserted immediately cannot land
        # ahead of it. Returned to the caller, which passes it back to
        # import-status — a server timestamp, so a skewed browser clock cannot
        # make the run look empty. No state row is stored: the previous attempt to
        # keep one silently failed on every call (see handle_import_status).
        triggered_at = datetime.now(timezone.utc).isoformat()
        lam.invoke(FunctionName=IMPORTER_FN, InvocationType="Event", Payload=b"{}")
        return resp(200, {"success": True, "message": "Import triggered", "triggeredAt": triggered_at})
    except Exception as e:
        # Was returned to the client and never logged, so an AccessDenied here
        # looked identical to any other failure. JoBossLambdaRole has no
        # lambda:InvokeFunction, which is exactly what this catches.
        print(f"[ADMIN_ERROR] trigger_import failed: {type(e).__name__}: {e}")
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
    user_expr = ("SET dailySwipesUsed = :z, aiTailoringsUsed = :z, "
                 "aiTailoringsMonth = :m, quotaResetAt = :now")
    user_vals = {":z": 0, ":m": "", ":now": now.replace("+00:00", "Z")}
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
    _set_cors_origin(event)
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
        # Lightweight admin check — used by the frontend on app load instead of
        # hitting /admin/stats (which scans every table).
        if method == "GET" and path.endswith("/admin/ping"):
            return resp(200, {"admin": True})

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
            if "grant-admin" in path and method == "POST":
                return handle_grant_admin(admin_id, user_id, body)
            if "revoke-admin" in path and method == "POST":
                return handle_revoke_admin(admin_id, user_id, body)
            if method == "DELETE":
                return handle_delete_user(admin_id, user_id)

        # Jobs list
        if method == "GET" and path.endswith("/admin/jobs"):
            return handle_list_jobs(admin_id)

        if method == "GET" and path.endswith("/admin/jobs/import-status"):
            params = event.get("queryStringParameters") or {}
            return handle_import_status(admin_id, params.get("since"))

        # Jobs the automated closure checker (F-18) could not resolve on its own
        if method == "GET" and path.endswith("/admin/jobs/pending-review"):
            return handle_list_pending_review_jobs(admin_id)

        if method == "DELETE" and path.endswith("/admin/jobs"):
            return handle_delete_jobs(admin_id, body)

        # Trigger import
        if method == "POST" and path.endswith("/admin/jobs/import"):
            return handle_trigger_import(admin_id)

        # Admin verdict on a pending-review job
        if "/resolve-review" in path and method == "POST":
            parts = path.split("/")
            job_id = parts[parts.index("jobs") + 1] if "jobs" in parts else None
            if job_id:
                return handle_resolve_job_review(admin_id, job_id, body)

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
        return resp(500, {"error": "AWS service error"})
    except Exception as e:
        print(f"[ADMIN_ERROR] {type(e).__name__}: {e}")
        return resp(500, {"error": "Internal error"})
