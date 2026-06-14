# JoBoss feature:
# - F-18: Job Status Monitoring & Cleanup

"""
Lambda entry point for deleting inactive jobs.

This Lambda scans a limited batch of active jobs, checks each company apply URL,
and deletes jobs whose pages strongly indicate that the posting is no longer
active.
"""

import os

import boto3

from job_status_detector import is_job_inactive
from jobs_repository import delete_job, scan_active_jobs


######## CONNECTED TO AWS #########
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
TABLE_NAME = os.getenv("DYNAMODB_JOBS_TABLE", "joboss-jobs")
CHECK_LIMIT = int(os.getenv("CHECK_LIMIT", "50"))
DRY_RUN = os.getenv("DRY_RUN", "true").lower() == "true"


dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
table = dynamodb.Table(TABLE_NAME)


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

        jobs = scan_active_jobs(table, CHECK_LIMIT)

        for job in jobs:
            checked += 1

            job_id = job["jobId"]
            apply_url = job.get("applyUrl", "")
            title = job.get("title", "")
            company = job.get("company", "")

            if is_job_inactive(apply_url):
                if DRY_RUN:
                    would_delete += 1
                    print(f"DRY RUN: Would delete inactive job: {title} @ {company} ({apply_url})")
                else:
                    delete_job(table, job_id)
                    deleted += 1
                    print(f"Deleted inactive job: {title} @ {company} ({apply_url})")
            else:
                kept += 1

        result = {
            "message": "Jobs status check completed",
            "checked": checked,
            "deleted": deleted,
            "wouldDelete": would_delete,
            "kept": kept,
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
