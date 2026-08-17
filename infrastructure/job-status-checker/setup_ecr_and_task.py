"""
Step 2 — Provision ECR/CloudWatch/ECS task definition for the Tier 2
(Playwright) job-status checker.

Creates (idempotent — safe to re-run):
  - ECR repo:     joboss-job-status-checker
  - CW log group: /ecs/joboss-job-status-checker
  - ECS task def: joboss-job-status-checker-task (FARGATE, 0.5vCPU/1GB — this
    task only navigates and reads text, no form-filling or file uploads, so it
    needs much less than auto-apply's 1vCPU/2GB)

Deliberately reuses infrastructure already standing from the auto-apply setup
rather than creating new ones:
  - ECS cluster    joboss-cluster        (created by auto-apply's setup_fargate.py)
  - IAM role       JoBossLambdaRole      (already holds ecs:RunTask, iam:PassRole
                    for ecs-tasks.amazonaws.com, ECR pull, and CW log-write
                    permissions from that same setup — nothing new to grant)
  - VPC networking the same subnets/security group auto-apply uses

That reuse is why this script needs no IAM changes at all: everything it
registers only ever runs under permissions that already exist.

Run AFTER build_and_push.sh so the ECR image URI is available.
"""
import boto3

REGION      = "us-east-1"
ACCOUNT     = "171109860478"
ROLE_ARN    = f"arn:aws:iam::{ACCOUNT}:role/JoBossLambdaRole"
ECR_REPO    = "joboss-job-status-checker"
CLUSTER     = "joboss-cluster"
TASK_FAMILY = "joboss-job-status-checker-task"
LOG_GROUP   = "/ecs/joboss-job-status-checker"

# Same default-VPC networking as backend/fargate/auto-apply — see
# infrastructure/auto-apply/setup_fargate.py for where these came from.
SUBNET_IDS  = ["subnet-0a10d63e8b9de6c69", "subnet-035a97eeb27dc6634"]
SG_IDS      = ["sg-085aae94a31a97725"]

ecr  = boto3.client("ecr",  region_name=REGION)
ecs  = boto3.client("ecs",  region_name=REGION)
logs = boto3.client("logs", region_name=REGION)

# ── ECR repo ──────────────────────────────────────────────────────────────────
print("=== ECR ===")
try:
    resp = ecr.create_repository(
        repositoryName=ECR_REPO,
        imageScanningConfiguration={"scanOnPush": True},
    )
    ecr_uri = resp["repository"]["repositoryUri"]
    print(f"  Created: {ecr_uri}")
except ecr.exceptions.RepositoryAlreadyExistsException:
    ecr_uri = ecr.describe_repositories(repositoryNames=[ECR_REPO])["repositories"][0]["repositoryUri"]
    print(f"  Already exists: {ecr_uri}")
IMAGE_URI = f"{ecr_uri}:latest"

# ── CW log group ──────────────────────────────────────────────────────────────
print("\n=== CloudWatch ===")
try:
    logs.create_log_group(logGroupName=LOG_GROUP)
    logs.put_retention_policy(logGroupName=LOG_GROUP, retentionInDays=14)
    print(f"  Created: {LOG_GROUP}")
except logs.exceptions.ResourceAlreadyExistsException:
    print(f"  Already exists: {LOG_GROUP}")

# ── ECS cluster — verify, do not create; this is auto-apply's cluster ─────────
print("\n=== ECS cluster ===")
clusters = ecs.describe_clusters(clusters=[CLUSTER])["clusters"]
if not clusters or clusters[0]["status"] != "ACTIVE":
    raise SystemExit(
        f"Expected cluster '{CLUSTER}' to already exist (created by "
        f"infrastructure/auto-apply/setup_fargate.py) but it is missing or inactive. "
        f"Run that script first, or update CLUSTER here if it was renamed."
    )
print(f"  Using existing: {CLUSTER}")

# ── Task definition ───────────────────────────────────────────────────────────
print("\n=== ECS task definition ===")
task_def = {
    "family": TASK_FAMILY,
    "networkMode": "awsvpc",
    "requiresCompatibilities": ["FARGATE"],
    "cpu": "512",
    "memory": "1024",
    "executionRoleArn": ROLE_ARN,
    "taskRoleArn": ROLE_ARN,
    "containerDefinitions": [
        {
            "name": "job-status-checker",
            "image": IMAGE_URI,
            "essential": True,
            "environment": [
                {"name": "AWS_DEFAULT_REGION",    "value": REGION},
                {"name": "DYNAMODB_JOBS_TABLE",   "value": "joboss-jobs"},
                # Start in dry-run — see this directory's README for the canary
                # process before flipping this to "false" in a live redeploy.
                {"name": "DRY_RUN",               "value": "true"},
                {"name": "ESCALATE_AFTER_FAILS",  "value": "2"},
            ],
            "logConfiguration": {
                "logDriver": "awslogs",
                "options": {
                    "awslogs-group":         LOG_GROUP,
                    "awslogs-region":        REGION,
                    "awslogs-stream-prefix": "ecs",
                },
            },
        }
    ],
}
resp = ecs.register_task_definition(**task_def)
td_arn = resp["taskDefinition"]["taskDefinitionArn"]
print(f"  Registered: {td_arn}")

# ── Summary ───────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("SUMMARY")
print(f"  ECR image URI  : {IMAGE_URI}")
print(f"  ECS cluster    : {CLUSTER} (reused)")
print(f"  Task definition: {td_arn}")
print(f"  Subnets        : {SUBNET_IDS}")
print(f"  Security groups: {SG_IDS}")
print(f"  CW log group   : {LOG_GROUP}")
print()
print("Next: infrastructure/job-status-checker/setup_schedules.py")
