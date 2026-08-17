"""Tests for check_jobs.py's orchestration: what it does with each classification
outcome, the escalation threshold, and DRY_RUN gating.

Loaded via conftest.load_fargate, which stubs the `playwright` package well enough
for the module-level `from playwright.sync_api import ...` to succeed — the tests
themselves monkeypatch classify_with_browser directly rather than driving a real
(or fake) browser, since the only thing under test is process_job's branching.

Run:  pytest backend/tests
"""
from conftest import load_fargate

checker = load_fargate("job-status-checker", "check_jobs.py")


def job(job_id, fail_count=0, url="https://x.example/1"):
    return {"jobId": job_id, "applyUrl": url, "title": "T", "company": "C",
             "checkFailCount": fail_count}


def wire(monkeypatch, classify_result):
    calls = {"deleted": [], "marked_open": [], "still_inconclusive": [], "escalated": []}
    monkeypatch.setattr(checker, "classify_with_browser", lambda page, url: classify_result)
    monkeypatch.setattr(checker, "delete_job", lambda table, jid: calls["deleted"].append(jid))
    monkeypatch.setattr(checker, "mark_checked_open", lambda table, jid, ts: calls["marked_open"].append(jid))
    monkeypatch.setattr(
        checker, "mark_still_inconclusive",
        lambda table, jid, reason, n, ts: calls["still_inconclusive"].append((jid, n)),
    )
    monkeypatch.setattr(
        checker, "escalate_to_review",
        lambda table, jid, reason, n, ts: calls["escalated"].append((jid, n)),
    )
    return calls


def run(monkeypatch, j, classify_result, dry_run=False):
    monkeypatch.setattr(checker, "DRY_RUN", dry_run)
    calls = wire(monkeypatch, classify_result)
    counts = {"deleted": 0, "kept": 0, "escalated": 0, "still_inconclusive": 0}
    checker.process_job(page=None, job=j, checked_at="2026-01-01T00:00:00Z", counts=counts)
    return calls, counts


# ── the three classifications ──────────────────────────────────────────────────

def test_closed_deletes_the_job(monkeypatch):
    calls, counts = run(monkeypatch, job("j1"), ("closed", "http_404"))
    assert calls["deleted"] == ["j1"]
    assert counts["deleted"] == 1


def test_closed_does_not_delete_in_dry_run(monkeypatch):
    calls, counts = run(monkeypatch, job("j1"), ("closed", "http_404"), dry_run=True)
    assert calls["deleted"] == []
    assert counts["deleted"] == 1  # still counted for the run summary, just not written


def test_open_clears_state(monkeypatch):
    calls, counts = run(monkeypatch, job("j1", fail_count=1), ("open", "ok"))
    assert calls["marked_open"] == ["j1"]
    assert counts["kept"] == 1


# ── escalation threshold: this is the core of the whole feature ────────────────

def test_first_inconclusive_does_not_escalate(monkeypatch):
    # fail_count starts at 0 (Tier 1 never increments it) -> this is attempt 1.
    calls, counts = run(monkeypatch, job("j1", fail_count=0), ("inconclusive", "playwright_timeout"))
    assert calls["escalated"] == []
    assert calls["still_inconclusive"] == [("j1", 1)]
    assert counts["still_inconclusive"] == 1
    assert counts["escalated"] == 0


def test_second_consecutive_inconclusive_escalates(monkeypatch):
    # fail_count already 1 from yesterday -> this is attempt 2, hits the threshold.
    calls, counts = run(monkeypatch, job("j1", fail_count=1), ("inconclusive", "playwright_timeout"))
    assert calls["still_inconclusive"] == []
    assert calls["escalated"] == [("j1", 2)]
    assert counts["escalated"] == 1


def test_escalation_does_not_write_in_dry_run(monkeypatch):
    calls, counts = run(monkeypatch, job("j1", fail_count=1), ("inconclusive", "http_403"), dry_run=True)
    assert calls["escalated"] == []
    assert counts["escalated"] == 1


def test_missing_apply_url_is_treated_as_inconclusive(monkeypatch):
    # process_job must short-circuit BEFORE calling classify_with_browser when
    # there is no URL. Rig classify_with_browser to return "open" — if it were
    # wrongly called anyway, this test would pass for the wrong reason, so
    # asserting "escalated" (not "open") proves the short-circuit happened.
    monkeypatch.setattr(checker, "DRY_RUN", False)
    calls = wire(monkeypatch, ("open", "ok"))
    counts = {"deleted": 0, "kept": 0, "escalated": 0, "still_inconclusive": 0}
    checker.process_job(page=None, job=job("j1", fail_count=1, url=""), checked_at="t", counts=counts)
    assert calls["escalated"] == [("j1", 2)]
    assert calls["marked_open"] == []


def test_decimal_fail_count_from_dynamodb_is_handled(monkeypatch):
    # DynamoDB numbers come back as Decimal, not int — process_job must coerce it.
    from decimal import Decimal
    j = job("j1", fail_count=Decimal("1"))
    calls, counts = run(monkeypatch, j, ("inconclusive", "http_500"))
    assert calls["escalated"] == [("j1", 2)]


# ── batch-level behavior ────────────────────────────────────────────────────────

def test_a_single_job_erroring_does_not_abort_the_batch(monkeypatch):
    jobs = [job("bad", url="https://x.example/bad"), job("good", url="https://x.example/good")]

    def flaky_classify(page, url):
        if url.endswith("bad"):
            raise RuntimeError("boom")
        return "open", "ok"

    monkeypatch.setattr(checker, "classify_with_browser", flaky_classify)
    monkeypatch.setattr(checker, "scan_tier2_pending", lambda table: jobs)
    monkeypatch.setattr(checker, "mark_checked_open", lambda table, jid, ts: opened.append(jid))
    opened = []
    monkeypatch.setattr(checker, "DRY_RUN", False)

    class FakeBrowser:
        def new_context(self, **kw):
            return self

        def new_page(self):
            return object()

        def close(self):
            pass

    class FakePW:
        chromium = type("C", (), {"launch": staticmethod(lambda **kw: FakeBrowser())})

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(checker, "sync_playwright", lambda: FakePW())

    checker.main()

    # "good" was still checked and marked open despite "bad" raising.
    assert opened == ["good"]
