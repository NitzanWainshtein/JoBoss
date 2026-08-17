# JoBoss feature:
# - F-18: Job Status Monitoring & Cleanup

"""
Lambda entry point for Tier 1 of the daily job-closure check.

Runs once a day (see infrastructure/job-status-checker/ for the schedule) over
every active job not already mid-review or queued for Tier 2. For each job,
job_status_detector.classify_job_status makes one plain HTTP request and returns
one of three outcomes:

  "closed"        -> delete the job now. High-confidence signal (404/410, or
                      explicit closure text) — decided 2026-08-13 that this does
                      not need a grace period.
  "open"          -> clear any accumulated failure state, done for today.
  "inconclusive"  -> hand off to Tier 2 (backend/fargate/job-status-checker), a
                      real headless browser, rather than guessing. This is the
                      behavior change from the previous version of this file:
                      "could not check" and "confirmed open" used to both return
                      False and were indistinguishable — every job Tier 1
                      couldn't read was silently kept with no visibility.

Tier 2 owns the escalation-to-admin decision (2 consecutive full-pipeline
failures — see jobs_repository.py's module docstring), since it produces the
day's final outcome for whatever Tier 1 could not resolve on its own.
"""

import os

import boto3

from job_status_detector import classify_job_status
from jobs_repository import delete_job, flag_for_tier2, mark_checked_open, scan_checkable_jobs


AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
TABLE_NAME = os.getenv("DYNAMODB_JOBS_TABLE", "joboss-jobs")
CHECK_LIMIT = int(os.getenv("CHECK_LIMIT", "50"))
DRY_RUN = os.getenv("DRY_RUN", "true").lower() == "true"


dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
table = dynamodb.Table(TABLE_NAME)


def now_iso():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def require_env():
    missing = []

    if not TABLE_NAME:
        missing.append("DYNAMODB_JOBS_TABLE")

    if missing:
        raise ValueError(f"Missing required env vars: {', '.join(missing)}")


def lambda_handler(event, context):
    try:
        require_env()

        checked = 0
        deleted = 0
        would_delete = 0
        kept = 0
        flagged_for_tier2 = 0
        would_flag_for_tier2 = 0

        jobs = scan_checkable_jobs(table, CHECK_LIMIT)
        checked_at = now_iso()

        for job in jobs:
            checked += 1

            job_id = job["jobId"]
            apply_url = job.get("applyUrl", "")
            title = job.get("title", "")
            company = job.get("company", "")

            status, reason = classify_job_status(apply_url)

            if status == "closed":
                if DRY_RUN:
                    would_delete += 1
                    print(f"DRY RUN: Would delete inactive job: {title} @ {company} "
                          f"({apply_url}) reason={reason}")
                else:
                    delete_job(table, job_id)
                    deleted += 1
                    print(f"Deleted inactive job: {title} @ {company} ({apply_url}) reason={reason}")

            elif status == "open":
                kept += 1
                if not DRY_RUN:
                    mark_checked_open(table, job_id, checked_at)

            else:  # inconclusive
                if DRY_RUN:
                    would_flag_for_tier2 += 1
                    print(f"DRY RUN: Would flag for Tier 2: {title} @ {company} "
                          f"({apply_url}) reason={reason}")
                else:
                    flag_for_tier2(table, job_id, checked_at)
                    flagged_for_tier2 += 1
                    print(f"Flagged for Tier 2 (Playwright): {title} @ {company} "
                          f"({apply_url}) reason={reason}")

        result = {
            "message": "Jobs status check (Tier 1) completed",
            "checked": checked,
            "deleted": deleted,
            "wouldDelete": would_delete,
            "kept": kept,
            "flaggedForTier2": flagged_for_tier2,
            "wouldFlagForTier2": would_flag_for_tier2,
            "dryRun": DRY_RUN,
        }

        print(result)

        return {
            "statusCode": 200,
            "body": result,
        }

    except Exception as e:
        print(f"Jobs status check failed: {e}")

        return {
            "statusCode": 500,
            "body": {
                "error": str(e),
            },
        }
