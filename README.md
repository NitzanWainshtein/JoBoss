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
- Calls Amazon Bedrock (`amazon.nova-micro-v1:0` by default).
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

## 1) Frontend setup

```bash
cd frontend
npm install
npm run dev
```

The frontend runs with mock data when `VITE_API_URL` is not configured.

## 2) Configure environment variables

Create a `.env` file in `frontend/` and set:

```env
VITE_API_URL=<your-api-gateway-base-url>
```

For backend/service configuration, use `backend/shared/config.example.env` as a starting point.

## 3) Backend Lambda dependencies

Example (AI lambda):

```bash
cd backend/lambdas/ai
pip install -r requirements.txt
```

---

## Deployment Notes

Infrastructure automation scripts are available under `infrastructure/` to help provision or update:

- Cognito setup and URL fixes
- S3 setup
- DynamoDB setup
- Frontend deploy and CloudFront setup

Run these scripts with your AWS credentials and environment configured.

---

## Roadmap

- Add automated test coverage (frontend + Lambda unit tests).
- Add CI/CD workflow for lint, tests, and deployment.
- Expand admin analytics and recruiter-side tooling.
- Improve multilingual support and i18n consistency.

---

## Author

Created by the JoBoss team.
