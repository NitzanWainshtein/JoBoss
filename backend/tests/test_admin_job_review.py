"""Tests for the admin review-queue endpoints (F-18's human-in-the-loop step).

jobs_table is monkeypatched with a small in-memory fake — these test routing and
validation logic, not DynamoDB itself.

Run:  pytest backend/tests
"""
from conftest import load_lambda

admin = load_lambda("admin")


class FakeJobsTable:
    def __init__(self, items):
        self.items = {i["jobId"]: dict(i) for i in items}
        self.deleted = []
        self.updates = []

    def get_item(self, Key):
        item = self.items.get(Key["jobId"])
        return {"Item": item} if item else {}

    def delete_item(self, Key):
        self.deleted.append(Key["jobId"])
        self.items.pop(Key["jobId"], None)

    def update_item(self, Key, UpdateExpression, ExpressionAttributeValues=None, **_):
        self.updates.append((Key["jobId"], UpdateExpression))
        item = self.items.setdefault(Key["jobId"], {"jobId": Key["jobId"]})
        if "checkFailCount = :zero" in UpdateExpression:
            item["checkFailCount"] = 0
        for field in ("reviewStatus", "reviewReason", "reviewFlaggedAt", "tier2Pending", "lastCheckReason"):
            item.pop(field, None)

    def scan(self, **kwargs):
        # This fake only needs to support this codebase's one actual filter
        # (reviewStatus == "pending_review"), not be a general DynamoDB emulator —
        # introspecting boto3's ConditionBase internals would be more fragile than
        # this is honest about being narrow.
        items = list(self.items.values())
        if "FilterExpression" in kwargs:
            items = [i for i in items if i.get("reviewStatus") == "pending_review"]
        return {"Items": items}


def pending_job(job_id, **overrides):
    j = {
        "jobId": job_id, "company": "Acme", "title": "Engineer",
        "reviewStatus": "pending_review", "reviewReason": "http_403",
        "reviewFlaggedAt": "2026-08-13T00:00:00Z", "checkFailCount": 2,
    }
    j.update(overrides)
    return j


# ── list pending review ──────────────────────────────────────────────────────

def test_list_pending_review_returns_only_flagged_jobs(monkeypatch):
    table = FakeJobsTable([
        pending_job("j1"),
        {"jobId": "j2", "company": "X", "title": "Y"},  # no reviewStatus — must be excluded
    ])
    monkeypatch.setattr(admin, "jobs_table", table)
    monkeypatch.setattr(admin, "log_action", lambda *a, **k: None)

    result = admin.handle_list_pending_review_jobs("admin-1")

    body = __import__("json").loads(result["body"])
    assert result["statusCode"] == 200
    assert body["total"] == 1
    assert body["jobs"][0]["jobId"] == "j1"


def test_list_pending_review_empty_is_not_an_error(monkeypatch):
    table = FakeJobsTable([])
    monkeypatch.setattr(admin, "jobs_table", table)
    monkeypatch.setattr(admin, "log_action", lambda *a, **k: None)

    result = admin.handle_list_pending_review_jobs("admin-1")
    body = __import__("json").loads(result["body"])
    assert result["statusCode"] == 200
    assert body["jobs"] == []


# ── resolve: delete ──────────────────────────────────────────────────────────

def test_resolve_delete_removes_the_job(monkeypatch):
    table = FakeJobsTable([pending_job("j1")])
    monkeypatch.setattr(admin, "jobs_table", table)
    monkeypatch.setattr(admin, "log_action", lambda *a, **k: None)

    result = admin.handle_resolve_job_review("admin-1", "j1", {"action": "delete"})

    assert result["statusCode"] == 200
    assert table.deleted == ["j1"]
    assert "j1" not in table.items


# ── resolve: keep ─────────────────────────────────────────────────────────────

def test_resolve_keep_clears_review_state(monkeypatch):
    table = FakeJobsTable([pending_job("j1")])
    monkeypatch.setattr(admin, "jobs_table", table)
    monkeypatch.setattr(admin, "log_action", lambda *a, **k: None)

    result = admin.handle_resolve_job_review("admin-1", "j1", {"action": "keep"})

    assert result["statusCode"] == 200
    assert table.deleted == []
    kept = table.items["j1"]
    assert "reviewStatus" not in kept
    assert "reviewReason" not in kept
    assert "tier2Pending" not in kept
    assert kept["checkFailCount"] == 0


# ── validation ─────────────────────────────────────────────────────────────────

def test_invalid_action_is_rejected(monkeypatch):
    table = FakeJobsTable([pending_job("j1")])
    monkeypatch.setattr(admin, "jobs_table", table)

    result = admin.handle_resolve_job_review("admin-1", "j1", {"action": "explode"})

    assert result["statusCode"] == 400
    assert table.deleted == []


def test_missing_job_is_404(monkeypatch):
    table = FakeJobsTable([])
    monkeypatch.setattr(admin, "jobs_table", table)

    result = admin.handle_resolve_job_review("admin-1", "does-not-exist", {"action": "delete"})
    assert result["statusCode"] == 404


def test_job_not_actually_pending_review_is_rejected(monkeypatch):
    # A job an admin never should have been asked about — e.g. a stale UI tab
    # that already resolved it, or Tier 1 marked it open again in the meantime.
    table = FakeJobsTable([{"jobId": "j1", "company": "X", "title": "Y"}])
    monkeypatch.setattr(admin, "jobs_table", table)

    result = admin.handle_resolve_job_review("admin-1", "j1", {"action": "delete"})

    assert result["statusCode"] == 409
    assert table.deleted == []
