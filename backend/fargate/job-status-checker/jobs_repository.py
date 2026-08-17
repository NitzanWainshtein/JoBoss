"""
DynamoDB helpers for the Tier 2 (Fargate/Playwright) jobs status checker.

Deliberately a separate copy from
backend/lambdas/jobs_status_checker/jobs_repository.py — a Lambda zip and a Docker
image cannot share a Python module without shared-layer infrastructure this
project does not have yet (see the "Lambda Layer" item in the project's open
punch list). Kept honest by backend/tests/test_status_checker_markers_in_sync.py,
which fails the moment the two tiers' closure-text marker lists drift, and by
matching field names/semantics documented in the Tier 1 file's module docstring —
read that first, this is the same state machine from the other side.
"""

from boto3.dynamodb.conditions import Attr


def scan_tier2_pending(table):
    """Every job Tier 1 flagged as unreadable by a plain HTTP request."""
    scan_kwargs = {
        "FilterExpression": Attr("tier2Pending").eq(True),
        "ProjectionExpression": "jobId, applyUrl, title, company, checkFailCount",
    }
    jobs = []
    while True:
        response = table.scan(**scan_kwargs)
        jobs.extend(response.get("Items", []))
        last_evaluated_key = response.get("LastEvaluatedKey")
        if not last_evaluated_key:
            break
        scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
    return jobs


def delete_job(table, job_id: str):
    table.delete_item(Key={"jobId": job_id})


def mark_checked_open(table, job_id: str, now_iso: str):
    """A real browser confirms the job is still open: clear all failure state."""
    table.update_item(
        Key={"jobId": job_id},
        UpdateExpression=(
            "SET checkFailCount = :zero, lastCheckedAt = :now "
            "REMOVE tier2Pending, reviewStatus, reviewReason, reviewFlaggedAt"
        ),
        ExpressionAttributeValues={":zero": 0, ":now": now_iso},
    )


def mark_still_inconclusive(table, job_id: str, reason: str, fail_count: int, now_iso: str):
    """Even a real browser couldn't tell, but below the escalation threshold —
    wait for tomorrow's cycle instead of bothering an admin over one bad day."""
    table.update_item(
        Key={"jobId": job_id},
        UpdateExpression=(
            "SET checkFailCount = :n, lastCheckedAt = :now, lastCheckReason = :reason "
            "REMOVE tier2Pending"
        ),
        ExpressionAttributeValues={":n": fail_count, ":now": now_iso, ":reason": reason},
    )


def escalate_to_review(table, job_id: str, reason: str, fail_count: int, now_iso: str):
    """checkFailCount just reached the threshold: hand this to a human. Both tiers
    skip a job in this state until admin/handler.py's resolve endpoint clears it."""
    table.update_item(
        Key={"jobId": job_id},
        UpdateExpression=(
            "SET reviewStatus = :pending, reviewReason = :reason, reviewFlaggedAt = :now, "
            "checkFailCount = :n, lastCheckedAt = :now "
            "REMOVE tier2Pending"
        ),
        ExpressionAttributeValues={
            ":pending": "pending_review", ":reason": reason, ":now": now_iso, ":n": fail_count,
        },
    )
