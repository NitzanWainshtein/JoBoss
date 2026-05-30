# AI Resume Tailoring + Subscription System API

This document covers Aviv's JoBoss feature block:

- Subscription System
- AI Resume Tailoring

Base API URL used in the current deployed environment:

```text
https://h5pcg5oznh.execute-api.us-east-1.amazonaws.com/prod
```

## Subscription System

Lambda:

```text
joboss-subscriptions
```

Source:

```text
backend/lambdas/subscriptions/handler.py
```

Deploy script:

```text
python infrastructure/deploy-subscriptions.py
```

Data store:

```text
DynamoDB table: joboss-users
```

Relevant user fields:

```text
userId
plan: FREE | PREMIUM
dailyApplications
dailyLimit
limitResetAt
```

Plan limits:

Daily swipe limits (counted on LIKE swipes only; see `TIER_LIMITS`):

```text
FREE:         5 swipes per day
PREMIUM:      30 swipes per day
PREMIUM_PLUS: unlimited
```

The Lambda resolves the user identity in this order:

1. Cognito authorizer claims, using `sub`
2. JWT `Authorization` header payload, using `sub`
3. `userId` query parameter
4. `userId` request body field

### GET /subscriptions/me

Purpose:

Returns the current user's subscription status and daily application quota usage.

Example:

```http
GET /subscriptions/me?userId=test-user-001
```

Success response:

```json
{
  "userId": "test-user-001",
  "plan": "FREE",
  "dailyLimit": 5,
  "used": 0,
  "resetAt": "2026-05-24T00:00:00+00:00"
}
```

Possible errors:

```json
{
  "error": "userId is required"
}
```

### POST /subscriptions/checkout

Purpose:

Upgrades the user to `PREMIUM`.

Request body:

```json
{
  "userId": "test-user-001"
}
```

Success response:

```json
{
  "message": "Mock checkout completed successfully",
  "plan": "PREMIUM",
  "dailyLimit": 50
}
```

Notes:

This is currently a mock checkout endpoint. It updates the user plan directly in DynamoDB and does not integrate with a real payment provider.

### DELETE /subscriptions/me

Purpose:

Cancels the premium subscription and returns the user to `FREE`.

Request body:

```json
{
  "userId": "test-user-001"
}
```

Success response:

```json
{
  "message": "Subscription cancelled",
  "plan": "FREE",
  "dailyLimit": 5
}
```

### POST /subscriptions/consume

Purpose:

Consumes one daily application quota unit after a successful right swipe/apply action.

Request body:

```json
{
  "userId": "test-user-001"
}
```

Success response:

```json
{
  "message": "Application quota consumed",
  "plan": "FREE",
  "dailyLimit": 5,
  "used": 1,
  "resetAt": "2026-05-24T00:00:00+00:00"
}
```

Limit reached response:

```json
{
  "error": "Daily application limit reached",
  "plan": "FREE",
  "dailyLimit": 5,
  "used": 5,
  "resetAt": "2026-05-24T00:00:00+00:00"
}
```

HTTP status:

```text
429 Too Many Requests
```

Daily reset behavior:

When `limitResetAt` is in the past or missing, the Lambda resets `dailyApplications` to `0` and sets the next reset time to the next UTC midnight.

## AI Resume Tailoring

Lambda:

```text
joboss-ai-tailor
```

Source:

```text
backend/lambdas/ai/handler.py
```

Deploy script:

```text
python infrastructure/deploy-ai-tailor.py
```

AWS services:

```text
DynamoDB: joboss-users
DynamoDB: joboss-jobs
S3: joboss-resumes-171109860478
Amazon Bedrock: optional, falls back to mock mode
```

Environment variables:

```text
USERS_TABLE=joboss-users
JOBS_TABLE=joboss-jobs
RESUME_BUCKET_NAME=joboss-resumes-171109860478
AI_MODE=mock | auto
BEDROCK_MODEL_ID=amazon.nova-micro-v1:0
```

### POST /ai/tailor

Purpose:

Creates a tailored resume draft for a specific user, resume, and job.

Primary request body:

```json
{
  "userId": "test-user-001",
  "jobId": "06677a56-3c1e-4f6f-b38e-9056899397da",
  "resumeId": "resume_123"
}
```

Frontend demo request body:

```json
{
  "userId": "test-user-001",
  "jobId": "6",
  "resumeId": "resume_123",
  "resumeText": "Extracted resume text from the uploaded PDF",
  "job": {
    "jobId": "6",
    "company": "Taboola",
    "title": "Full Stack Engineer",
    "location": "Ramat Gan",
    "description": "Create interfaces and services for recommendation systems",
    "requirements": ["React", "Java"]
  }
}
```

Processing flow:

1. Resolve `userId` from Cognito/JWT/body.
2. Load the user from `joboss-users`.
3. Load the job from `joboss-jobs`.
4. If the job is not in DynamoDB but the request includes a `job` object, use that object for demo mode.
5. Find the requested resume from the user's `resumes` list.
6. If `resumeText` was provided by the frontend, use it as the resume source text.
7. Generate a tailored resume draft using Bedrock when available.
8. If Bedrock is unavailable or `AI_MODE=mock`, use fallback generation.
9. Save the generated draft as a simple temporary PDF in S3.
10. Return the S3 URL and preview text.

Success response:

```json
{
  "message": "Tailored resume generated",
  "mode": "mock",
  "tailoredResumeId": "tailored_abc123",
  "tailoredResumeUrl": "s3://joboss-resumes-171109860478/users/test-user-001/tailored/6/tailored_abc123.pdf",
  "tailoredResume": "AVIV OZ\nTarget Role: Full Stack Engineer | Taboola\n..."
}
```

Possible errors:

```json
{
  "error": "userId and jobId are required"
}
```

```json
{
  "error": "User was not found"
}
```

```json
{
  "error": "Job was not found"
}
```

```json
{
  "error": "Resume was not found"
}
```

Current MVP limitation:

The current AI Tailoring implementation creates a tailored text draft and saves a simple temporary PDF. It does not yet edit the original uploaded PDF while preserving its exact layout, fonts, hyperlinks, icons, and design.

Future work:

The intended production behavior is to preserve the original resume design and links, then adjust only the content emphasis and wording for the target job. A practical next step is to build a resume HTML/PDF template that mirrors the user's resume design and injects tailored content into that template.

## Frontend Integration

Relevant files:

```text
frontend/src/api.js
frontend/src/pages/SubscriptionPage.jsx
frontend/src/pages/SwipePage.jsx
frontend/src/pages/ProfilePage.jsx
```

Current frontend env setup:

```env
VITE_API_URL=mock
VITE_SUBSCRIPTIONS_API_URL=https://h5pcg5oznh.execute-api.us-east-1.amazonaws.com/prod
VITE_AI_API_URL=https://h5pcg5oznh.execute-api.us-east-1.amazonaws.com/prod
```

This keeps the general app in mock mode while routing Subscriptions and AI Tailoring to real AWS APIs.

Mock development behavior:

While `VITE_API_URL=mock`, profile/resume metadata, swipes, and mock applications are persisted in `localStorage` so refresh does not reset the local demo state.
