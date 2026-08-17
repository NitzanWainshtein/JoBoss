# JoBoss feature:
# - F-18: Job Status Monitoring & Cleanup (Tier 2 dispatch)

"""
Tiny dispatcher: EventBridge invokes this Lambda once a day, shortly after the
Tier 1 Lambda (joboss-jobs-status-checker) finishes, and this starts the Tier 2
Fargate task (backend/fargate/job-status-checker) that checks whatever Tier 1
flagged as tier2Pending with a real headless browser.

Why a Lambda in between rather than pointing EventBridge at ECS directly:
EventBridge-to-ECS needs its own IAM role with ecs:RunTask + iam:PassRole.
joboss-auto-apply already calls ecs.run_task() from a Lambda using the existing
JoBossLambdaRole, which already holds exactly those permissions — reusing that
proven path means this needed no new IAM role at all, only a resource-based
Lambda permission for EventBridge to invoke it (the same as any scheduled Lambda).
"""

import os

import boto3

REGION = os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
CLUSTER = os.environ.get("ECS_CLUSTER", "joboss-cluster")
TASK_DEFINITION = os.environ.get("ECS_TASK_DEFINITION", "joboss-job-status-checker-task")
SUBNET_IDS = os.environ.get("SUBNET_IDS", "").split(",") if os.environ.get("SUBNET_IDS") else []
SECURITY_GROUP_IDS = os.environ.get("SECURITY_GROUP_IDS", "").split(",") if os.environ.get("SECURITY_GROUP_IDS") else []

ecs = boto3.client("ecs", region_name=REGION)


def require_env():
    # Checks the parsed module-level lists, not os.environ directly — SUBNET_IDS
    # and SECURITY_GROUP_IDS are already split into lists at import time, and
    # that parsing is exactly what tests monkeypatch to exercise this function.
    missing = []
    if not SUBNET_IDS:
        missing.append("SUBNET_IDS")
    if not SECURITY_GROUP_IDS:
        missing.append("SECURITY_GROUP_IDS")
    if missing:
        raise ValueError(f"Missing required env vars: {', '.join(missing)}")


def lambda_handler(event, context):
    try:
        require_env()

        resp = ecs.run_task(
            cluster=CLUSTER,
            taskDefinition=TASK_DEFINITION,
            launchType="FARGATE",
            count=1,
            networkConfiguration={
                "awsvpcConfiguration": {
                    "subnets": SUBNET_IDS,
                    "securityGroups": SECURITY_GROUP_IDS,
                    "assignPublicIp": "ENABLED",
                }
            },
        )

        failures = resp.get("failures", [])
        if failures:
            print(f"ECS run_task failures: {failures}")
            return {"statusCode": 500, "body": {"error": "run_task failed", "failures": failures}}

        task_arns = [t["taskArn"] for t in resp.get("tasks", [])]
        print(f"Started Tier 2 task(s): {task_arns}")
        return {"statusCode": 200, "body": {"message": "Tier 2 task started", "taskArns": task_arns}}

    except Exception as e:
        print(f"Failed to start Tier 2 task: {e}")
        return {"statusCode": 500, "body": {"error": str(e)}}
