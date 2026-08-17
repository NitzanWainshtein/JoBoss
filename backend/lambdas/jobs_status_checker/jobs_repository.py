"""
DynamoDB helpers for the Tier 1 (Lambda) jobs status checker.

State machine lives on each job item:

  checkFailCount   — consecutive inconclusive results from the FULL pipeline
                      (Tier 1 + Tier 2 together). Reset to 0 the moment either
                      tier gets a confident read (open or closed).
  tier2Pending      — True while a job is waiting for the Playwright checker to
                      take the one case Tier 1 could not read on its own.
  lastCheckedAt     — ISO timestamp of the most recent check, either tier.
  reviewStatus      — "pending_review" once checkFailCount reaches the
                      escalation threshold (2, decided 2026-08-13). Absent
                      otherwise. A job in this state is skipped by both tiers
                      until an admin resolves it — see admin/handler.py.
  reviewReason      — why it was escalated, e.g. "http_403", "empty_response".
  reviewFlaggedAt   — ISO timestamp of escalation.

Tier 2 (backend/fargate/job-status-checker/) owns escalation, since it is the
tier that produces the day's FINAL outcome for a job Tier 1 could not read —
Tier 1 only ever hands a job off, it never increments the fail count itself.
Its write helpers are necessarily a separate copy (a Lambda zip and a Docker
image cannot share a module) — see that directory's jobs_repository.py, and
backend/tests/test_status_checker_markers_in_sync.py, which fails the moment the
two drift.
"""

from boto3.dynamodb.conditions import Attr


def scan_checkable_jobs(table, limit: int):
    """Active jobs that are not already mid-review and not already queued for
    Tier 2 from a prior run that has not finished yet."""
    scan_kwargs = {
        "FilterExpression": (
            Attr("isActive").eq(True)
            & Attr("reviewStatus").not_exists()
            & Attr("tier2Pending").not_exists()
        ),
        "ProjectionExpression": "jobId, applyUrl, title, company, checkFailCount",
        "Limit": limit,
    }

    jobs = []

    while len(jobs) < limit:
        response = table.scan(**scan_kwargs)
        jobs.extend(response.get("Items", []))

        last_evaluated_key = response.get("LastEvaluatedKey")

        if not last_evaluated_key:
            break

        scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
        scan_kwargs["Limit"] = limit - len(jobs)

    return jobs[:limit]


def delete_job(table, job_id: str):
    table.delete_item(Key={"jobId": job_id})


def mark_checked_open(table, job_id: str, now_iso: str):
    """Confident "still open" result: clear any accumulated failure state."""
    table.update_item(
        Key={"jobId": job_id},
        UpdateExpression=(
            "SET checkFailCount = :zero, lastCheckedAt = :now "
            "REMOVE tier2Pending, reviewStatus, reviewReason, reviewFlaggedAt"
        ),
        ExpressionAttributeValues={":zero": 0, ":now": now_iso},
    )


def flag_for_tier2(table, job_id: str, now_iso: str):
    """Tier 1 could not read this one — hand it to the Playwright checker.

    Deliberately does not touch checkFailCount: Tier 1 alone failing is not a
    day's failure, only Tier 2 also failing is.
    """
    table.update_item(
        Key={"jobId": job_id},
        UpdateExpression="SET tier2Pending = :true, lastCheckedAt = :now",
        ExpressionAttributeValues={":true": True, ":now": now_iso},
    )
