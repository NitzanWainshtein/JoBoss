import re

"""
Telegram job parsing helpers.

This module parses Telegram job messages into structured job fields and extracts
metadata embedded in Telegram message entities, including the real company apply
URL and Telegram preview description.
"""

def parse_message(text: str):
    if not text:
        return None

    clean = " ".join(text.split())

    if "@" not in clean:
        return None

    title_part, rest = clean.split("@", 1)
    title = title_part.strip(" -•\t")

    company = rest

    for stop in ["Posted on:", "Location:", "Click here", "#"]:
        idx = company.find(stop)

        if idx != -1:
            company = company[:idx]

    company = company.strip(" -•\t")

    location = "Unknown"

    loc_match = re.search(
        r"Location:\s*(.*?)(Click here|#|$)",
        clean,
        flags=re.IGNORECASE
    )

    if loc_match:
        location = loc_match.group(1).strip(" -•\t")

    if not title or not company:
        return None

    return {
        "title": title,
        "company": company,
        "location": location,
        "description": clean[:5000],
    }


def text_slice_by_entity(text: str, offset: int, length: int) -> str:
    encoded = text.encode("utf-16-le")
    return encoded[offset * 2:(offset + length) * 2].decode("utf-16-le")


def is_telegram_url(url: str) -> bool:
    return "t.me/" in url or "telegram.me/" in url


def extract_apply_url(message, fallback_url: str) -> str:
    text = message.message or ""

    for entity in message.entities or []:
        if entity.__class__.__name__ == "MessageEntityTextUrl":
            url = getattr(entity, "url", "")
            if url and not is_telegram_url(url):
                return url

    for entity in message.entities or []:
        if entity.__class__.__name__ == "MessageEntityUrl":
            url = text_slice_by_entity(text, entity.offset, entity.length)
            if url and not is_telegram_url(url):
                return url

    return fallback_url


def extract_preview_description(message, fallback_description: str) -> str:
    webpage = getattr(getattr(message, "media", None), "webpage", None)
    description = getattr(webpage, "description", None) if webpage else None

    if description:
        return description.strip()[:5000]

    return fallback_description