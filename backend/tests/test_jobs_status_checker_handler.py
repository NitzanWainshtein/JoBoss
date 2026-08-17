"""Tests for the Tier 1 Lambda's orchestration: what it does with each of the
three classify_job_status outcomes, and that DRY_RUN actually prevents writes.

Repository calls (delete_job / mark_checked_open / flag_for_tier2) and
classify_job_status are monkeypatched with recording fakes — this is pure
orchestration logic, not a DynamoDB integration test.

Run:  pytest backend/tests
"""
from conftest import load_lambda

handler = load_lambda("jobs_status_checker", entry="handler.py")


def job(job_id, url="https://x.example/1"):
    return {"jobId": job_id, "applyUrl": url, "title": "T", "company": "C"}


def make_scenario(monkeypatch, outcomes):
    """outcomes: {jobId: (status, reason)} — one job per id, each with a distinct url.

    Wires scan_checkable_jobs to return one job per outcome, classify_job_status to
    resolve by URL, and records every write the handler attempts.
    """
    jobs = [job(jid, url=f"https://x.example/{jid}") for jid in outcomes]
    url_to_outcome = {j["applyUrl"]: outcomes[j["jobId"]] for j in jobs}
    calls = {"deleted": [], "marked_open": [], "flagged": []}

    monkeypatch.setattr(handler, "scan_checkable_jobs", lambda table, limit: jobs)
    monkeypatch.setattr(handler, "classify_job_status", lambda url: url_to_outcome[url])
    monkeypatch.setattr(handler, "delete_job", lambda table, job_id: calls["deleted"].append(job_id))
    monkeypatch.setattr(handler, "mark_checked_open", lambda table, job_id, ts: calls["marked_open"].append(job_id))
    monkeypatch.setattr(handler, "flag_for_tier2", lambda table, job_id, ts: calls["flagged"].append(job_id))
    return calls


def test_closed_job_gets_deleted_when_not_dry_run(monkeypatch):
    calls = make_scenario(monkeypatch, {"j1": ("closed", "http_404")})
    monkeypatch.setattr(handler, "DRY_RUN", False)

    result = handler.lambda_handler({}, None)

    assert calls["deleted"] == ["j1"]
    assert result["body"]["deleted"] == 1
    assert result["body"]["wouldDelete"] == 0


def test_closed_job_is_not_deleted_in_dry_run(monkeypatch):
    calls = make_scenario(monkeypatch, {"j1": ("closed", "http_404")})
    monkeypatch.setattr(handler, "DRY_RUN", True)

    result = handler.lambda_handler({}, None)

    assert calls["deleted"] == []
    assert result["body"]["wouldDelete"] == 1
    assert result["body"]["deleted"] == 0


def test_open_job_is_marked_and_kept(monkeypatch):
    calls = make_scenario(monkeypatch, {"j1": ("open", "ok")})
    monkeypatch.setattr(handler, "DRY_RUN", False)

    result = handler.lambda_handler({}, None)

    assert calls["marked_open"] == ["j1"]
    assert calls["deleted"] == []
    assert calls["flagged"] == []
    assert result["body"]["kept"] == 1


def test_open_job_is_not_written_in_dry_run(monkeypatch):
    calls = make_scenario(monkeypatch, {"j1": ("open", "ok")})
    monkeypatch.setattr(handler, "DRY_RUN", True)

    handler.lambda_handler({}, None)

    assert calls["marked_open"] == []


def test_inconclusive_job_is_flagged_for_tier2_not_deleted(monkeypatch):
    calls = make_scenario(monkeypatch, {"j1": ("inconclusive", "http_403")})
    monkeypatch.setattr(handler, "DRY_RUN", False)

    result = handler.lambda_handler({}, None)

    assert calls["flagged"] == ["j1"]
    assert calls["deleted"] == []
    assert calls["marked_open"] == []
    assert result["body"]["flaggedForTier2"] == 1


def test_inconclusive_job_is_not_flagged_in_dry_run(monkeypatch):
    calls = make_scenario(monkeypatch, {"j1": ("inconclusive", "http_403")})
    monkeypatch.setattr(handler, "DRY_RUN", True)

    result = handler.lambda_handler({}, None)

    assert calls["flagged"] == []
    assert result["body"]["wouldFlagForTier2"] == 1


def test_mixed_batch_routes_each_job_correctly(monkeypatch):
    calls = make_scenario(monkeypatch, {
        "closed-1": ("closed", "http_404"),
        "closed-2": ("closed", "text_marker"),
        "open-1":   ("open", "ok"),
        "amb-1":    ("inconclusive", "http_500"),
        "amb-2":    ("inconclusive", "empty_response"),
    })
    monkeypatch.setattr(handler, "DRY_RUN", False)

    result = handler.lambda_handler({}, None)

    assert sorted(calls["deleted"]) == ["closed-1", "closed-2"]
    assert calls["marked_open"] == ["open-1"]
    assert sorted(calls["flagged"]) == ["amb-1", "amb-2"]
    assert result["body"] == {
        "message": "Jobs status check (Tier 1) completed",
        "checked": 5, "deleted": 2, "wouldDelete": 0, "kept": 1,
        "flaggedForTier2": 2, "wouldFlagForTier2": 0, "dryRun": False,
    }


def test_no_checkable_jobs_is_not_an_error(monkeypatch):
    calls = make_scenario(monkeypatch, {})
    monkeypatch.setattr(handler, "DRY_RUN", False)

    result = handler.lambda_handler({}, None)

    assert result["statusCode"] == 200
    assert result["body"]["checked"] == 0
    assert calls == {"deleted": [], "marked_open": [], "flagged": []}


def test_a_scan_failure_returns_500_not_a_crash(monkeypatch):
    def boom(table, limit):
        raise RuntimeError("DynamoDB unavailable")
    monkeypatch.setattr(handler, "scan_checkable_jobs", boom)

    result = handler.lambda_handler({}, None)

    assert result["statusCode"] == 500
    assert "error" in result["body"]
