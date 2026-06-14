# JoBoss features:
# - F-08: Auto-Apply Automation
# - F-20: Email Notification (Amazon SES)

"""
joBoss Auto Apply Lambda — Phase 2
SQS-triggered. For each LIKE with autoApply enabled:
  1. Marks the application as auto_apply_pending in DynamoDB.
  2. Launches an ECS Fargate task that runs the Playwright apply.py script.
  3. Logs the Fargate task ARN.
"""

import json
import os
from datetime import datetime, timezone

import boto3

REGION            = os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
APPLICATIONS_TABLE = os.environ.get("APPLICATIONS_TABLE", "joboss-applications")
ECS_CLUSTER       = os.environ.get("ECS_CLUSTER",     "joboss-cluster")
TASK_DEFINITION   = os.environ.get("TASK_DEFINITION", "joboss-auto-apply-task")
SUBNET_IDS        = os.environ.get("SUBNET_IDS",  "subnet-0a10d63e8b9de6c69,subnet-035a97eeb27dc6634").split(",")
SECURITY_GROUP_IDS = os.environ.get("SECURITY_GROUP_IDS", "sg-085aae94a31a97725").split(",")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
ecs      = boto3.client("ecs",        region_name=REGION)
apps_tbl = dynamodb.Table(APPLICATIONS_TABLE)


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def mark_pending(user_id, job_id):
    # Write the system result into the dedicated autoApplyStatus track so the
    # user's funnel `status` (SUBMITTED/INTERVIEW/...) is never overwritten.
    apps_tbl.update_item(
        Key={"userId": user_id, "jobId": job_id},
        UpdateExpression="SET autoApplyStatus = :a, updatedAt = :ts",
        ExpressionAttributeValues={":a": "pending", ":ts": now_iso()},
    )
    print(f"AUTO_APPLY: autoApplyStatus → pending (userId={user_id}, jobId={job_id})")


def launch_fargate(payload):
    """
    Launch a Fargate task, injecting the message payload as TASK_PAYLOAD.
    Returns the task ARN on success, raises on failure.
    """
    resp = ecs.run_task(
        cluster=ECS_CLUSTER,
        taskDefinition=TASK_DEFINITION,
        launchType="FARGATE",
        networkConfiguration={
            "awsvpcConfiguration": {
                "subnets":        SUBNET_IDS,
                "securityGroups": SECURITY_GROUP_IDS,
                "assignPublicIp": "ENABLED",   # needed for ECR/S3 pull without NAT
            }
        },
        overrides={
            "containerOverrides": [
                {
                    "name": "auto-apply",
                    "environment": [
                        {"name": "TASK_PAYLOAD", "value": json.dumps(payload)},
                    ],
                }
            ]
        },
        count=1,
    )

    failures = resp.get("failures", [])
    if failures:
        raise RuntimeError(f"ECS run_task failures: {failures}")

    task_arn = resp["tasks"][0]["taskArn"]
    return task_arn


def process_record(record):
    raw     = record.get("body", "{}")
    payload = json.loads(raw)

    user_id  = payload.get("userId", "")
    job_id   = payload.get("jobId", "")
    job_title = payload.get("jobTitle", "")
    company  = payload.get("company", "")

    print(
        f"AUTO_APPLY RECEIVED: userId={user_id}, jobId={job_id}, "
        f"company={company}, title={job_title}"
    )

    if not user_id or not job_id:
        print("AUTO_APPLY WARNING: missing userId or jobId — skipping")
        return

    # 1. Mark pending
    try:
        mark_pending(user_id, job_id)
    except Exception as e:
        print(f"AUTO_APPLY DB ERROR (mark_pending): {e}")
        # Continue — still try to launch Fargate

    # 2. Launch Fargate task
    try:
        task_arn = launch_fargate(payload)
        print(f"AUTO_APPLY: Fargate task launched → {task_arn}")
    except Exception as e:
        print(f"AUTO_APPLY ECS ERROR: userId={user_id}, jobId={job_id}, error={e}")
        # Update status to failed so the user isn't left with 'pending' forever
        try:
            apps_tbl.update_item(
                Key={"userId": user_id, "jobId": job_id},
                UpdateExpression="SET autoApplyStatus = :a, failReason = :fr, updatedAt = :ts",
                ExpressionAttributeValues={
                    ":a": "failed",
                    ":fr": f"Fargate launch error: {str(e)[:300]}",
                    ":ts": now_iso(),
                },
            )
        except Exception:
            pass


def handler(event, context):
    records = event.get("Records", [])
    print(f"AUTO_APPLY BATCH: {len(records)} record(s)")

    for record in records:
        try:
            process_record(record)
        except Exception as e:
            print(f"AUTO_APPLY RECORD ERROR: {e}")

    return {"statusCode": 200, "body": f"Processed {len(records)} record(s)"}
