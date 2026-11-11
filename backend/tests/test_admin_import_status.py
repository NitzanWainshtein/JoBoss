"""Tests for the admin Importer's trigger + progress reporting.

The panel reported "נוספו 0 משרות חדשות · הוסרו 0" on every single run, whatever
the importer actually did. Three separate faults produced that:

  1. `state_table = jobs_table` ran ABOVE the line that creates `jobs_table`, so
     the NameError fired every time and state_table was always None. The snapshot
     was therefore never written, import-status always took its `if not snap`
     branch, and that branch returns no `added`/`removed` keys at all — the UI's
     `st.added || 0` turned that into a hard 0. It also reported running: False
     immediately, so polling stopped ~6s into a run that takes 45-190s.
  2. The snapshot was to be stored IN the jobs table under Key={"key": ...}, but
     that table is keyed on jobId — so both the put and the get were invalid, and
     a row that did land would have been counted as a job by the very count it was
     compared against (and could be served to users).
  3. "removed" diffed active counts, but the importer only ever inserts. That
     number was TTL expiry and closure-checker deletions overlapping the run.

Progress is now counted off createdAt against a server timestamp handed back by
the trigger, so there is no state row to lose.

Run:  pytest backend/tests
"""
from datetime import datetime, timedelta, timezone

import pytest

from conftest import load_lambda

admin = load_lambda("admin")


def iso(dt):
    return dt.isoformat()


class FakeJobsTable:
    def __init__(self, items):
        self.items = [dict(i) for i in items]

    def scan(self, **kwargs):
        return {"Items": [dict(i) for i in self.items]}


class FakeLambdaClient:
    def __init__(self):
        self.invocations = []

    def invoke(self, **kwargs):
        self.invocations.append(kwargs)
        return {"StatusCode": 202}


@pytest.fixture
def no_audit_log(monkeypatch):
    monkeypatch.setattr(admin, "log_action", lambda *a, **k: None)


def body_of(response):
    import json
    return json.loads(response["body"])


# ── the regression that started this ─────────────────────────────────────────

def test_module_has_no_state_table_left():
    """The snapshot mechanism is gone, not merely repaired in place.

    Any reintroduction of a module-level state_table assigned before jobs_table
    exists would silently be None again, which is exactly how this hid for so long.
    """
    assert not hasattr(admin, "state_table")
    assert not hasattr(admin, "IMPORT_SNAPSHOT_KEY")


def test_status_reports_the_real_count_not_zero(monkeypatch):
    started = datetime.now(timezone.utc) - timedelta(seconds=30)
    monkeypatch.setattr(admin, "jobs_table", FakeJobsTable([
        {"jobId": "old-1", "createdAt": iso(started - timedelta(days=3))},
        {"jobId": "new-1", "createdAt": iso(started + timedelta(seconds=5))},
        {"jobId": "new-2", "createdAt": iso(started + timedelta(seconds=9))},
        {"jobId": "new-3", "createdAt": iso(started + timedelta(seconds=20))},
    ]))

    got = body_of(admin.handle_import_status("admin-1", iso(started)))

    # The whole bug was that this was 0 no matter what.
    assert got["added"] == 3
    # And no phantom removals: the importer only inserts.
    assert "removed" not in got


def test_status_counts_nothing_when_the_channel_had_nothing_new(monkeypatch):
    started = datetime.now(timezone.utc) - timedelta(seconds=30)
    monkeypatch.setattr(admin, "jobs_table", FakeJobsTable([
        {"jobId": "old-1", "createdAt": iso(started - timedelta(days=1))},
    ]))

    got = body_of(admin.handle_import_status("admin-1", iso(started)))
    # A truthful zero, which the UI now words differently from a failure.
    assert got["added"] == 0


def test_a_job_created_before_the_run_is_never_counted(monkeypatch):
    # Otherwise every run would claim credit for the whole table.
    started = datetime.now(timezone.utc)
    monkeypatch.setattr(admin, "jobs_table", FakeJobsTable([
        {"jobId": f"j{i}", "createdAt": iso(started - timedelta(seconds=i + 1))}
        for i in range(25)
    ]))

    assert body_of(admin.handle_import_status("a", iso(started)))["added"] == 0


def test_running_stays_true_until_the_window_elapses(monkeypatch):
    monkeypatch.setattr(admin, "jobs_table", FakeJobsTable([]))

    fresh = body_of(admin.handle_import_status(
        "a", iso(datetime.now(timezone.utc) - timedelta(seconds=20))))
    # Previously this went False ~6s in, so polling stopped mid-run and the
    # partial (zero) count became the final answer.
    assert fresh["running"] is True

    done = body_of(admin.handle_import_status(
        "a", iso(datetime.now(timezone.utc)
                 - timedelta(seconds=admin.IMPORT_RUN_WINDOW_SECS + 5))))
    assert done["running"] is False


def test_naive_and_z_suffixed_timestamps_are_both_accepted(monkeypatch):
    started = datetime.now(timezone.utc) - timedelta(seconds=10)
    monkeypatch.setattr(admin, "jobs_table", FakeJobsTable([
        {"jobId": "n", "createdAt": iso(started + timedelta(seconds=1))},
    ]))

    # createdAt is written by the importer as datetime.isoformat() with tz, but a
    # naive or Z-suffixed value must not crash the whole status call.
    assert body_of(admin.handle_import_status(
        "a", iso(started).replace("+00:00", "Z")))["added"] == 1
    assert body_of(admin.handle_import_status(
        "a", started.replace(tzinfo=None).isoformat()))["added"] == 1


def test_jobs_with_missing_or_unparsable_createdAt_are_skipped(monkeypatch):
    started = datetime.now(timezone.utc) - timedelta(seconds=10)
    monkeypatch.setattr(admin, "jobs_table", FakeJobsTable([
        {"jobId": "no-date"},
        {"jobId": "junk", "createdAt": "not a date"},
        {"jobId": "good", "createdAt": iso(started + timedelta(seconds=2))},
    ]))

    # One malformed row must not take down the admin panel.
    assert body_of(admin.handle_import_status("a", iso(started)))["added"] == 1


def test_status_rejects_a_missing_or_invalid_since():
    assert admin.handle_import_status("a", None)["statusCode"] == 400
    assert admin.handle_import_status("a", "")["statusCode"] == 400
    assert admin.handle_import_status("a", "yesterday")["statusCode"] == 400


# ── trigger ──────────────────────────────────────────────────────────────────

def test_trigger_invokes_the_importer_async_and_returns_a_server_timestamp(
        monkeypatch, no_audit_log):
    fake_lambda = FakeLambdaClient()
    monkeypatch.setattr(admin, "lam", fake_lambda)

    before = datetime.now(timezone.utc)
    got = body_of(admin.handle_trigger_import("admin-1"))

    assert got["success"] is True
    assert fake_lambda.invocations[0]["FunctionName"] == admin.IMPORTER_FN
    # Event, not RequestResponse: the run outlasts API Gateway's 29s timeout.
    assert fake_lambda.invocations[0]["InvocationType"] == "Event"

    # The client passes this straight back to import-status, so it has to be a
    # server clock rather than the browser's.
    stamped = datetime.fromisoformat(got["triggeredAt"])
    assert before <= stamped <= datetime.now(timezone.utc)


def test_trigger_stamps_the_time_before_invoking(monkeypatch, no_audit_log):
    """A job inserted immediately must not sort ahead of the timestamp."""
    seen = {}

    class RecordingLambda:
        def invoke(self, **kwargs):
            seen["at"] = datetime.now(timezone.utc)
            return {"StatusCode": 202}

    monkeypatch.setattr(admin, "lam", RecordingLambda())
    got = body_of(admin.handle_trigger_import("admin-1"))

    assert datetime.fromisoformat(got["triggeredAt"]) <= seen["at"]


def test_trigger_surfaces_an_invoke_failure_as_500(monkeypatch, no_audit_log):
    class DenyingLambda:
        def invoke(self, **kwargs):
            raise Exception("AccessDeniedException: lambda:InvokeFunction")

    monkeypatch.setattr(admin, "lam", DenyingLambda())
    res = admin.handle_trigger_import("admin-1")

    # This exact failure (a role without lambda:InvokeFunction) has happened here
    # before, and looked identical to every other error until it was logged.
    assert res["statusCode"] == 500
    assert "AccessDenied" in body_of(res)["error"]
