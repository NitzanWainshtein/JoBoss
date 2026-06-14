# JoBoss Installation Guide

This document explains how to install, deploy, run, and maintain the JoBoss system on a clean AWS account.

The target audience is a technical team that receives the source code package and needs to deploy the system independently.

---

## 1. Project Overview

JoBoss is a mobile-first job discovery platform. Users can register, complete onboarding, browse jobs with a swipe-based interface, upload resumes, apply to jobs, manage applications, and use AI-assisted resume tailoring.

The system is built from the following main parts:

```text
JoBoss/
├── frontend/          React + Vite frontend application
├── backend/           Python Lambda functions, Fargate code, scripts
├── infrastructure/    AWS setup and deployment scripts
├── docs/              API documentation and Swagger/OpenAPI file
├── README.md          General project description
└── INSTALL.md         This installation guide
```

Repository:

```text
https://github.com/NitzanWainshtein/JoBoss
```

---

## 2. AWS Services Used

The installation scripts create and configure the following AWS resources:

```text
IAM
Cognito
DynamoDB
S3
Lambda
API Gateway
CloudFront
Bedrock
```

The main installation script is:

```text
infrastructure/setup_all.py
```

It creates the base infrastructure and connects the frontend, backend, API Gateway, and authentication components.

---

## 3. Prerequisites

Before starting, make sure the following tools are installed on the technical machine:

| Tool    |      Required Version | Check Command      |
| ------- | --------------------: | ------------------ |
| Python  |         3.10 or newer | `python --version` |
| pip     |    Any recent version | `pip --version`    |
| Node.js |           18 or newer | `node --version`   |
| npm     |    Comes with Node.js | `npm --version`    |
| AWS CLI | Version 2 recommended | `aws --version`    |

Install the Python dependency used by the infrastructure scripts:

```bash
pip install boto3
```

---

## 4. Required AWS Permissions

The AWS user that runs the installation must have permission to create and manage the following services:

```text
IAM roles and policies
Cognito User Pools
DynamoDB tables
S3 buckets and bucket policies
Lambda functions
API Gateway REST APIs
CloudFront distributions
CloudWatch Logs
Bedrock model invocation permissions
```

For installation on a clean test account, using an administrator-level AWS user is recommended.

---

## 5. Configure AWS CLI

Run:

```bash
aws configure
```

Enter the following values:

```text
AWS Access Key ID
AWS Secret Access Key
Default region name: us-east-1
Default output format: json
```

Verify that the AWS credentials work:

```bash
aws sts get-caller-identity
```

Expected result: the command should return the AWS account ID, user ARN, and user ID.

---

## 6. Unzip the Source Package

Unzip the submitted source package:

```bash
unzip JoBoss-final-source.zip
cd JoBoss
```

Verify that the main directories exist:

```bash
ls
```

Expected result:

```text
README.md
INSTALL.md
frontend/
backend/
docs/
infrastructure/
```

---

## 7. Important Source Package Notes

The submitted ZIP should contain source code and deployment scripts only.

It should include:

```text
frontend/
backend/
docs/
infrastructure/
README.md
INSTALL.md
.gitignore
```

It should not include generated or local-only files such as:

```text
node_modules/
package/
.venv/
venv/
__pycache__/
.DS_Store
.git/
.tmp_lambda/
*.zip
.env
*.session
sample.pdf
out*.json
```

A safe validation command is:

```bash
unzip -l JoBoss-final-source.zip | grep -E "node_modules|/package/|\.DS_Store|\.tmp_lambda|jobs_importer\.zip|__pycache__|/\.env$|/\.env\.|\.session$|sample\.pdf|out.*\.json|chrome-extension\.(pem|crx)"
```

If the command prints nothing, the ZIP is clean.

The file below is allowed and should stay in the package:

```text
backend/shared/config.example.env
```

It is only an example configuration file and should not contain secrets.

---

## 8. Full AWS Installation

From the project root directory, run:

```bash
pip install boto3
python infrastructure/setup_all.py
```

The script performs the following installation steps:

```text
1. Create IAM Lambda execution role
2. Create Cognito User Pool and App Client
3. Create DynamoDB tables
4. Create S3 bucket for resumes and profile images
5. Create API Gateway and Cognito Authorizer
6. Deploy Lambda functions
7. Connect API Gateway routes to Lambda functions
8. Create S3 bucket for the frontend website
9. Create CloudFront distribution
10. Generate frontend/.env with the account-specific deployment values
```

The script is designed to be safe to run multiple times. If a resource already exists, the script reuses it or updates it instead of creating a duplicate.

---

## 9. Frontend Build and Deployment

After the first run of `setup_all.py`, the script generates:

```text
frontend/.env
```

This file contains the API Gateway URL, Cognito User Pool ID, Cognito Client ID, and CloudFront URL.

Now build the frontend:

```bash
cd frontend
npm install
npm run build
cd ..
```

Then run the setup script again to upload the generated frontend build to S3:

```bash
python infrastructure/setup_all.py
```

The second run detects the existing AWS resources and uploads the contents of:

```text
frontend/dist/
```

to the frontend S3 bucket.

---

## 10. Expected Installation Output

At the end of a successful installation, the script prints values similar to:

```text
INSTALLATION COMPLETE

API URL:       https://<api-id>.execute-api.us-east-1.amazonaws.com/prod
User Pool ID:  us-east-1_XXXXXXXXX
Client ID:     XXXXXXXXXXXXXXXXXXXXXXXXXX
CloudFront:    https://xxxxxxxxxxxxxx.cloudfront.net

frontend/.env written automatically.
```

Save these values for later maintenance and testing.

---

## 11. Frontend Environment Variables

The file `frontend/.env` is generated automatically by:

```bash
python infrastructure/setup_all.py
```

Manual example:

```env
VITE_API_URL=https://<API_ID>.execute-api.us-east-1.amazonaws.com/prod
VITE_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_USER_POOL_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
VITE_CLOUDFRONT_URL=https://XXXXXXXXXXXX.cloudfront.net
# Optional, only if Google SSO is configured:
# VITE_COGNITO_DOMAIN=
```

Do not commit or submit a real `.env` file that contains production values or secrets.

---

## 12. Backend Environment Variables

Most backend environment variables are configured automatically by `setup_all.py`.

Important Lambda environment variables include:

```text
USERS_TABLE
USERS_TABLE_NAME
JOBS_TABLE
JOBS_TABLE_NAME
SWIPES_TABLE
APPLICATIONS_TABLE
APPLICATIONS_TABLE_NAME
SUBSCRIPTIONS_TABLE
USAGE_TABLE
RESUME_BUCKET_NAME
BUCKET_NAME
AI_MODE
BEDROCK_MODEL_ID
```

Optional Stripe-related variables:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PREMIUM_PRICE_ID
STRIPE_PREMIUM_PLUS_PRICE_ID
```

Optional Telegram importer variables:

```text
TG_API_ID
TG_API_HASH
TG_SESSION_STRING
TG_CHANNEL
TG_LIMIT
DYNAMODB_JOBS_TABLE
```

Do not store real secrets inside the source code package.

---

## 13. Optional Stripe Subscription Integration

The subscription system supports Stripe checkout and webhooks.

Before running the deployment script, the following environment variables can be exported:

```bash
export STRIPE_SECRET_KEY=sk_live_or_test_key
export STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxx
export STRIPE_PREMIUM_PRICE_ID=price_xxxxxxxxx
export STRIPE_PREMIUM_PLUS_PRICE_ID=price_xxxxxxxxx
```

Then run:

```bash
python infrastructure/setup_all.py
```

In the Stripe Dashboard, configure the webhook URL:

```text
https://<API_ID>.execute-api.us-east-1.amazonaws.com/prod/subscriptions/webhook
```

Recommended webhook events:

```text
checkout.session.completed
customer.subscription.deleted
```

Important note: the subscription Lambda imports the `stripe` Python package. In a production deployment, make sure the Stripe dependency is included in the Lambda deployment package or provided through a Lambda Layer before enabling the Stripe payment flow.

---

## 14. Optional Telegram Jobs Importer

The project includes a Telegram job importer under:

```text
backend/lambdas/jobs_importer/
```

This component imports jobs from a Telegram channel and writes them into DynamoDB.

Relevant files:

```text
backend/lambdas/jobs_importer/handler.py
backend/lambdas/jobs_importer/telegram_jobs.py
backend/lambdas/jobs_importer/geocoding.py
backend/lambdas/jobs_importer/job_description_ai.py
backend/lambdas/jobs_importer/job_description_fetcher.py
backend/lambdas/jobs_importer/apply_url_resolver.py
backend/lambdas/jobs_importer/jobs_repository.py
backend/lambdas/jobs_importer/requirements.txt
```

Dependencies:

```text
telethon
geopy
```

The importer requires these environment variables:

```text
TG_API_ID
TG_API_HASH
TG_SESSION_STRING
TG_CHANNEL
TG_LIMIT
DYNAMODB_JOBS_TABLE
```

The Telegram session string must not be included in the ZIP file. Generate it locally and store it securely, for example in AWS Secrets Manager or as a Lambda environment variable.

The importer is optional and is not required for the basic system deployment.

---

## 15. Optional Fargate Auto-Apply Component

The project includes an optional Fargate-based auto-apply component:

```text
backend/fargate/auto-apply/
├── Dockerfile
├── apply.py
└── requirements.txt
```

This component is intended for browser automation or heavier background processing that should not run inside Lambda.

The base `setup_all.py` script does not deploy the Fargate service automatically. To deploy this component in production, the technical team should create:

```text
ECR repository
Docker image
ECS cluster
Fargate task definition
IAM task role
Networking configuration
```

---

## 16. API Documentation

API documentation is included in:

```text
docs/API_REFERENCE.md
docs/swagger.yaml
docs/aviv-ai-subscriptions-api.md
```

The Swagger/OpenAPI file is:

```text
docs/swagger.yaml
```

This file can be used to understand or recreate the API Gateway structure.

---

## 17. Main API Routes

The main API Gateway routes include:

```text
GET     /jobs
GET     /jobs/{jobId}

POST    /swipes
GET     /swipes/me
DELETE  /swipes/{jobId}
GET     /swipes/quota

GET     /applications
POST    /applications
PUT     /applications
DELETE  /applications

GET     /users/me
POST    /users/me
PUT     /users/me

POST    /resumes/upload
POST    /profile/image

POST    /ai/tailor

GET     /subscriptions/me
DELETE  /subscriptions/me
POST    /subscriptions/checkout
POST    /subscriptions/consume

ANY     /admin/{proxy+}
```

Most routes use Cognito authorization through the `Authorization` header.

---

## 18. Testing the Installation

After the CloudFront distribution is created, wait a few minutes for it to finish deploying.

Open the CloudFront URL printed by the setup script:

```text
https://xxxxxxxxxxxxxx.cloudfront.net
```

Test the following flow:

```text
1. Open the website.
2. Register with a new email address.
3. Confirm the email using the Cognito verification code.
4. Log in.
5. Complete the onboarding flow.
6. Upload a resume.
7. Open the swipe page.
8. If no jobs appear, add jobs through the admin tools or configure the jobs importer.
9. Test the applications page.
10. Test AI resume tailoring if Bedrock access is enabled.
```

API test example:

```bash
curl https://<API_ID>.execute-api.us-east-1.amazonaws.com/prod/jobs
```

For protected routes, use a valid Cognito JWT token:

```bash
curl \
  -H "Authorization: Bearer <COGNITO_ID_TOKEN>" \
  https://<API_ID>.execute-api.us-east-1.amazonaws.com/prod/users/me
```

---

## 19. Bedrock Access

The AI resume tailoring feature uses Amazon Bedrock.

Before testing AI features, verify that the target AWS account has access to the configured model.

Default model configured by the installer:

```text
us.anthropic.claude-haiku-4-5-20251001-v1:0
```

If the model is unavailable in the target AWS account, update the `BEDROCK_MODEL_ID` environment variable on the AI Lambda.

---

## 20. Created AWS Resource Names

The default installation creates resources with names similar to:

```text
IAM Role:
joboss-lambda-role

Cognito:
joboss-users
joboss-web-client

DynamoDB:
joboss-users
joboss-jobs
joboss-swipes
joboss-applications
joboss-subscriptions
joboss-usage

S3:
joboss-resumes-<account-id>
joboss-frontend-<account-id>

Lambda:
joboss-users
joboss-jobs
joboss-swipes
joboss-applications
joboss-uploads
joboss-ai-tailor
joboss-profile-image
joboss-admin
joboss-subscriptions

API Gateway:
joboss-api

CloudFront:
JoBoss Frontend distribution
```

---

## 21. Local Frontend Development

To run the frontend locally:

```bash
cd frontend
npm install
npm run dev
```

The local development server usually runs at:

```text
http://localhost:5173
```

Make sure `frontend/.env` exists before running the frontend against the deployed AWS backend.

---

## 22. Local Backend Notes

Lambda functions are located under:

```text
backend/lambdas/
```

Each Lambda directory contains its source code and, when needed, a `requirements.txt` file.

Do not include generated Lambda deployment folders such as:

```text
package/
```

Do not include generated Lambda ZIP files such as:

```text
joboss-ai-tailor.zip
jobs_importer.zip
lambda.zip
```

These artifacts should be recreated during deployment.

---

## 23. Maintenance Instructions

Common maintenance actions:

### Rebuild and redeploy the frontend

```bash
cd frontend
npm install
npm run build
cd ..
python infrastructure/setup_all.py
```

### Redeploy infrastructure and Lambdas

```bash
python infrastructure/setup_all.py
```

### Check the current AWS identity

```bash
aws sts get-caller-identity
```

### Inspect CloudWatch logs

Open AWS Console:

```text
CloudWatch → Log groups → /aws/lambda/<lambda-name>
```

---

## 24. Troubleshooting

### AccessDeniedException

Cause: the AWS user does not have enough permissions.

Fix: use an AWS user with permissions for IAM, Lambda, DynamoDB, S3, API Gateway, Cognito, CloudFront, CloudWatch, and Bedrock.

---

### CloudFront URL does not work immediately

Cause: CloudFront distribution deployment takes time.

Fix: wait up to 10 minutes and try again.

---

### `frontend/dist not found`

Cause: the frontend was not built yet.

Fix:

```bash
cd frontend
npm install
npm run build
cd ..
python infrastructure/setup_all.py
```

---

### Cognito verification email does not arrive

Fix:

```text
1. Check the spam folder.
2. Verify that the email address was entered correctly.
3. Check the Cognito User Pool in the AWS Console.
```

---

### AI tailoring fails

Possible causes:

```text
Bedrock model access is not enabled.
The configured model ID is unavailable in the account.
The Lambda role does not have Bedrock permissions.
The uploaded resume format is unsupported.
```

Fix:

```text
1. Enable model access in Amazon Bedrock.
2. Check the AI Lambda environment variable BEDROCK_MODEL_ID.
3. Check CloudWatch logs for joboss-ai-tailor.
```

---

### Stripe subscription flow fails

Possible causes:

```text
Stripe environment variables are missing.
Stripe dependency is not packaged with the Lambda.
Stripe webhook URL is not configured.
Price IDs are incorrect.
```

Fix:

```text
1. Set STRIPE_SECRET_KEY.
2. Set STRIPE_WEBHOOK_SECRET.
3. Set STRIPE_PREMIUM_PRICE_ID.
4. Set STRIPE_PREMIUM_PLUS_PRICE_ID.
5. Make sure the stripe Python package is included in the Lambda package or Lambda Layer.
6. Configure the webhook URL in Stripe Dashboard.
```

---

### Telegram importer fails

Possible causes:

```text
TG_API_ID is missing.
TG_API_HASH is missing.
TG_SESSION_STRING is missing or invalid.
TG_CHANNEL is missing or inaccessible.
telethon/geopy dependencies are not packaged.
```

Fix:

```text
1. Generate a valid Telegram session string.
2. Configure all required environment variables.
3. Package the Lambda with dependencies from requirements.txt.
4. Check CloudWatch logs.
```

---

## 25. Cleanup / Removing the System

The project does not currently include a full automatic cleanup script.

To remove the system manually, delete the following resources from the AWS Console:

```text
CloudFront distribution
S3 buckets:
  joboss-frontend-<account-id>
  joboss-resumes-<account-id>

API Gateway:
  joboss-api

Lambda functions:
  joboss-users
  joboss-jobs
  joboss-swipes
  joboss-applications
  joboss-uploads
  joboss-ai-tailor
  joboss-profile-image
  joboss-admin
  joboss-subscriptions

DynamoDB tables:
  joboss-users
  joboss-jobs
  joboss-swipes
  joboss-applications
  joboss-subscriptions
  joboss-usage

Cognito User Pool:
  joboss-users

IAM Role:
  joboss-lambda-role
```

For S3 cleanup from CLI:

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws s3 rb s3://joboss-frontend-$ACCOUNT_ID --force
aws s3 rb s3://joboss-resumes-$ACCOUNT_ID --force
```

---

## 26. Final Deployment Checklist

Before handing the system to the client or course evaluator, verify:

```text
[ ] The ZIP file contains all source files.
[ ] The ZIP file does not contain node_modules, package folders, .env files, secrets, or local cache files.
[ ] README.md exists.
[ ] INSTALL.md exists and is written in English.
[ ] docs/swagger.yaml exists.
[ ] infrastructure/setup_all.py exists.
[ ] frontend/package.json and frontend/package-lock.json exist.
[ ] backend/lambdas contains all Lambda source code.
[ ] backend/shared/config.example.env exists and does not contain real secrets.
[ ] The installation was tested on a clean AWS account.
[ ] The CloudFront URL opens the frontend.
[ ] User registration and login work.
[ ] API Gateway routes are connected to Lambda functions.
[ ] DynamoDB tables are created.
[ ] Resume upload works.
[ ] AI tailoring works if Bedrock access is enabled.
```

---

## 27. Support Notes for the Technical Team

The recommended deployment process is:

```bash
unzip JoBoss-final-source.zip
cd JoBoss

aws configure
pip install boto3

python infrastructure/setup_all.py

cd frontend
npm install
npm run build
cd ..

python infrastructure/setup_all.py
```

After the second run, open the CloudFront URL printed by the script.
