"""
Job status detection helpers.

This module checks company job pages and decides whether a job posting is still
active. It is intentionally conservative: it only marks a job as inactive when
the HTTP response or page text gives a strong signal that the job is closed.
"""

import re
import ssl
import urllib.error
import urllib.request
from html.parser import HTMLParser


FETCH_TIMEOUT_SECONDS = 12

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

    try:
        with urllib.request.urlopen(
            request,
            timeout=FETCH_TIMEOUT_SECONDS,
            context=unverified_context,
        ) as response:
            return response.status, response.read().decode("utf-8", errors="ignore")
    except urllib.error.HTTPError as e:
        return e.code, ""


def is_job_inactive(apply_url: str) -> bool:
    if not apply_url:
        return False

    if "t.me/" in apply_url or "telegram.me/" in apply_url:
        return False

    try:
        status_code, html_text = fetch_job_page(apply_url)

        if status_code in INACTIVE_STATUS_CODES:
            return True

        page_text = html_to_text(html_text)

        return any(marker in page_text for marker in INACTIVE_TEXT_MARKERS)

    except Exception as e:
        print(f"Could not check job status for {apply_url}: {e}")
        return False
