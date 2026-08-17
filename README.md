# <img width="1200" height="400" alt="app_logo" src="https://github.com/user-attachments/assets/c270606b-acbe-4b30-9c55-26658d0dc1ba" />


**JoBoss** is a mobile-first job discovery platform that turns the job search experience into a fast, swipe-based workflow. Candidates can discover roles, apply in one tap, and track their application pipeline from a personalized dashboard.

The project combines a **React + Vite frontend** with **AWS-backed serverless services** for authentication, resume upload, job matching, and AI-assisted resume tailoring.

---

## Why this project stands out

- **Product-oriented UX**: Tinder-style swipe interactions for job discovery.
- **End-to-end flow**: From authentication to job swipes, applications, and profile management.
- **Cloud-native architecture**: AWS Lambda + API integrations + S3 storage.
- **AI integration**: Bedrock-powered resume tailoring based on job descriptions.
- **Portfolio-ready scope**: Covers frontend engineering, backend serverless logic, and cloud deployment scripts.

---

## Core Features
https://github.com/user-attachments/assets/d7e78c06-9a79-481e-9562-8e33a5dfc2ec
### Candidate Experience
- Secure sign-in flow with AWS Amplify/Cognito integration.
- Swipe right/left job browsing with animated cards.
- Job detail modal with company, salary, requirements, and application links.
- One-tap apply flow and application history tracking.
- Personal profile preferences (location, radius, auto-apply, resume selection).

### Resume Workflow
- Upload PDF resume files to S3 via Lambda endpoint.
- Persist resume metadata (resume id, upload timestamp, active resume state).
- Support for managing multiple resumes in profile state.

### AI-Assisted Resume Tailoring
- Lambda function composes a prompt from resume text + job description.
- Calls Amazon Bedrock (Claude Haiku 4.5 — `us.anthropic.claude-haiku-4-5-20251001-v1:0` by default).
- Returns an ATS-friendly tailored resume draft.





---

## Tech Stack

### Frontend
- React 19
- Vite
- React Router
- Framer Motion
- AWS Amplify (Auth)
- Axios / Fetch API

### Backend & Cloud
- Python AWS Lambda functions
- Amazon S3 for resume storage
- Amazon Bedrock for AI resume tailoring
- Infrastructure automation scripts for Cognito, DynamoDB, S3, CloudFront

---

## Project Structure

```text
JoBoss/
├─ frontend/                  # React application
│  ├─ src/
│  │  ├─ pages/               # Login, Swipe, Dashboard, Profile, Admin, Applications
│  │  ├─ components/          # Navbar, Spinner, transitions
│  │  └─ api.js               # API client + mock fallback
│  └─ package.json
├─ backend/
│  ├─ lambdas/
│  │  ├─ ai/                  # Bedrock resume tailoring lambda
│  │  └─ uploads/             # Resume upload lambda
│  └─ scripts/                # Seed, geocode, and integration helpers
└─ infrastructure/            # AWS setup/deploy scripts
```

---

## Getting Started

> **Working on this project?** [`CONTRIBUTING.md`](CONTRIBUTING.md) is the full
> guide — setup, the branch/PR loop, how deploys happen, and the rules. The section
> below is the short version.

## 1) Frontend setup

```bash
cd frontend
npm install
cp .env.example .env    # fill it in before building
npm run dev             # http://localhost:5173
```

## 2) Configure environment variables

Copy [`frontend/.env.example`](frontend/.env.example) to `frontend/.env` and fill it
in. `VITE_API_URL`, `VITE_USER_POOL_ID` and `VITE_USER_POOL_CLIENT_ID` are
required — the build fails without them rather than starting up against nothing.

Set `VITE_USE_MOCK=true` to answer every API call from `src/api.mock.js` instead of
the network, for UI work without backend access. It has to be requested by name: it
was once the automatic fallback for a missing `VITE_API_URL`, and a production
deploy shipped that way and served fabricated data to real users.

For backend/service configuration, use `backend/shared/config.example.env` as a starting point.

## 3) Backend Lambda dependencies

Example (AI lambda):

```bash
cd backend/lambdas/ai
pip install -r requirements.txt
```

---

## ⚠️ Before testing: deploy the Lambdas

**The single most common source of "impossible" bugs in this project is editing a
Lambda's source locally and forgetting to deploy it.** Tests pass on direct
invoke, the code looks correct, and the bug appears unfixable — because AWS is
still running the old code.

**Always run the master deployer before any testing/debugging session:**

```bash
python infrastructure/deploy/deploy_all.py
```

This pushes the latest local source for every Lambda to AWS and verifies that
the deployed handler bytes match the local file. To deploy only specific
functions, pass name fragments:

```bash
python infrastructure/deploy/deploy_all.py jobs users   # only joboss-jobs and joboss-users
```

Notes:
- It is **safe to run repeatedly** — it refuses to overwrite a function whose
  deployed package contains bundled dependencies (e.g. `stripe`, `telethon`)
  with a code-only zip, so it can never wipe dependencies.
- `joboss-jobs-importer` is skipped automatically (it bundles `telethon`, which
  needs Linux wheels built separately).
- To check what's stale without deploying, run `python infrastructure/deploy/audit_lambdas.py`.
- Frontend deploy (build + S3 + CloudFront invalidation):
  `powershell -File infrastructure/deploy/deploy_frontend.ps1`.

---

## Deployment Notes

Infrastructure automation scripts are available under `infrastructure/` to help provision or update:

- Cognito setup and URL fixes
- S3 setup
- DynamoDB setup
- Frontend deploy and CloudFront setup

Run these scripts with your AWS credentials and environment configured.

---

## API Documentation

Feature-level API documentation is available here:

- [AI Resume Tailoring + Subscription System API](docs/aviv-ai-subscriptions-api.md)

---

## Testing & CI

- Backend unit tests: `pytest backend/tests` (covers job matching/level
  detection, upload sanitization, and the two-tier job-closure checker).
- Frontend unit tests: `cd frontend && npm run test:run` (Vitest + jsdom;
  `npm test` for watch mode). Covers the logic where a regression is silent
  rather than obvious: request handling in `api.js` (a 401 signs out exactly
  once even across parallel calls, a timeout surfaces as `TIMEOUT`, a 403 is
  deliberately left to the app), `getJobs` paging and its location-filter
  fallback, the chunk-retry rule that must not let a broken lazy chunk reload
  the page in a loop, the gate that decides whether a service-worker update may
  reload the page and discard typed input, and placeholder/markup parity between
  the two dictionaries.
- Frontend lint: `cd frontend && npx eslint src/`.
- i18n key parity: `cd frontend && node scripts/check-i18n.mjs`.
- Not covered by unit tests: anything depending on real layout. jsdom does no
  layout, so `offsetWidth` and friends are always 0 — the navbar's active-tab
  pill (which had a zoom bug that only appears at an enlarged text size) can
  only be checked in a real browser at a real viewport.
- GitHub Actions (`.github/workflows/ci.yml`) runs lint + i18n + frontend tests
  + build + backend tests on every push and pull request. `deploy.yml` re-runs
  the same checks on the exact commit it is about to ship.

---

## Roadmap

- Split the large page components (SwipePage, ApplicationsPage, ProfilePage)
  into smaller components and hooks.
- Move infrastructure to IaC (SAM/CDK) instead of provisioning scripts.
- Expand admin analytics and recruiter-side tooling.
- Improve multilingual support and i18n consistency.

---

## Author

Created by the JoBoss team.
