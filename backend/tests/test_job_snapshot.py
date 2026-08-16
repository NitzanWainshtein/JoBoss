"""Tests for get_job_snapshot — the fix for applications losing their company/title.

An application used to store only whatever company/title the client's request body
happened to include. That was blank for any caller that omitted them (the Chrome
extension's auto-apply path), and had no way to survive the job being edited or
deleted afterwards — 68 applications in production carry no company or title today,
and none of them are recoverable, because the job they pointed at is already gone.

These tests don't hit real DynamoDB — jobs_table.get_item is monkeypatched with a
fake, since the only thing under test is get_job_snapshot's own logic: what it
requests and how it shapes what comes back.

Run:  pytest backend/tests
"""
from conftest import load_lambda

swipes = load_lambda("swipes")


class FakeTable:
    def __init__(self, item=None, error=None):
        self._item = item
        self._error = error
        self.last_call = None

    def get_item(self, **kwargs):
        self.last_call = kwargs
        if self._error:
            raise self._error
        return {"Item": self._item} if self._item is not None else {}


def test_snapshot_pulls_the_expected_fields(monkeypatch):
    fake = FakeTable(item={
        "jobId": "j1", "company": "Acme", "title": "Backend Engineer",
        "location": "Tel Aviv", "applyUrl": "https://acme.example/jobs/1",
        "description": "irrelevant, not requested",
    })
    monkeypatch.setattr(swipes, "jobs_table", fake)

    snap = swipes.get_job_snapshot("j1")

    assert snap == {
        "company": "Acme",
        "title": "Backend Engineer",
        "location": "Tel Aviv",
        "applyUrl": "https://acme.example/jobs/1",
    }


def test_snapshot_requests_location_via_alias(monkeypatch):
    # "location" is a DynamoDB reserved word; requesting it unaliased in a
    # ProjectionExpression is a runtime error, not just a style nit.
    fake = FakeTable(item={"company": "X", "title": "Y", "location": "Z", "applyUrl": ""})
    monkeypatch.setattr(swipes, "jobs_table", fake)

    swipes.get_job_snapshot("j1")

    assert fake.last_call["Key"] == {"jobId": "j1"}
    assert "#loc" in fake.last_call["ProjectionExpression"]
    assert fake.last_call["ExpressionAttributeNames"] == {"#loc": "location"}


def test_snapshot_of_a_job_that_no_longer_exists(monkeypatch):
    fake = FakeTable(item=None)  # get_item found nothing
    monkeypatch.setattr(swipes, "jobs_table", fake)

    snap = swipes.get_job_snapshot("deleted-job")

    # Present with empty strings, not missing keys — callers use `.get(k) or
    # fallback`, and an empty string is exactly as falsy as a missing key, so this
    # only matters for get_job_snapshot's own contract, not its callers.
    assert snap == {"company": "", "title": "", "location": "", "applyUrl": ""}


def test_snapshot_swallows_dynamodb_errors(monkeypatch):
    fake = FakeTable(error=RuntimeError("table unavailable"))
    monkeypatch.setattr(swipes, "jobs_table", fake)

    # Must not raise — a snapshot failure must never fail the swipe itself.
    snap = swipes.get_job_snapshot("j1")
    assert snap == {}


def test_missing_field_on_the_job_record_becomes_empty_string(monkeypatch):
    # A job predating some field being added, e.g. no applyUrl yet.
    fake = FakeTable(item={"company": "Acme", "title": "Engineer"})
    monkeypatch.setattr(swipes, "jobs_table", fake)

    snap = swipes.get_job_snapshot("j1")
    assert snap["applyUrl"] == ""
    assert snap["location"] == ""
