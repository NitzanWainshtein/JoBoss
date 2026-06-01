"""
One-time backfill: scan joboss-jobs for records where applyUrl is missing,
empty, or a t.me link, then extract the real URL from the description and
update the record.

Run locally:
    python backfill_apply_urls.py [--dry-run]
"""

import argparse
import re
import sys

import boto3

TABLE_NAME = "joboss-jobs"
REGION = "us-east-1"


def is_telegram_url(url: str) -> bool:
    return "t.me/" in url or "telegram.me/" in url


def extract_apply_url(description: str) -> str:
    match = re.search(r'\[.*?לינק.*?\]\((https?://[^\)]+)\)', description)
    if match:
        return match.group(1)
    match = re.search(r'https?://\S+', description)
    if match:
        return match.group(0).rstrip(')')
    return ''


def needs_backfill(item: dict) -> bool:
    url = item.get("applyUrl", "")
    return not url or is_telegram_url(url)


def run(dry_run: bool):
    dynamodb = boto3.resource("dynamodb", region_name=REGION)
    table = dynamodb.Table(TABLE_NAME)

    updated = 0
    skipped_no_url = 0
    already_ok = 0
    scan_kwargs: dict = {}

    while True:
        resp = table.scan(**scan_kwargs)
        for item in resp.get("Items", []):
            if not needs_backfill(item):
                already_ok += 1
                continue

            description = item.get("description", "")
            new_url = extract_apply_url(description)

            if not new_url or is_telegram_url(new_url):
                skipped_no_url += 1
                continue

            print(f"  jobId={item['jobId']} | old={item.get('applyUrl', '')!r} → new={new_url!r}")
            if not dry_run:
                table.update_item(
                    Key={"jobId": item["jobId"]},
                    UpdateExpression="SET applyUrl = :u",
                    ExpressionAttributeValues={":u": new_url},
                )
            updated += 1

        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            break
        scan_kwargs["ExclusiveStartKey"] = last_key

    print(f"\nDone — updated={updated}, skipped_no_url={skipped_no_url}, already_ok={already_ok}"
          + (" (dry-run, no writes)" if dry_run else ""))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run(dry_run=args.dry_run)
