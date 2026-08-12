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

Delete the laptop's access key. Until it is gone, the weakest link is still an
admin key on a workstation:

```powershell
aws iam list-access-keys --user-name joboss-deploy
aws iam delete-access-key --user-name joboss-deploy --access-key-id <id>
```

`deploy_frontend.ps1` stays in the repo as the break-glass path for when GitHub is
down — but it needs credentials, so keep those in a password manager rather than in
`~/.aws/credentials`.

## Restricting further

The trust policy pins a single branch. To add PR preview deploys later, add a
second `sub` value (`repo:NitzanWainshtein/JoBoss:pull_request`) and give it a
*separate* role pointing at a *separate* bucket — a preview build must never be
able to write the production bucket.
