"""Tests for classify_job_status — the Tier 1 (HTTP-only) closure check.

The behavior this guards: "the request failed/was blocked" and "the page
confirms the job is still open" used to be indistinguishable (both meant "keep,
say nothing"). That hid every job the cheap check simply couldn't read. These
tests pin the three-way split and, in particular, that nothing outside the two
narrow high-confidence signals (404/410, explicit closure text) is ever
classified "closed" — a false "closed" means deleting a job that's still live.

Run:  pytest backend/tests
"""
from conftest import load_lambda

detector = load_lambda("jobs_status_checker", entry="job_status_detector.py")


def fake_fetch(monkeypatch, status, html=""):
    monkeypatch.setattr(detector, "fetch_job_page", lambda url: (status, html))


# ── high-confidence closed ────────────────────────────────────────────────────

def test_404_is_closed(monkeypatch):
    fake_fetch(monkeypatch, 404)
    assert detector.classify_job_status("https://x.example/job/1") == ("closed", "http_404")


def test_410_is_closed(monkeypatch):
    fake_fetch(monkeypatch, 410)
    status, reason = detector.classify_job_status("https://x.example/job/1")
    assert status == "closed"


def test_closure_text_marker_is_closed(monkeypatch):
    fake_fetch(monkeypatch, 200, "<html><body>This position has been filled</body></html>" + "x" * 300)
    assert detector.classify_job_status("https://x.example/job/1") == ("closed", "text_marker")


def test_hebrew_closure_marker_is_closed(monkeypatch):
    fake_fetch(monkeypatch, 200, "<html><body>המשרה אינה זמינה</body></html>" + "x" * 300)
    status, _ = detector.classify_job_status("https://x.example/job/1")
    assert status == "closed"


# ── confirmed open ────────────────────────────────────────────────────────────

def test_real_looking_page_is_open(monkeypatch):
    html = "<html><body>" + ("We are hiring a Backend Engineer. " * 20) + "</body></html>"
    fake_fetch(monkeypatch, 200, html)
    assert detector.classify_job_status("https://x.example/job/1") == ("open", "ok")


# ── inconclusive: must NOT be "closed" or silently "open" ────────────────────

def test_403_is_inconclusive_not_closed(monkeypatch):
    # A WAF/anti-bot block must never be read as "the job is gone".
    fake_fetch(monkeypatch, 403, "")
    status, reason = detector.classify_job_status("https://x.example/job/1")
    assert status == "inconclusive"
    assert reason == "http_403"


def test_429_is_inconclusive(monkeypatch):
    fake_fetch(monkeypatch, 429, "")
    status, _ = detector.classify_job_status("https://x.example/job/1")
    assert status == "inconclusive"


def test_500_is_inconclusive(monkeypatch):
    fake_fetch(monkeypatch, 500, "")
    status, _ = detector.classify_job_status("https://x.example/job/1")
    assert status == "inconclusive"


def test_empty_js_shell_is_inconclusive_not_open(monkeypatch):
    # A React/SPA shell that never rendered — this is the exact case that used
    # to be silently classified as "open" just because the HTTP status was 200.
    fake_fetch(monkeypatch, 200, '<html><body><div id="root"></div></body></html>')
    status, reason = detector.classify_job_status("https://x.example/job/1")
    assert status == "inconclusive"
    assert reason == "empty_response"


def test_short_content_is_inconclusive():
    text = detector.html_to_text('<html><body><div id="root"></div></body></html>')
    assert len(text) < detector.MIN_CONTENT_CHARS


def test_network_exception_is_inconclusive(monkeypatch):
    def boom(url):
        raise TimeoutError("connection timed out")
    monkeypatch.setattr(detector, "fetch_job_page", boom)

    status, reason = detector.classify_job_status("https://x.example/job/1")
    assert status == "inconclusive"
    assert reason.startswith("fetch_error:")


def test_missing_apply_url_is_inconclusive():
    assert detector.classify_job_status("")[0] == "inconclusive"
    assert detector.classify_job_status(None)[0] == "inconclusive"


# ── Telegram jobs: unchanged special case ─────────────────────────────────────

def test_telegram_urls_are_never_touched():
    status, reason = detector.classify_job_status("https://t.me/somejobschannel/123")
    assert status == "open"
    assert reason == "telegram_not_checkable"
