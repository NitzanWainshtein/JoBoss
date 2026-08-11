"""
Step 1 — Create SQS queues and add SQS permissions to JoBossLambdaRole.

Creates:
  - joboss-auto-apply-dlq  (dead-letter queue)
  - joboss-auto-apply-queue (main queue, redrive to DLQ after 3 failures)

Adds inline IAM policy 'SQSSendReceiveAccess' to JoBossLambdaRole granting
sqs:SendMessage to the main queue and sqs:ReceiveMessage / DeleteMessage /
GetQueueAttributes to both (needed for the SQS-triggered Lambda).
"""
import boto3, json

REGION = "us-east-1"
ACCOUNT = "171109860478"
ROLE_NAME = "JoBossLambdaRole"

sqs = boto3.client("sqs", region_name=REGION)
iam = boto3.client("iam")

# ── 1. DLQ ───────────────────────────────────────────────────────────────────
dlq_resp = sqs.create_queue(
    QueueName="joboss-auto-apply-dlq",
    Attributes={
        "MessageRetentionPeriod": "86400",
        "VisibilityTimeout": "300",
    },
)
dlq_url = dlq_resp["QueueUrl"]
dlq_arn = sqs.get_queue_attributes(QueueUrl=dlq_url, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
print(f"DLQ created: {dlq_url}")
print(f"DLQ ARN:     {dlq_arn}")

# ── 2. Main queue with redrive policy ─────────────────────────────────────────
queue_resp = sqs.create_queue(
    QueueName="joboss-auto-apply-queue",
    Attributes={
        "VisibilityTimeout": "300",
        "MessageRetentionPeriod": "86400",
        "RedrivePolicy": json.dumps({
            "deadLetterTargetArn": dlq_arn,
            "maxReceiveCount": "3",
        }),
    },
)
queue_url = queue_resp["QueueUrl"]
queue_arn = sqs.get_queue_attributes(QueueUrl=queue_url, AttributeNames=["QueueArn"])["Attributes"]["QueueArn"]
print(f"\nMain queue created: {queue_url}")
print(f"Main queue ARN:     {queue_arn}")

# ── 3. IAM: add SQS inline policy to JoBossLambdaRole ────────────────────────
policy_doc = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "SQSSend",
            "Effect": "Allow",
            "Action": ["sqs:SendMessage"],
            "Resource": queue_arn,
        },
        {
            "Sid": "SQSConsume",
            "Effect": "Allow",
            "Action": [
                "sqs:ReceiveMessage",
                "sqs:DeleteMessage",
                "sqs:GetQueueAttributes",
                "sqs:ChangeMessageVisibility",
            ],
            "Resource": [queue_arn, dlq_arn],
        },
    ],
}
iam.put_role_policy(
    RoleName=ROLE_NAME,
    PolicyName="SQSSendReceiveAccess",
    PolicyDocument=json.dumps(policy_doc),
)
print(f"\nIAM policy 'SQSSendReceiveAccess' added to {ROLE_NAME}")
print("\nDone. Queue URL to put in swipes Lambda env var:")
print(f"  SQS_QUEUE_URL = {queue_url}")
