# joboss-deploy: scoped permissions

## What this replaces

`joboss-deploy` — the IAM user `infrastructure/deploy/deploy_all.py` authenticates
as to push Lambda code — held `AdministratorAccess`: full control of the AWS
account, on a long-lived access key sitting on a workstation. A "deploy" credential
does not need that. It needs to update eleven specific Lambda functions.

`infrastructure/iam/joboss-deploy-policy.json` is what it holds now:

| Statement | Grants |
|---|---|
| `UpdateOnlyTheseLambdas` | `GetFunction` / `GetFunctionConfiguration` / `UpdateFunctionCode` on exactly the 11 function ARNs `deploy_all.py` knows about |
| `ListFunctionsForAudit` | `lambda:ListFunctions` (read-only; this action has no resource-level scoping in IAM, `Resource: "*"` is unavoidable) — used by `audit_lambdas.py` |
| `FrontendBreakGlass*` | Write `joboss-frontend-171109860478` and invalidate `E1E8CVAQ0HQE8E` — the same scope `infrastructure/github-oidc/deploy-policy.json` grants CI, needed here only for `deploy_frontend.ps1`'s break-glass path when GitHub Actions is down |

Nothing else. In particular: no `iam:*` — this credential cannot inspect or change
its own permissions, or anyone else's. No DynamoDB, no API Gateway, no WAF, no
`lambda:CreateFunction` or `lambda:DeleteFunction`.

## What this does NOT cover

The one-off provisioning scripts elsewhere in `infrastructure/` —
`setup_all.py`, `deploy-subscriptions-tables.py`, `add_analyze_cv_route.py`,
`fix_waf_body_size.py`, and similar — create or reconfigure infrastructure rather
than push code, and need broader permissions than this policy grants. That is
deliberate: those run rarely and by hand, unlike a deploy credential that sits
active on a workstation indefinitely. If one of them needs to run again, temporarily
re-attach `AdministratorAccess`, run it, detach again:

```powershell
aws iam attach-user-policy --user-name joboss-deploy --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
# ... run the one-off script ...
aws iam detach-user-policy --user-name joboss-deploy --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

## Adding a 12th Lambda

`joboss-deploy` can no longer grant itself more access — that is the point. From an
identity that still has `iam:PutUserPolicy` (root, or a human admin account):

1. Add the new function's ARN to the `Resource` list in `joboss-deploy-policy.json`.
2. `aws iam put-user-policy --user-name joboss-deploy --policy-name joboss-deploy-scoped --policy-document file://infrastructure/iam/joboss-deploy-policy.json`
   (on Windows, pass the file's content as a string rather than `file://` — that
   URI scheme did not resolve correctly against the IAM API from this shell; see
   `narrow-deploy-permissions.ps1`'s simulation step for the working pattern.)

## Re-running this from scratch

`narrow-deploy-permissions.ps1` is idempotent-safe but was a one-time migration —
you will not normally need to run it again. If you do (e.g. rebuilding this in a
new account), read the ordering comment at its top before running it: the identity
performing the narrowing is `joboss-deploy` itself, so the script attaches the new
policy and proves it works with an IAM policy *simulation* — not a real API call —
before detaching `AdministratorAccess`, specifically so a mistake can't lock the
session out of its own ability to fix it.

## Verifying what's actually granted, without changing anything

```powershell
$policy = Get-Content infrastructure\iam\joboss-deploy-policy.json -Raw
aws iam simulate-custom-policy `
    --policy-input-list $policy `
    --action-names lambda:UpdateFunctionCode `
    --resource-arns arn:aws:lambda:us-east-1:171109860478:function:joboss-jobs
```

This is how the policy was validated before it was ever attached: every one of the
11 named functions confirmed `allowed`, an unlisted function confirmed denied, and
`lambda:DeleteFunction` / `dynamodb:DeleteTable` / `iam:AttachUserPolicy` all
confirmed denied. `aws iam simulate-custom-policy` evaluates a policy document
directly — it never touches what's actually attached to anything, so it's safe to
run against a hypothetical change before applying it for real.
