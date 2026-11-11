"""Tests for the "Contact us" support tickets.

User side:  backend/lambdas/support/handler.py   (/support)
Admin side: backend/lambdas/admin/handler.py     (/admin/support...)

Both share one table (PK userId, SK ticketId). The table and SES are replaced
with small in-memory fakes, so these pin routing, validation, ownership and the
unread/status bookkeeping — not DynamoDB itself.

Run:  pytest backend/tests
"""
import json
import re

import pytest

from conftest import load_lambda

support = load_lambda("support")
admin = load_lambda("admin")

ALICE = "11111111-1111-1111-1111-111111111111"
BOB = "22222222-2222-2222-2222-222222222222"


class _CondFailed(Exception):
    pass


class FakeTable:
    """Just enough of a boto3 Table for these handlers."""

    def __init__(self):
        self.items = {}
        self.meta = type("M", (), {})()
        self.meta.client = type("C", (), {})()
        self.meta.client.exceptions = type("E", (), {"ConditionalCheckFailedException": _CondFailed})

    def _k(self, key):
        return (key["userId"], key["ticketId"])

    def put_item(self, Item):
        self.items[self._k(Item)] = json.loads(json.dumps(Item))

    def get_item(self, Key):
        item = self.items.get(self._k(Key))
        return {"Item": json.loads(json.dumps(item))} if item else {}

    def query(self, KeyConditionExpression, **_):
        # Key("userId").eq(x) -> pull x out of the condition object.
        uid = KeyConditionExpression.get_expression()["values"][1]
        return {"Items": [dict(v) for (u, _), v in self.items.items() if u == uid]}

    def scan(self, **_):
        return {"Items": [dict(v) for v in self.items.values()]}

    def update_item(self, Key, UpdateExpression, ExpressionAttributeValues,
                    ConditionExpression=None, ExpressionAttributeNames=None, ReturnValues=None):
        k = self._k(Key)
        if ConditionExpression and k not in self.items:
            raise _CondFailed()
        item = self.items.setdefault(k, dict(Key))
        names = ExpressionAttributeNames or {}
        for clause in re.split(r", (?=[#\w]+ = )", UpdateExpression.removeprefix("SET ")):
            field, expr = [p.strip() for p in clause.split("=", 1)]
            field = names.get(field, field)
            if expr.startswith("list_append"):
                item[field] = list(item.get(field, [])) + ExpressionAttributeValues[":msg"]
            else:
                item[field] = ExpressionAttributeValues[expr]
        return {"Attributes": dict(item)}


class FakeSES:
    def __init__(self, fail=False):
        self.sent = []
        self.fail = fail

    def send_email(self, **kwargs):
        if self.fail:
            raise RuntimeError("SES down")
        self.sent.append(kwargs)


@pytest.fixture
def env(monkeypatch):
    table, ses = FakeTable(), FakeSES()
    monkeypatch.setattr(support, "tickets_table", table)
    monkeypatch.setattr(support, "ses", ses)
    monkeypatch.setattr(admin, "support_table", table)
    monkeypatch.setattr(admin, "ses", ses)
    monkeypatch.setattr(admin, "is_admin", lambda event: True)
    return table, ses


def user_event(method, sub=ALICE, body=None, email="alice@example.com"):
    return {
        "httpMethod": method, "path": "/support",
        "requestContext": {"authorizer": {"claims": {"sub": sub, "email": email, "name": "Alice"}}},
        "body": json.dumps(body) if body is not None else None,
    }


def admin_event(method, path, body=None):
    return {
        "httpMethod": method, "path": path,
        "requestContext": {"authorizer": {"claims": {"sub": "admin-1"}}},
        "body": json.dumps(body) if body is not None else None,
    }


def call(mod, event):
    r = mod.lambda_handler(event, None)
    return r["statusCode"], json.loads(r["body"])


def open_ticket(sub=ALICE, **overrides):
    body = {"category": "bug", "subject": "Swipe stuck", "message": "The card does not move."}
    body.update(overrides)
    return call(support, user_event("POST", sub=sub, body=body))


# ── user side ────────────────────────────────────────────────────────────────

def test_create_saves_ticket_and_emails_team(env):
    table, ses = env
    code, body = open_ticket()
    assert code == 201
    t = body["ticket"]
    assert t["status"] == "NEW" and t["messages"][0] == {"from": "user", "text": "The card does not move.", "at": t["createdAt"]}
    stored = next(iter(table.items.values()))
    assert stored["adminUnread"] is True and stored["userUnread"] is False
    assert stored["userEmail"] == "alice@example.com"
    assert len(ses.sent) == 1
    assert ses.sent[0]["Destination"]["ToAddresses"] == [support.SUPPORT_INBOX]
    assert ses.sent[0]["ReplyToAddresses"] == ["alice@example.com"]


def test_email_failure_still_saves_ticket(env, monkeypatch):
    table, _ = env
    monkeypatch.setattr(support, "ses", FakeSES(fail=True))
    code, body = open_ticket()
    assert code == 201 and body["emailed"] is False
    assert len(table.items) == 1


@pytest.mark.parametrize("override", [{"subject": ""}, {"message": "hi"}])
def test_create_rejects_empty_fields(env, override):
    code, _ = open_ticket(**override)
    assert code == 400
    assert env[0].items == {}


def test_unknown_category_falls_back_to_other(env):
    _, body = open_ticket(category="<script>")
    assert body["ticket"]["category"] == "other"


def test_daily_rate_limit(env):
    for _ in range(support.DAILY_TICKET_LIMIT):
        assert open_ticket()[0] == 201
    code, body = open_ticket()
    assert code == 429 and body["code"] == "SUPPORT_RATE_LIMIT"


def test_user_only_sees_own_tickets(env):
    open_ticket(sub=ALICE)
    open_ticket(sub=BOB, subject="Bob's issue")
    code, body = call(support, user_event("GET", sub=BOB))
    assert code == 200
    assert [t["subject"] for t in body["tickets"]] == ["Bob's issue"]
    assert "userEmail" not in body["tickets"][0]  # internal fields not exposed


def test_unauthenticated_is_rejected(env):
    event = user_event("GET")
    event["requestContext"] = {}
    assert call(support, event)[0] == 401


def test_mark_read_on_someone_elses_ticket_is_404(env):
    _, body = open_ticket(sub=ALICE)
    tid = body["ticket"]["ticketId"]
    code, _ = call(support, user_event("PUT", sub=BOB, body={"ticketId": tid}))
    assert code == 404


# ── admin side ───────────────────────────────────────────────────────────────

def test_admin_lists_all_with_unread_count(env):
    open_ticket(sub=ALICE)
    open_ticket(sub=BOB)
    code, body = call(admin, admin_event("GET", "/admin/support"))
    assert code == 200 and len(body["tickets"]) == 2
    assert body["unread"] == 2 and body["open"] == 2
    code, body = call(admin, admin_event("GET", "/admin/support/unread"))
    assert code == 200 and body == {"unread": 2}


def test_admin_reply_reaches_user_and_flips_flags(env):
    table, ses = env
    _, body = open_ticket()
    tid = body["ticket"]["ticketId"]
    ses.sent.clear()

    code, body = call(admin, admin_event("PUT", f"/admin/support/{tid}",
                                         {"userId": ALICE, "reply": "Fixed, thanks!"}))
    assert code == 200 and body["emailed"] is True
    t = body["ticket"]
    assert t["status"] == "IN_PROGRESS"          # first reply moves NEW forward
    assert t["adminUnread"] is False and t["userUnread"] is True
    assert [m["from"] for m in t["messages"]] == ["user", "admin"]
    assert ses.sent[0]["Destination"]["ToAddresses"] == ["alice@example.com"]

    # The user sees the reply as unread, then marks it read.
    _, mine = call(support, user_event("GET"))
    assert mine["unread"] == 1 and mine["tickets"][0]["messages"][1]["text"] == "Fixed, thanks!"
    assert call(support, user_event("PUT", body={"ticketId": tid}))[0] == 200
    _, mine = call(support, user_event("GET"))
    assert mine["unread"] == 0


def test_admin_status_change_without_reply(env):
    _, body = open_ticket()
    tid = body["ticket"]["ticketId"]
    code, body = call(admin, admin_event("PUT", f"/admin/support/{tid}", {"userId": ALICE, "status": "RESOLVED"}))
    assert code == 200
    assert body["ticket"]["status"] == "RESOLVED" and body["emailed"] is False
    assert len(body["ticket"]["messages"]) == 1


def test_admin_rejects_bad_status_and_missing_ticket(env):
    _, body = open_ticket()
    tid = body["ticket"]["ticketId"]
    assert call(admin, admin_event("PUT", f"/admin/support/{tid}", {"userId": ALICE, "status": "DONE"}))[0] == 400
    assert call(admin, admin_event("PUT", f"/admin/support/{tid}", {"userId": BOB, "reply": "x"}))[0] == 404


def test_non_admin_cannot_reach_support_admin_routes(env, monkeypatch):
    monkeypatch.setattr(admin, "is_admin", lambda event: False)
    assert call(admin, admin_event("GET", "/admin/support"))[0] == 403
