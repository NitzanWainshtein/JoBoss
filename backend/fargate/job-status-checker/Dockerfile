# Keep this tag in lockstep with the playwright pin in requirements.txt — the
# image supplies the browser binaries that version of the library expects.
# Same base image as backend/fargate/auto-apply, deliberately: one known-good
# Playwright/Chromium combination for both Fargate tasks in this project.
FROM mcr.microsoft.com/playwright/python:v1.44.0-jammy

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY jobs_repository.py check_jobs.py ./

# This task only reads job listings and their public apply pages and writes to
# DynamoDB — no resume/PII handling, unlike auto-apply — but it still drives a
# real browser against arbitrary third-party sites, so it gets the same
# no-root hardening. pwuser is created by the Playwright base image already.
USER pwuser

CMD ["python", "check_jobs.py"]
