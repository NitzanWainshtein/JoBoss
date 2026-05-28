"""
DynamoDB persistence helpers for imported jobs.

This module owns duplicate detection and writing job items to DynamoDB. It keeps
the DynamoDB access details outside the Lambda handler.
"""

from boto3.dynamodb.conditions import Attr


def exists_by_source_job(table, source: str, source_job_id: str) -> bool:
    scan_kwargs = {
        "FilterExpression": Attr("source").eq(source) & Attr("sourceJobId").eq(source_job_id),
        "ProjectionExpression": "jobId",
    }

    while True:
        resp = table.scan(**scan_kwargs)

        if resp.get("Items"):
            return True

        last_evaluated_key = resp.get("LastEvaluatedKey")

        if not last_evaluated_key:
            return False

        scan_kwargs["ExclusiveStartKey"] = last_evaluated_key