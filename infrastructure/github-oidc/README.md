# GitHub Actions → AWS, without stored credentials

## What this replaces

Deploys used to run `infrastructure/deploy/deploy_frontend.ps1` from a laptop.
Three problems came with that, and none of them were visible while it worked:

1. **It built from the working tree, not from a commit.** Uncommitted or
   half-finished code could reach production, and afterwards nothing recorded what
   had actually shipped.
2. **Nothing enforced that tests passed first.** The script builds and uploads; it
   never asks whether the code is green.
3. **It needed a long-lived AWS access key on a development machine**, belonging to
   the `joboss-deploy` user — which holds `AdministratorAccess`. A key that never
   expires and can do anything in the account.

`.github/workflows/deploy.yml` fixes all three: it deploys only committed code on
`main`, only after lint + i18n + tests pass on that exact commit, using a token
that lives for minutes and can only write the frontend bucket.

## One-time setup

```powershell
powershell -ExecutionPolicy Bypass -File infrastructure\github-oidc\setup.ps1
```

Needs credentials that can write IAM. Idempotent. It creates:

| Thing | Detail |
|---|---|
| OIDC provider | `token.actions.githubusercontent.com`, audience `sts.amazonaws.com` |
| Role | `joboss-github-deploy`, 1h max session |
| Trust | **only** `repo:NitzanWainshtein/JoBoss:ref:refs/heads/main` |
| Permissions | write `joboss-frontend-171109860478`, invalidate `E1E8CVAQ0HQE8E`. Nothing else. |

The role ARN is already hardcoded in `deploy.yml`, so there is nothing to copy
afterwards and no GitHub secret to store.

### If a deploy fails with `sts:AssumeRoleWithWebIdentity`

```
Could not assume role with OIDC: Not authorized to perform sts:AssumeRoleWithWebIdentity
```

This means the `sub` claim in GitHub's token did not match the trust policy. AWS
does not say which part differed, so check the claim the run actually presents:

| The workflow | `sub` GitHub sends |
|---|---|
| push / dispatch on `main`, no environment | `repo:OWNER/REPO:ref:refs/heads/main` |
| **any job with `environment: production`** | `repo:OWNER/REPO:environment:production` |
| pull request | `repo:OWNER/REPO:pull_request` |
| tag | `repo:OWNER/REPO:ref:refs/tags/TAG` |

The environment row is the trap, and it is what broke the first deploy here: the
job declared `environment: production`, so the branch never appeared in the claim
and the branch-pinned trust policy rejected it. `deploy.yml` no longer declares an
environment — see the comment on the `deploy` job before adding one back.

A second, rarer cause is propagation: STS does not see a brand-new role or provider
for a few seconds. `setup.ps1` waits 45s after creating a role for that reason. If
the trust policy is right and it still fails, re-run once before digging.

## How a deploy happens now

Push to `main` touching `frontend/**`, or run **Actions → Deploy frontend → Run
workflow**. The run:

1. Verifies — eslint, i18n key/placeholder parity, pytest.
2. Builds, and prints `dist/version.json` so the log states which commit is
   shipping.
3. Assumes the role via OIDC.
4. Uploads in the order the cache headers require (assets → icons → root →
   `index.html` and `version.json` last, never cached).
5. Invalidates CloudFront and **waits** for the invalidation to complete.
6. Fetches `/version.json` from the live site and fails the run if the commit it
   reports is not the one that was just deployed.

Step 6 is the part that makes the green check mean something: the run cannot pass
while claiming to have deployed something that did not actually go live.

## What is live?

```
curl https://d231wno34rvped.cloudfront.net/version.json
```

`dirty: true` means that build came from a tree with uncommitted changes — only
possible from a local deploy, never from CI.

## After the first successful CI deploy

Done — `joboss-deploy` no longer holds `AdministratorAccess`. Its permissions are
now `infrastructure/iam/joboss-deploy-policy.json`: update the 11 named Lambdas,
list Lambdas (for `audit_lambdas.py`), and a frontend-bucket/CloudFront break-glass
path mirroring what the OIDC role above already grants. See
`infrastructure/iam/` for how that was done and how to change it.

The key itself still exists — `deploy_all.py` (backend Lambda deploys) has no CI
path yet and runs from a workstation, so something still needs to authenticate it.
It is a materially smaller risk now than an admin key: if it leaked, the blast
radius is "redeploy 11 known Lambdas," not "do anything in the account." Deleting
it outright becomes possible once the backend deploy also moves to CI (tracked
as future work, not yet done).

`deploy_frontend.ps1` stays in the repo as the break-glass path for when GitHub is
down — but it needs credentials, so keep those in a password manager rather than in
`~/.aws/credentials`.

## Restricting further

The trust policy pins a single branch. To add PR preview deploys later, add a
second `sub` value (`repo:NitzanWainshtein/JoBoss:pull_request`) and give it a
*separate* role pointing at a *separate* bucket — a preview build must never be
able to write the production bucket.
