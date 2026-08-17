# F-18: automated job-closure checking — provisioning

Two-tier daily pipeline that closes out stale job postings without ever silently
guessing. Full design and the state machine live in
`backend/lambdas/jobs_status_checker/jobs_repository.py`'s module docstring —
read that first. This file is only about standing up Tier 2 and its schedule.

| Tier | What | Where | Status |
|---|---|---|---|
| 1 | Plain HTTP check | `joboss-jobs-status-checker` Lambda | **Already live** — confirmed `DRY_RUN=false`, `CHECK_LIMIT=400` on 2026-08-13. Code updated 2026-08-13 for 3-way classification; redeploy via `deploy_all.py` picks it up. |
| 2 | Real-browser check (Playwright) | `joboss-job-status-checker-trigger` Lambda → ECS Fargate task | **Not yet provisioned.** This directory. |

Tier 1's code change alone is safe to deploy at any time — jobs it cannot read now
get `tier2Pending=true` instead of being silently kept, and simply wait there
until Tier 2 exists to pick them up. But **do not leave that gap open long**:
until Tier 2 is running, every job Tier 1 can't read is parked indefinitely
(Tier 1 skips anything with `tier2Pending=true`), so provision Tier 2 promptly
after deploying Tier 1's new code, not on some later day.

## One-time setup, in order

1. **`infrastructure/job-status-checker/build_and_push.sh`** — builds
   `backend/fargate/job-status-checker` and pushes it to ECR. Run from the repo
   root; needs Docker + `ecr:GetAuthorizationToken`.
2. **`infrastructure/job-status-checker/setup_ecr_and_task.py`** — ECR repo, CW
   log group, and the ECS task definition. Reuses the `joboss-cluster` cluster
   and `JoBossLambdaRole` that `infrastructure/auto-apply/setup_fargate.py`
   already created — **no new IAM role or policy needed**, which is why this
   script makes no `iam:*` calls at all.
3. **`python infrastructure/deploy/deploy_all.py job-status-checker-trigger`**
   — deploys the dispatcher Lambda's code. It must exist before step 4 can
   point a schedule at it.
4. **`infrastructure/job-status-checker/setup_schedule.py`** — daily
   EventBridge schedule for the Tier 2 trigger. Deliberately does not touch
   Tier 1's existing schedule — see that script's docstring for why, and check
   Tier 1's actual time in the EventBridge console before trusting the
   placeholder stagger here.

None of steps 1, 2, or 4 could be run by the assistant session that wrote this
feature: `joboss-deploy`'s IAM permissions were narrowed to exactly 11 named
Lambda ARNs earlier the same day (`infrastructure/iam/`), and ECR/ECS/EventBridge
provisioning falls outside that on purpose. Run these as a human with broader
credentials, or temporarily re-attach `AdministratorAccess` per
`infrastructure/iam/README.md`'s "what this does NOT cover" section, run them,
then detach again.

## Rollout: canary before trusting it with real deletions

Both tiers default to `DRY_RUN=true` in their task/function configuration for
exactly this reason — a brand-new closure-detection heuristic should prove
itself on real production data before it is allowed to delete anything.

1. Deploy/provision everything with `DRY_RUN=true` on both tiers.
2. Let it run for a few real days. Read CloudWatch Logs for both:
   - `/aws/lambda/joboss-jobs-status-checker` (Tier 1)
   - `/ecs/joboss-job-status-checker` (Tier 2)
   Look for `"Would delete"` lines that seem wrong — a job that is obviously
   still open being flagged closed is the failure mode that matters most here.
3. Once satisfied, flip `DRY_RUN` to `false`:
   - Tier 1: `aws lambda update-function-configuration --function-name joboss-jobs-status-checker --environment "Variables={DRY_RUN=false,...}"` (keep the other existing variables — this call replaces the whole map, not just one key).
   - Tier 2: re-register the task definition with `DRY_RUN=false` in
     `setup_ecr_and_task.py` and re-run it (task definitions are immutable —
     changing an environment variable means a new revision, not an in-place edit).

## What "done" looks like day to day

- Jobs Tier 1 confirms closed (404/410/explicit text) — deleted immediately, no
  admin involvement. Decided 2026-08-13: no grace period.
- Jobs Tier 1 can't read get handed to Tier 2 same day.
- Jobs Tier 2 also can't read: `checkFailCount` increments. Below 2, tried again
  tomorrow. At 2, escalated to `reviewStatus=pending_review` — visible in the
  admin panel's "ממתין לאישור" tab, with a badge count that shows even before
  opening the tab.
- An admin resolves each one via that panel: confirms it's actually closed
  (deletes it) or confirms it's still open (clears all checker state so it
  resumes normal daily checking from scratch).
