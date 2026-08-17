"""
Job status detection helpers — Tier 1 (cheap, HTTP-only check).

This module fetches a company's job page with a plain HTTP request and classifies
what it finds into one of three outcomes:

  "closed"       — strong signal the posting is gone (404/410, or explicit
                   "position filled" style text). Safe to delete on this alone.
  "open"         — a real page loaded and shows no closure signal. Kept as-is.
  "inconclusive" — the request failed, was blocked, or came back with too little
                   text to trust either way (401/403/429/5xx, a timeout, or a
                   suspiciously empty response typical of a bot challenge or a
                   JS-only page that never rendered).

The critical change from the previous version: "inconclusive" used to be folded
into "keep it, say nothing" — indistinguishable from a page that was actually
confirmed still open. That hid every job this cheap check simply couldn't read
(blocked, JS-rendered, slow) with no visibility and no path to resolution. It is
now its own outcome, handled by the caller: escalate to a real-browser check
(Tier 2) rather than silently doing nothing.
"""

import re
import ssl
import urllib.error
import urllib.request
from html.parser import HTMLParser


FETCH_TIMEOUT_SECONDS = 12

# A real job page's extracted text runs to thousands of characters. A bot
# challenge page ("Verify you are human") or an unrendered JS shell
# (<div id="root"></div>) does not — this is what catches those as inconclusive
# rather than misreading them as "open" just because they returned HTTP 200.
MIN_CONTENT_CHARS = 200

INACTIVE_STATUS_CODES = {404, 410}

INACTIVE_TEXT_MARKERS = [
    "job no longer available",
    "this job is no longer available",
    "position has been filled",
    "this position has been filled",
    "no longer accepting applications",
    "job has expired",
    "this job has expired",
    "the job you are looking for is no longer available",
    "המשרה אינה זמינה",
    "המשרה לא זמינה",
]


class PageTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript", "svg"}:
            self.skip_depth += 1

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript", "svg"} and self.skip_depth > 0:
            self.skip_depth -= 1

    def handle_data(self, data):
        if self.skip_depth == 0:
            text = data.strip()
            if text:
                self.parts.append(text)

    def get_text(self):
        return " ".join(self.parts)


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip().lower()


def html_to_text(html_text: str) -> str:
    parser = PageTextExtractor()
    parser.feed(html_text or "")
    return normalize_text(parser.get_text())


def fetch_job_page(url: str):
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "text/html,application/xhtml+xml",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
            return response.status, response.read().decode("utf-8", errors="ignore")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as first_error:
        print(f"Default HTTPS status fetch failed for {url}: {first_error}")

    unverified_context = ssl._create_unverified_context()

    with urllib.request.urlopen(
        request,
        timeout=FETCH_TIMEOUT_SECONDS,
        context=unverified_context,
    ) as response:
        return response.status, response.read().decode("utf-8", errors="ignore")


def classify_job_status(apply_url: str):
    """Returns (status, reason): status is "closed" / "open" / "inconclusive"."""
    if not apply_url:
        return "inconclusive", "no_apply_url"

    # Telegram-sourced jobs have no checkable web page — unchanged from before:
    # never touch them, one way or the other.
    if "t.me/" in apply_url or "telegram.me/" in apply_url:
        return "open", "telegram_not_checkable"

    try:
        status_code, html_text = fetch_job_page(apply_url)
    except urllib.error.HTTPError as e:
        status_code, html_text = e.code, ""
    except Exception as e:
        print(f"Could not check job status for {apply_url}: {type(e).__name__}: {e}")
        return "inconclusive", f"fetch_error:{type(e).__name__}"

    if status_code in INACTIVE_STATUS_CODES:
        return "closed", f"http_{status_code}"

    if status_code != 200:
        # 401/403/429/5xx and anything else unexpected: this is the site
        # rejecting or throttling the request, not confirming the job is gone.
        # Treating it as "closed" would delete jobs on nothing more than a
        # WAF/anti-bot response; treating it as "open" hides that the check
        # never actually happened.
        return "inconclusive", f"http_{status_code}"

    page_text = html_to_text(html_text)

    if any(marker in page_text for marker in INACTIVE_TEXT_MARKERS):
        return "closed", "text_marker"

    if len(page_text) < MIN_CONTENT_CHARS:
        return "inconclusive", "empty_response"

    return "open", "ok"
