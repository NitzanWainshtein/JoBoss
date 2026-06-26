"""
Full job description fetching helpers.

This module fetches company job pages and extracts the most useful description
text available. It uses a best-effort HTML extraction strategy and falls back to
the Telegram preview description when the company page cannot be fetched or
parsed reliably.
"""

import html
import re
import ssl
import urllib.request
from html.parser import HTMLParser


MAX_DESCRIPTION_LENGTH = 7000
FETCH_TIMEOUT_SECONDS = 12


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript", "svg"}:
            self.skip_depth += 1

        if self.skip_depth == 0 and tag in {"p", "li", "br", "div", "section", "h1", "h2", "h3"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript", "svg"} and self.skip_depth > 0:
            self.skip_depth -= 1

        if self.skip_depth == 0 and tag in {"p", "li", "div", "section"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if self.skip_depth == 0:
            text = data.strip()
            if text:
                self.parts.append(text)

    def get_text(self):
        text = " ".join(self.parts)
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n\s*\n+", "\n", text)
        return text.strip()


def clean_text(text: str) -> str:
    text = html.unescape(text or "")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def html_to_text(fragment: str) -> str:
    parser = TextExtractor()
    parser.feed(html.unescape(fragment or ""))
    return clean_text(parser.get_text())


def extract_between_markers(html_text: str, start_markers, end_markers) -> str:
    lower_html = html_text.lower()

    start_idx = -1
    for marker in start_markers:
        idx = lower_html.find(marker.lower())
        if idx != -1 and (start_idx == -1 or idx < start_idx):
            start_idx = idx

    if start_idx == -1:
        return ""

    end_idx = len(html_text)
    for marker in end_markers:
        idx = lower_html.find(marker.lower(), start_idx + 1)
        if idx != -1 and idx < end_idx:
            end_idx = idx

    return html_text[start_idx:end_idx]


def fetch_html(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "text/html,application/xhtml+xml",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
            return response.read().decode("utf-8", errors="ignore")
    except Exception as first_error:
        print(f"Default HTTPS fetch failed for {url}: {first_error}")

    unverified_context = ssl._create_unverified_context()

    with urllib.request.urlopen(
        request,
        timeout=FETCH_TIMEOUT_SECONDS,
        context=unverified_context,
    ) as response:
        return response.read().decode("utf-8", errors="ignore")


def extract_full_description_from_html(html_text: str) -> str:
    start_markers = [
        "Job Description",
        "Meet the Team",
        "Your Impact",
        "Key Responsibilities",
        "What You’ll Do",
        "What You’ll Do",
        "What will you do",
        "What you will do",
        "About the Role",
        "About The Role",
        "Minimum Qualifications",
        "What we are looking for",
        "What We Are Looking For",
        "The Role",
        "Position Overview",
        "Role Overview",
        "Job Summary",
        "About this position",
        "About This Position",
    ]

    end_markers = [
        "Apply now",
        "Apply for this job",
        "Similar Jobs",
        "Share this job",
        "Equal Opportunity",
        "Privacy",
        "Cookie",
    ]

    candidates = []

    escaped_section = extract_between_markers(
        html_text,
        start_markers,
        end_markers,
    )

    if escaped_section:
        candidates.append(html_to_text(escaped_section))

    plain_text = html_to_text(html_text)
    plain_section = extract_between_markers(
        plain_text,
        start_markers,
        end_markers,
    )

    if plain_section:
        candidates.append(clean_text(plain_section))

    role_signal_markers = [
        "meet the team",
        "your impact",
        "minimum qualifications",
        "preferred qualifications",
        "key responsibilities",
        "responsibilities",
        "requirements",
    ]

    role_candidates = [
        candidate
        for candidate in candidates
        if len(candidate) >= 120
        and any(marker in candidate.lower() for marker in role_signal_markers)
    ]

    if role_candidates:
        best = max(role_candidates, key=len)
        return best[:MAX_DESCRIPTION_LENGTH]

    candidates.append(plain_text)
    candidates = [candidate for candidate in candidates if len(candidate) >= 120]

    if not candidates:
        return ""

    best = max(candidates, key=len)
    return best[:MAX_DESCRIPTION_LENGTH]


def fetch_full_description(apply_url: str, fallback_description: str, prefetched_html: str = "") -> str:
    if not apply_url or "t.me/" in apply_url or "telegram.me/" in apply_url:
        return fallback_description

    try:
        html_text = prefetched_html or fetch_html(apply_url)
        description = extract_full_description_from_html(html_text)

        if description:
            return description

    except Exception as e:
        print(f"Failed to fetch full description from {apply_url}: {e}")

    return fallback_description