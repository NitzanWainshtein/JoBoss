# Auto Apply pipeline — provisioning

The Auto Apply feature is `swipes Lambda → SQS → auto-apply Lambda → ECS Fargate
task (Playwright)`. These four scripts provision it. They are idempotent and safe
to re-run, but the **order matters** — each step depends on what the previous one
created.

| # | Script | Creates |
|---|---|---|
| 1 | `setup_sqs.py` | `joboss-auto-apply-queue` + DLQ, and the `SQSSendReceiveAccess` policy on `JoBossLambdaRole` |
| 2 | `build_and_push.sh` | Builds `backend/fargate/auto-apply` and pushes it to the `joboss-auto-apply` ECR repo. **Run from the repo root** (the Docker context path is relative). Needs Docker + `ecr:GetAuthorizationToken`. First build takes ~5 min. |
| 3 | `setup_fargate.py` | ECR repo, `joboss-cluster`, the `/ecs/joboss-auto-apply` log group, the FARGATE task definition (1 vCPU / 2 GB), plus the ECS/SES IAM policies. Needs the image from step 2 to exist. SES sender verification requires a manual click in the emailed link. |
| 4 | `deploy_auto_apply.py` | Updates `joboss-swipes` with the queue URL env var, and creates/updates the `joboss-auto-apply` Lambda with its SQS event-source mapping. |

Day-to-day code changes to the two Lambdas go through
`infrastructure/deploy/deploy_all.py` instead — these scripts are only for
standing the pipeline up (or rebuilding it in a new account/region).

Changing the Playwright automation in `backend/fargate/auto-apply/apply.py`
requires re-running step 2; the ECS task pulls `:latest` on each run, so no
task-definition update is needed for a code-only image change.
