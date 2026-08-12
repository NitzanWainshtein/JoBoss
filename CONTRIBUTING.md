# Working on JoBoss

Everything you need to go from a fresh clone to code running in production.

Read [The rules](#the-rules) before your first push. The rest is reference.

---

## First-time setup

You need **Node 22+**, **Python 3.12+**, and **git**. AWS credentials are *not*
required to develop — only to deploy the backend.

```bash
git clone https://github.com/NitzanWainshtein/JoBoss.git
cd JoBoss

# Frontend
cd frontend
npm install
cp .env.example .env      # then fill it in — see below
npm run dev               # http://localhost:5173

# Backend tests (from the repo root)
pip install boto3 pytest
python -m pytest backend/tests -q
```

### Filling in `frontend/.env`

`.env` is gitignored and never committed. Ask Nitzan for the values, or copy them
from another machine that already works.

The build **fails** without `VITE_API_URL`, `VITE_USER_POOL_ID` and
`VITE_USER_POOL_CLIENT_ID`. That is deliberate: without them the app used to fall
back to fake data silently, and a production deploy once shipped that way.

**No backend access?** Put `VITE_USE_MOCK=true` in `.env` and every API call is
answered from `src/api.mock.js`. Good for pure UI work. You still need the three
variables above to be present.

---

## The daily loop

```bash
git checkout main
git pull                          # always start from current main

git checkout -b your-name/what-you-are-doing
# ... work ...

cd frontend
npm run lint                      # must be 0 errors
npm run check:i18n                # he.js and en.js must stay in step
cd ..
python -m pytest backend/tests -q # must pass

git add -A
git commit -m "feat: what changed and why"
git push -u origin your-name/what-you-are-doing
```

Then open a pull request on GitHub. CI runs the same three checks on your branch.
When it is green and reviewed, merge into `main`.

**Merging to `main` deploys the site automatically.** There is nothing else to run.

---

## How deploying works

```
push/merge to main  ->  GitHub Actions  ->  verify  ->  build  ->  S3 + CloudFront
```

`.github/workflows/deploy.yml` does all of it:

1. **Verify** — eslint, i18n parity, pytest, on that exact commit.
2. **Build** — with the production environment variables.
3. **Authenticate** — a short-lived OIDC token. There are no AWS keys in GitHub.
4. **Upload** — in a specific order, with per-file-type cache headers.
5. **Invalidate** CloudFront and wait for it to finish.
6. **Prove it** — fetch `/version.json` from the live site and fail if the commit
   served is not the one just deployed; fetch the live bundle and fail if it does
   not reference the real API.

Steps 5 and 6 are why a green check means "it is live", not "it probably shipped".

To redeploy the current `main` without a new commit:
**Actions → Deploy frontend → Run workflow**.

### What is live right now?

```bash
curl https://d231wno34rvped.cloudfront.net/version.json
```

```json
{ "commit": "130479a...", "branch": "main", "dirty": false, "runId": "31612400430" }
```

`dirty: true` would mean someone built from a working tree with uncommitted changes
— only possible from a local deploy. It should always be `false`.

### After a deploy, hard-refresh

`Ctrl+Shift+R` (`Cmd+Shift+R` on macOS). `index.html` is served no-cache so the new
version arrives immediately, but your browser may still hold the previous bundle.
Icons are cached for an hour.

---

## The rules

**Never deploy from your laptop.** `infrastructure/deploy/deploy_frontend.ps1`
still exists, but it builds from your *working tree* — it can publish uncommitted
code, and nothing records what shipped. It is the break-glass path for when GitHub
Actions is down, not a normal tool.

**Never commit `.env`, `*.pem`, `*.key`, or an access key.** `.gitignore` covers
these by category, but check `git status` before committing anyway. A secret pushed
to a public repo is compromised the moment it lands — rotating it is the only fix,
and deleting the commit does not help.

**Never paste a secret into a chat, an issue, or a screenshot.** Key *IDs*
(`AKIA...`) are fine; secret keys are not.

**Do not push straight to `main`** once more than one person is working. Use a
branch and a PR — otherwise two people deploy over each other, and a merge conflict
becomes a production incident.

**If CI is red, do not merge.** The checks exist because each one has caught a real
bug in this repo.

---

## Backend changes

The backend is **not** deployed by CI yet. Lambda code changes reach AWS only when
someone runs the deployer, so **a merged backend change is not a live backend
change**:

```bash
python infrastructure/deploy/deploy_all.py             # everything
python infrastructure/deploy/deploy_all.py jobs users  # only matching names
```

This needs AWS credentials (`aws configure`). It refuses to overwrite a Lambda that
has bundled dependencies with a code-only package, and verifies an MD5 of the
uploaded handler afterwards.

If it fails saying the `vendor` directory is missing:

```bash
pip install stripe -t backend/lambdas/subscriptions/vendor
```

Standing up the Auto Apply pipeline from scratch is documented separately in
[`infrastructure/auto-apply/README.md`](infrastructure/auto-apply/README.md).

---

## Layout

| Path | What |
|---|---|
| `frontend/src/pages/` | One file per screen |
| `frontend/src/components/` | Shared UI |
| `frontend/src/i18n/` | `he.js` / `en.js` — same keys, same placeholders |
| `frontend/src/api.js` | Every API call goes through here |
| `frontend/scripts/` | i18n check, icon optimisation, PWA icon generation |
| `backend/lambdas/<name>/handler.py` | One directory per Lambda |
| `backend/tests/` | pytest — pure logic only, no AWS calls |
| `infrastructure/deploy/` | The deployers |
| `docs/swagger.yaml` | API reference — keep it current |

### Adding user-facing text

Never hardcode a string in a component. Add a key to **both** `he.js` and `en.js`
and use `t('your.key')`. `npm run check:i18n` fails on a key present in one file
only, or with mismatched `{placeholders}`, and CI runs it.

For a bolded number mid-sentence use `<b>` in the string and render it with
`renderRich()` from `i18n/richText.jsx` — do not build the sentence by
concatenating fragments, because Hebrew and English order words differently.

### Replacing icons

```bash
cd frontend
npm run icons:optimize   # downscale/re-encode public/icons (never enlarges)
npm run icons:pwa        # regenerate the 192/512/maskable set from the app icon
```

Export UI icons at roughly 3x their rendered size (`src/iconSizes.js` lists the
sizes). The source art was once 1254x1254 for icons drawn at 28px, which made
`public/icons` 14MB.

---

## When something breaks

| Symptom | Look at |
|---|---|
| Deploy fails on `Assume the deploy role` | [`infrastructure/github-oidc/README.md`](infrastructure/github-oidc/README.md) — usually the OIDC `sub` claim |
| Deploy fails on `Refusing to build` | A required `VITE_*` variable is missing from the build step |
| App shows no data / bounces to onboarding | The bundle is not reaching the API. Check `curl .../version.json` and the browser console |
| Changed a Lambda, nothing happened | You did not run `deploy_all.py` — merging does not deploy the backend |
| Uploads 403 with no Lambda logs | The WAF in front of API Gateway; check its sampled requests |
| Icon change not visible | Icons are cached 1h; hard-refresh |

Production data lives in DynamoDB and is never touched by a frontend deploy. If the
app looks empty, the data is almost certainly fine and the app simply is not
reading it — check the API before assuming anything was lost.
