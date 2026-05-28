"""
DynamoDB helpers for the jobs status checker.

This module scans active jobs from DynamoDB and deletes jobs that are confirmed
to be inactive.
"""

from boto3.dynamodb.conditions import Attr


def scan_active_jobs(table, limit: int):
    scan_kwargs = {
        "FilterExpression": Attr("isActive").eq(True),
        "ProjectionExpression": "jobId, applyUrl, title, company",
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
    table.delete_item(
        Key={
            "jobId": job_id,
        }
    )
