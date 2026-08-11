"""
Step 2 — Provision ECS/ECR/IAM/SES infrastructure for Auto Apply Phase 2.

Creates (idempotent — safe to re-run):
  - ECR repo:          joboss-auto-apply
  - ECS cluster:       joboss-cluster
  - CW log group:      /ecs/joboss-auto-apply
  - ECS task def:      joboss-auto-apply-task (FARGATE, 1vCPU/2GB)
  - IAM policies:      ECSRunTaskAccess, SESEmailAccess added to JoBossLambdaRole
  - SES identity:      requests verification for SES_SENDER (manual click required)

Run AFTER build_and_push.sh so the ECR image URI is available.
"""
import boto3, json, time

REGION      = "us-east-1"
ACCOUNT     = "171109860478"
ROLE_ARN    = f"arn:aws:iam::{ACCOUNT}:role/JoBossLambdaRole"
ROLE_NAME   = "JoBossLambdaRole"
ECR_REPO    = "joboss-auto-apply"
CLUSTER     = "joboss-cluster"
TASK_FAMILY = "joboss-auto-apply-task"
LOG_GROUP   = "/ecs/joboss-auto-apply"
SES_SENDER  = "nitzanwa@gmail.com"

# Networking — use first two public subnets of the default VPC
SUBNET_IDS  = ["subnet-0a10d63e8b9de6c69", "subnet-035a97eeb27dc6634"]
SG_IDS      = ["sg-085aae94a31a97725"]

ecr   = boto3.client("ecr",  region_name=REGION)
ecs   = boto3.client("ecs",  region_name=REGION)
logs  = boto3.client("logs", region_name=REGION)
iam   = boto3.client("iam")
ses   = boto3.client("ses",  region_name=REGION)

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

# ── ECS cluster ───────────────────────────────────────────────────────────────
print("\n=== ECS cluster ===")
clusters = ecs.describe_clusters(clusters=[CLUSTER])["clusters"]
if clusters and clusters[0]["status"] == "ACTIVE":
    print(f"  Already exists: {CLUSTER}")
else:
    ecs.create_cluster(clusterName=CLUSTER)
    print(f"  Created: {CLUSTER}")

# ── Task definition ───────────────────────────────────────────────────────────
print("\n=== ECS task definition ===")
task_def = {
    "family": TASK_FAMILY,
    "networkMode": "awsvpc",
    "requiresCompatibilities": ["FARGATE"],
    "cpu": "1024",
    "memory": "2048",
    "executionRoleArn": ROLE_ARN,
    "taskRoleArn": ROLE_ARN,
    "containerDefinitions": [
        {
            "name": "auto-apply",
            "image": IMAGE_URI,
            "essential": True,
            "environment": [
                # TASK_PAYLOAD is overridden per-run at launch time
                {"name": "TASK_PAYLOAD",          "value": "{}"},
                {"name": "AWS_DEFAULT_REGION",    "value": REGION},
                {"name": "APPLICATIONS_TABLE",    "value": "joboss-applications"},
                {"name": "USERS_TABLE",           "value": "joboss-users"},
                {"name": "SES_SENDER",            "value": SES_SENDER},
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

# ── IAM: ECS RunTask + PassRole ───────────────────────────────────────────────
print("\n=== IAM ===")
ecs_policy = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "ECSRunTask",
            "Effect": "Allow",
            "Action": ["ecs:RunTask", "ecs:DescribeTasks"],
            "Resource": "*",
        },
        {
            "Sid": "PassRoleToECS",
            "Effect": "Allow",
            "Action": "iam:PassRole",
            "Resource": ROLE_ARN,
            "Condition": {"StringLike": {"iam:PassedToService": "ecs-tasks.amazonaws.com"}},
        },
        {
            # Execution role needs these to pull ECR images and write CW logs
            "Sid": "ECRAndLogs",
            "Effect": "Allow",
            "Action": [
                "ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:BatchGetImage",
                "logs:CreateLogStream",
                "logs:PutLogEvents",
                "logs:CreateLogGroup",
            ],
            "Resource": "*",
        },
    ],
}
iam.put_role_policy(RoleName=ROLE_NAME, PolicyName="ECSRunTaskAccess",
                    PolicyDocument=json.dumps(ecs_policy))
print("  ECSRunTaskAccess policy added ✓")

# Trust policy must include ecs-tasks so Fargate can use this role
trust = iam.get_role(RoleName=ROLE_NAME)["Role"]["AssumeRolePolicyDocument"]
svc = trust["Statement"][0]["Principal"].get("Service", [])
if isinstance(svc, str):
    svc = [svc]
if "ecs-tasks.amazonaws.com" not in svc:
    svc.append("ecs-tasks.amazonaws.com")
    trust["Statement"][0]["Principal"]["Service"] = svc
    iam.update_assume_role_policy(RoleName=ROLE_NAME, PolicyDocument=json.dumps(trust))
    print("  Role trust updated — ecs-tasks.amazonaws.com added ✓")
else:
    print("  Role trust already includes ecs-tasks.amazonaws.com ✓")

ses_policy = {
    "Version": "2012-10-17",
    "Statement": [{
        "Sid": "SESEmailAccess",
        "Effect": "Allow",
        "Action": ["ses:SendEmail", "ses:SendRawEmail"],
        "Resource": "*",
    }],
}
iam.put_role_policy(RoleName=ROLE_NAME, PolicyName="SESEmailAccess",
                    PolicyDocument=json.dumps(ses_policy))
print("  SESEmailAccess policy added ✓")

# ── SES sender verification ───────────────────────────────────────────────────
print(f"\n=== SES verification for {SES_SENDER} ===")
existing = ses.list_identities()["Identities"]
if SES_SENDER in existing:
    attrs = ses.get_identity_verification_attributes(Identities=[SES_SENDER])
    status = attrs["VerificationAttributes"].get(SES_SENDER, {}).get("VerificationStatus", "?")
    print(f"  Already registered, status={status}")
else:
    ses.verify_email_identity(EmailAddress=SES_SENDER)
    print(f"  ⚠️  Verification email sent to {SES_SENDER}.")
    print(f"     You MUST click the link in that email before SES will send from it.")

# ── Summary ───────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("SUMMARY")
print(f"  ECR image URI  : {IMAGE_URI}")
print(f"  ECS cluster    : {CLUSTER}")
print(f"  Task definition: {td_arn}")
print(f"  Subnets        : {SUBNET_IDS}")
print(f"  Security groups: {SG_IDS}")
print(f"  CW log group   : {LOG_GROUP}")
print()
print("Next steps:")
print("  1. Verify SES email (click link in inbox)")
print(f"  2. Build & push Docker image:")
print(f"       bash .tmp_lambda/build_and_push.sh")
print(f"  3. Update auto-apply Lambda:")
print(f"       python .tmp_lambda/deploy_auto_apply.py")
