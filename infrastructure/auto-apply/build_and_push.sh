#!/usr/bin/env bash
# Build the Playwright/Playwright Docker image and push it to ECR.
# Run this from the repo root on a machine with Docker installed.
# Requirements: docker, aws CLI, credentials with ecr:GetAuthorizationToken.
set -euo pipefail

ACCOUNT="171109860478"
REGION="us-east-1"
REPO="joboss-auto-apply"
ECR_URI="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/${REPO}"
CONTEXT="backend/fargate/auto-apply"

echo "==> Logging in to ECR…"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"

echo "==> Building image (this takes ~5 min on first run due to Playwright download)…"
docker build \
  --platform linux/amd64 \
  -t "${REPO}:latest" \
  "$CONTEXT"

echo "==> Tagging…"
docker tag "${REPO}:latest" "${ECR_URI}:latest"

echo "==> Pushing to ECR…"
docker push "${ECR_URI}:latest"

echo ""
echo "✅ Image pushed: ${ECR_URI}:latest"
echo "   Next: python .tmp_lambda/setup_fargate.py  (if not already done)"
echo "         python .tmp_lambda/deploy_auto_apply.py"
