"""Apply-URL validation and resolution.

Some source channels post truncated or generic apply links (e.g.
careers.example.com/position/ instead of .../position/c9-961-en/). Landing on
a listings page breaks both the description fetch and Auto Apply. This module
detects that case and tries to recover the specific position URL by scanning
the page's anchors for one whose text matches the job title (works on
server-rendered career sites; JS-only sites stay flagged as generic).
"""

import re
import ssl
import urllib.request
from html.parser import HTMLParser
from urllib.parse import urljoin

FETCH_TIMEOUT_SECONDS = 12

STOPWORDS = {"and", "or", "the", "for", "of", "in", "a", "an", "to", "with"}


def fetch_html_with_final_url(url):
    """Fetch a page following redirects. Returns (html, final_url)."""
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
            return response.read().decode("utf-8", errors="ignore"), response.geturl()
    except Exception as first_error:
        print(f"Resolver default fetch failed for {url}: {first_error}")
    context = ssl._create_unverified_context()
    with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT_SECONDS, context=context) as response:
        return response.read().decode("utf-8", errors="ignore"), response.geturl()


def significant_title_words(title):
    words = re.findall(r"[A-Za-z֐-׿]{3,}", (title or "").lower())
    return [w for w in words if w not in STOPWORDS]


def title_match_fraction(text, title_words):
    if not title_words:
        return 0.0
    lowered = (text or "").lower()
    hits = sum(1 for w in title_words if w in lowered)
    return hits / len(title_words)


class _AnchorCollector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.anchors = []   # (href, text)
        self._href = None
        self._text_parts = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self._href = dict(attrs).get("href")
            self._text_parts = []

    def handle_data(self, data):
        if self._href is not None:
            self._text_parts.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self._href is not None:
            text = " ".join(" ".join(self._text_parts).split())
            if text:
                self.anchors.append((self._href, text))
            self._href = None
            self._text_parts = []


def find_position_link(html_text, base_url, title):
    """Scan anchors for one whose visible text matches the job title."""
    title_words = significant_title_words(title)
    if not title_words:
        return None

    collector = _AnchorCollector()
    try:
        collector.feed(html_text or "")
    except Exception:
        return None

    best_url, best_score = None, 0.0
    for href, text in collector.anchors:
        if not href or href.startswith(("#", "mailto:", "javascript:")):
            continue
        score = title_match_fraction(text, title_words)
        if score > best_score:
            best_score = score
            best_url = urljoin(base_url, href)

    # Require a strong match — most title words present in the anchor text.
    if best_url and best_score >= 0.6:
        return best_url
    return None


def resolve_apply_url(apply_url, title):
    """Validate that apply_url points at the specific position page.

    Returns (resolved_url, is_specific, page_html):
      - resolved_url: possibly-improved URL (anchor-matched position link)
      - is_specific:  False when the page doesn't mention the job title
                      (listing page / JS-rendered shell / broken link)
      - page_html:    the HTML of resolved_url, reusable for description fetch
    """
    if not apply_url or "t.me/" in apply_url or "telegram.me/" in apply_url:
        return apply_url, False, ""

    title_words = significant_title_words(title)

    try:
        html_text, final_url = fetch_html_with_final_url(apply_url)
    except Exception as e:
        print(f"Resolver could not fetch {apply_url}: {e}")
        return apply_url, False, ""

    # Page already mentions (most of) the title → looks like the right page.
    if title_match_fraction(html_text, title_words) >= 0.6 and len(title_words) > 0:
        # A listing page can still mention the title in a link; if a better
        # specific link exists and we're on an obvious listing path, prefer it.
        listing_like = re.search(r"/(positions?|careers?|jobs)/?$", final_url.rstrip("/") + "/") is not None
        if listing_like:
            candidate = find_position_link(html_text, final_url, title)
            if candidate and candidate.rstrip("/") != final_url.rstrip("/"):
                try:
                    cand_html, cand_final = fetch_html_with_final_url(candidate)
                    if title_match_fraction(cand_html, title_words) >= 0.6:
                        print(f"Resolver: listing {final_url} -> position {cand_final}")
                        return cand_final, True, cand_html
                except Exception as e:
                    print(f"Resolver candidate fetch failed {candidate}: {e}")
        return final_url, True, html_text

    # Title not on page — try to find a matching position link (SSR listings).
    candidate = find_position_link(html_text, final_url, title)
    if candidate:
        try:
            cand_html, cand_final = fetch_html_with_final_url(candidate)
            if title_match_fraction(cand_html, title_words) >= 0.6:
                print(f"Resolver: recovered position URL {cand_final} from {final_url}")
                return cand_final, True, cand_html
        except Exception as e:
            print(f"Resolver candidate fetch failed {candidate}: {e}")

    print(f"Resolver: {final_url} looks generic for title={title!r}")
    return final_url, False, html_text
