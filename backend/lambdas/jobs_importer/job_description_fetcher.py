"""
Full job description fetching helpers.

This module will fetch and extract fuller descriptions from company job pages.
For now it preserves the provided fallback description until the site-specific
or generic extraction logic is added.
"""


def fetch_full_description(apply_url: str, fallback_description: str) -> str:
    return fallback_description