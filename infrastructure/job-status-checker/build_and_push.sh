#!/usr/bin/env bash
# Build the Tier 2 (Playwright) job-status-checker image and push it to ECR.
# Run this from the repo root on a machine with Docker installed.
# Requirements: docker, aws CLI, credentials with ecr:GetAuthorizationToken.
#
# Mirrors infrastructure/auto-apply/build_and_push.sh — see that file if
# something here needs explaining twice.
set -euo pipefail

ACCOUNT="171109860478"
REGION="us-east-1"
REPO="joboss-job-status-checker"
ECR_URI="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/${REPO}"
CONTEXT="backend/fargate/job-status-checker"

echo "==> Logging in to ECR…"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"

echo "==> Building image…"
docker build \
  --platform linux/amd64 \
  -t "${REPO}:latest" \
  "$CONTEXT"

echo "==> Tagging and pushing…"
docker tag "${REPO}:latest" "${ECR_URI}:latest"
docker push "${ECR_URI}:latest"

echo "==> Done: ${ECR_URI}:latest"
