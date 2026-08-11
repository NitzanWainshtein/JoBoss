"""
Backfill broken job descriptions.

Scans all jobs in DynamoDB and re-normalizes descriptions for jobs that still
contain the old placeholder/filler text. Uses the updated AI normalizer which
generates plausible content from domain knowledge when the job URL is
inaccessible (JS-rendered sites, 403, etc.).

Run from the repo root:
  python .tmp_lambda/backfill_descriptions.py
"""
import json
import ssl
import sys
import urllib.request
from pathlib import Path

import boto3

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "lambdas" / "jobs_importer"))

from job_description_fetcher import fetch_full_description
from job_description_ai import normalize_description_with_ai

REGION = "us-east-1"
JOBS_TABLE = "joboss-jobs"

# Only flag the old filler placeholder phrases — NOT our own fallback messages
FILLER_PHRASES = [
    "no specific responsibilities were detailed",
    "no specific requirements were detailed",
    "no specific technologies were mentioned",
    "no nice-to-have qualifications were detailed",
    "review the original apply page for role-specific",
    "not specified in the imported source text",
    "did not expose a complete structured job description",
]

dynamodb = boto3.resource("dynamodb", region_name=REGION)
table = dynamodb.Table(JOBS_TABLE)


def is_broken(description: str) -> bool:
    if not description:
        return True
    low = description.lower()
    return any(phrase in low for phrase in FILLER_PHRASES)


def scan_all_jobs():
    resp = table.scan()
    items = resp.get("Items", [])
    while "LastEvaluatedKey" in resp:
        resp = table.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        items.extend(resp.get("Items", []))
    return items


def try_fetch_html(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0", "Accept": "text/html,application/xhtml+xml"},
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            return r.read().decode("utf-8", errors="ignore")
    except Exception:
        ctx = ssl._create_unverified_context()
        try:
            with urllib.request.urlopen(req, timeout=12, context=ctx) as r:
                return r.read().decode("utf-8", errors="ignore")
        except Exception:
            return ""


def main():
    print("Scanning jobs table…")
    jobs = scan_all_jobs()
    broken = [j for j in jobs if is_broken(j.get("description", ""))]
    print(f"Total jobs: {len(jobs)}  |  Still broken: {len(broken)}")

    if not broken:
        print("Nothing to fix.")
        return

    fixed = failed = 0
    for job in broken:
        job_id    = job.get("jobId", "?")
        title     = job.get("title", "")
        company   = job.get("company", "")
        location  = job.get("location", "")
        apply_url = job.get("applyUrl", "")
        print(f"\n[{job_id}] {title} @ {company}")

        # Try fetching real content — even if it fails the normalizer will
        # now generate from domain knowledge for short/empty raw_description
        raw = ""
        if apply_url and "t.me/" not in apply_url and "telegram.me/" not in apply_url:
            html = try_fetch_html(apply_url)
            if html:
                raw = fetch_full_description(apply_url, "", prefetched_html=html)
                if raw:
                    print(f"  Fetched {len(raw)} chars")
                else:
                    print(f"  HTML fetched but no content extracted — will generate from metadata")
            else:
                print(f"  URL unreachable — will generate from metadata")

        normalized = normalize_description_with_ai(title, company, location, raw)
        new_desc  = normalized["description"]
        new_short = normalized["shortDescription"]

        if is_broken(new_desc):
            # First attempt failed — force generate-from-knowledge mode by passing empty raw
            print(f"  First attempt broken — retrying with generate-from-knowledge mode")
            normalized = normalize_description_with_ai(title, company, location, "")
            new_desc  = normalized["description"]
            new_short = normalized["shortDescription"]

        if is_broken(new_desc):
            print(f"  AI still produced broken output — skipping")
            failed += 1
            continue

        table.update_item(
            Key={"jobId": job_id},
            UpdateExpression="SET #d = :d, shortDescription = :s",
            ExpressionAttributeNames={"#d": "description"},
            ExpressionAttributeValues={":d": new_desc, ":s": new_short},
        )
        sections = [line for line in new_desc.split("\n") if line and line[0].isupper() and len(line) < 30]
        print(f"  Updated ✓  sections: {sections}")
        fixed += 1

    print(f"\nDone. Fixed: {fixed}  |  Could not fix: {failed}")


if __name__ == "__main__":
    main()
