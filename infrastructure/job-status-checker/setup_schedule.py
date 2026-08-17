"""
Step 3 — Schedule the Tier 2 trigger Lambda to run daily.

Creates (idempotent — safe to re-run):
  - EventBridge rule: joboss-job-status-checker-tier2-schedule
  - Target:           joboss-job-status-checker-trigger (the dispatcher Lambda)
  - Lambda permission: lets EventBridge invoke that Lambda

Deliberately does NOT touch Tier 1's existing schedule
(joboss-jobs-status-checker-schedule). That rule was already live in production
before this feature existed — DRY_RUN=false, CHECK_LIMIT=400 confirmed via
`aws lambda get-function-configuration` on 2026-08-13 — and this session's
narrowed IAM credentials cannot even read EventBridge rules to see its current
cron expression (events:ListRules was denied), so guessing and overwriting it
is exactly the kind of blind change that could silently change production
behavior. Check the EventBridge console for Tier 1's actual time before
tuning TIER2_OFFSET_MINUTES below — Tier 2 must run AFTER Tier 1 finishes
flagging jobs, or there is nothing yet for it to pick up.

Run AFTER setup_ecr_and_task.py and infrastructure/deploy/deploy_all.py has
deployed joboss-job-status-checker-trigger at least once (the target must exist
before a rule can point at it).
"""
import boto3

REGION = "us-east-1"
ACCOUNT = "171109860478"
RULE_NAME = "joboss-job-status-checker-tier2-schedule"
TARGET_LAMBDA = "joboss-job-status-checker-trigger"
TARGET_LAMBDA_ARN = f"arn:aws:lambda:{REGION}:{ACCOUNT}:function:{TARGET_LAMBDA}"

# Placeholder: 03:30 UTC daily. ADJUST after checking Tier 1's actual schedule
# in the EventBridge console — this must run comfortably after Tier 1 finishes
# its pass over up to 400 jobs (each check has a 12s HTTP timeout, so a full
# run is bounded by CHECK_LIMIT * 12s in the worst case, well under the
# Lambda's own 600s configured timeout in practice).
CRON_EXPRESSION = "cron(30 3 * * ? *)"

events = boto3.client("events", region_name=REGION)
lam = boto3.client("lambda", region_name=REGION)

print("=== EventBridge rule ===")
events.put_rule(
    Name=RULE_NAME,
    ScheduleExpression=CRON_EXPRESSION,
    State="ENABLED",
    Description="Daily Tier 2 (Playwright) job-closure check — F-18. "
                 "Must run after the Tier 1 Lambda's own schedule.",
)
print(f"  Rule '{RULE_NAME}' set to {CRON_EXPRESSION}")

print("\n=== Lambda permission ===")
try:
    lam.add_permission(
        FunctionName=TARGET_LAMBDA,
        StatementId="AllowEventBridgeInvoke",
        Action="lambda:InvokeFunction",
        Principal="events.amazonaws.com",
        SourceArn=f"arn:aws:events:{REGION}:{ACCOUNT}:rule/{RULE_NAME}",
    )
    print("  Granted EventBridge permission to invoke the Lambda")
except lam.exceptions.ResourceConflictException:
    print("  Permission already granted")

print("\n=== Target ===")
events.put_targets(
    Rule=RULE_NAME,
    Targets=[{"Id": "job-status-checker-tier2", "Arn": TARGET_LAMBDA_ARN}],
)
print(f"  Target set: {TARGET_LAMBDA_ARN}")

print("\n" + "=" * 60)
print(f"Tier 2 will run daily at {CRON_EXPRESSION} (UTC) once ENABLED above takes effect.")
print("Before trusting it: check Tier 1's actual schedule in the EventBridge console")
print("and adjust CRON_EXPRESSION here (then re-run) if the stagger is too tight.")
