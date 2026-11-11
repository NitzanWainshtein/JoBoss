# JoBoss feature: Contact / support tickets (user side).
#
#   GET  /support   -> the caller's own tickets (newest first) + unread-reply count
#   POST /support   -> open a ticket {category, subject, message}; emails the team
#   PUT  /support   -> mark the caller's replies as read {ticketId}
#
# The user can only ever read their own tickets and can only write the opening
# message: the conversation after that is admin replies only (admin side lives in
# backend/lambdas/admin/handler.py under /admin/support).
#
# Table: joboss-support-tickets   PK userId (S)   SK ticketId (S)

import html
import json
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

REGION        = os.getenv("AWS_REGION", "us-east-1")
TICKETS_TABLE = os.getenv("SUPPORT_TABLE", "joboss-support-tickets")
SES_SENDER    = os.getenv("SES_SENDER", "joboss.appteam@gmail.com")
SUPPORT_INBOX = os.getenv("SUPPORT_INBOX", "joboss.appteam@gmail.com")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
ses      = boto3.client("ses", region_name=REGION)
tickets_table = dynamodb.Table(TICKETS_TABLE)

CATEGORIES = {"bug", "account", "billing", "jobs", "suggestion", "other"}
STATUSES   = ("NEW", "IN_PROGRESS", "RESOLVED")
MAX_SUBJECT = 120
MAX_MESSAGE = 4000
# Abuse guard: a person can open at most this many tickets per rolling day.
DAILY_TICKET_LIMIT = 10

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://d231wno34rvped.cloudfront.net")
ALLOWED_ORIGINS = {FRONTEND_URL, "http://localhost:5173"}
_cors_origin = FRONTEND_URL


def _decimal(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError


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
            "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
        },
        "body": json.dumps(body, default=_decimal, ensure_ascii=False),
    }


def _claims(event):
    return event.get("requestContext", {}).get("authorizer", {}).get("claims", {}) or {}


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def new_ticket_id(now=None):
    """Sortable by time (newest last lexically) and URL-safe."""
    now = now or _now()
    return f"{now.strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:8]}"


def _clean(text, limit):
    text = (text or "").replace("\r\n", "\n").strip()
    # Drop control characters other than newline/tab.
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    return text[:limit]


def validate_new_ticket(body):
    """Return (clean_fields, error_message)."""
    category = (body.get("category") or "other").strip().lower()
    if category not in CATEGORIES:
        category = "other"
    subject = _clean(body.get("subject"), MAX_SUBJECT)
    message = _clean(body.get("message"), MAX_MESSAGE)
    if len(subject) < 2:
        return None, "subject is required"
    if len(message) < 5:
        return None, "message is too short"
    return {"category": category, "subject": subject, "message": message}, None


def public_ticket(item):
    """What the reporting user may see (no internal flags)."""
    return {
        "ticketId":  item.get("ticketId"),
        "category":  item.get("category"),
        "subject":   item.get("subject"),
        "status":    item.get("status", "NEW"),
        "createdAt": item.get("createdAt"),
        "updatedAt": item.get("updatedAt"),
        "messages":  item.get("messages", []),
        "unread":    bool(item.get("userUnread")),
    }


def _query_user_tickets(user_id):
    items, kwargs = [], {"KeyConditionExpression": Key("userId").eq(user_id)}
    while True:
        r = tickets_table.query(**kwargs)
        items.extend(r.get("Items", []))
        if "LastEvaluatedKey" not in r:
            return items
        kwargs["ExclusiveStartKey"] = r["LastEvaluatedKey"]


def _send_team_email(item):
    """Best effort: a failed email must never lose the ticket (it is already saved)."""
    who = item.get("userName") or item.get("userEmail") or item["userId"]
    subject = f"[JoBoss support] {item['subject']}"
    text = (
        f"New support ticket\n\n"
        f"From: {who} <{item.get('userEmail', '')}>\n"
        f"User ID: {item['userId']}\n"
        f"Category: {item['category']}\n"
        f"Ticket: {item['ticketId']}\n\n"
        f"{item['messages'][0]['text']}\n\n"
        f"Reply from the JoBoss admin panel -> Reports."
    )
    body_html = (
        '<div dir="auto" style="font-family:Arial,sans-serif;font-size:14px;color:#1E2A4A;line-height:1.7">'
        f"<p><b>New support ticket</b></p>"
        f"<p>From: {html.escape(who)} &lt;{html.escape(item.get('userEmail', ''))}&gt;<br/>"
        f"Category: {html.escape(item['category'])}<br/>Ticket: {html.escape(item['ticketId'])}</p>"
        f"<p><b>{html.escape(item['subject'])}</b></p>"
        f"<p style=\"white-space:pre-wrap\">{html.escape(item['messages'][0]['text'])}</p>"
        "<p style=\"color:#888\">Reply from the JoBoss admin panel &rarr; Reports.</p></div>"
    )
    kwargs = {
        "Source": SES_SENDER,
        "Destination": {"ToAddresses": [SUPPORT_INBOX]},
        "Message": {
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {"Text": {"Data": text, "Charset": "UTF-8"},
                     "Html": {"Data": body_html, "Charset": "UTF-8"}},
        },
    }
    if item.get("userEmail"):
        kwargs["ReplyToAddresses"] = [item["userEmail"]]
    try:
        ses.send_email(**kwargs)
        return True
    except Exception as e:  # noqa: BLE001 — logged, never fatal
        print(f"[SUPPORT] SES send failed: {e}")
        return False


def handle_list(user_id):
    items = sorted(_query_user_tickets(user_id), key=lambda i: i.get("ticketId", ""), reverse=True)
    tickets = [public_ticket(i) for i in items]
    return resp(200, {"tickets": tickets, "unread": sum(1 for t in tickets if t["unread"])})


def handle_create(user_id, claims, body):
    fields, err = validate_new_ticket(body)
    if err:
        return resp(400, {"error": err, "message": err})

    now = _now()
    since = new_ticket_id(now - timedelta(days=1))[:14]
    recent = [i for i in _query_user_tickets(user_id) if i.get("ticketId", "")[:14] >= since]
    if len(recent) >= DAILY_TICKET_LIMIT:
        return resp(429, {"error": "too many tickets today", "code": "SUPPORT_RATE_LIMIT",
                          "message": "too many tickets today"})

    at = _iso(now)
    item = {
        "userId":     user_id,
        "ticketId":   new_ticket_id(now),
        "category":   fields["category"],
        "subject":    fields["subject"],
        "status":     "NEW",
        "createdAt":  at,
        "updatedAt":  at,
        "userEmail":  claims.get("email", ""),
        "userName":   claims.get("name", "") or claims.get("given_name", ""),
        "messages":   [{"from": "user", "text": fields["message"], "at": at}],
        "adminUnread": True,
        "userUnread":  False,
    }
    tickets_table.put_item(Item=item)
    emailed = _send_team_email(item)
    return resp(201, {"ticket": public_ticket(item), "emailed": emailed})


def handle_mark_read(user_id, body):
    ticket_id = (body.get("ticketId") or "").strip()
    if not ticket_id:
        return resp(400, {"error": "ticketId required"})
    try:
        tickets_table.update_item(
            Key={"userId": user_id, "ticketId": ticket_id},
            UpdateExpression="SET userUnread = :f",
            ConditionExpression="attribute_exists(ticketId)",
            ExpressionAttributeValues={":f": False},
        )
    except tickets_table.meta.client.exceptions.ConditionalCheckFailedException:
        return resp(404, {"error": "ticket not found"})
    return resp(200, {"ok": True})


def lambda_handler(event, context):
    _set_cors_origin(event)
    method = (event.get("httpMethod")
              or event.get("requestContext", {}).get("http", {}).get("method", "GET")).upper()
    if method == "OPTIONS":
        return resp(200, {"message": "OK"})

    claims = _claims(event)
    user_id = claims.get("sub")
    if not user_id:
        return resp(401, {"error": "Unauthorized"})

    try:
        body = json.loads(event.get("body") or "{}") if method in ("POST", "PUT") else {}
        if not isinstance(body, dict):
            body = {}
    except (ValueError, TypeError):
        return resp(400, {"error": "invalid JSON"})

    try:
        if method == "GET":
            return handle_list(user_id)
        if method == "POST":
            return handle_create(user_id, claims, body)
        if method == "PUT":
            return handle_mark_read(user_id, body)
        return resp(405, {"error": f"method {method} not allowed"})
    except Exception as e:  # noqa: BLE001
        print(f"[SUPPORT_ERROR] {type(e).__name__}: {e}")
        return resp(500, {"error": "Internal error"})


# API Gateway is configured with handler.lambda_handler; keep a `handler` alias
# so either name works.
handler = lambda_handler
