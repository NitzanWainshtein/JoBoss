# Keep this tag in lockstep with the playwright pin in requirements.txt — the
# image supplies the browser binaries that version of the library expects.
FROM mcr.microsoft.com/playwright/python:v1.44.0-jammy

WORKDIR /app

# Copy requirements first so the (slow) pip layer is cached across code-only changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apply.py .

# Drop root. This task drives a real browser against arbitrary third-party career
# sites — the most exposed code in the system — so it should not also hold root in
# its container. `pwuser` is a non-root user the Playwright base image already
# creates and whose browser cache is already owned correctly.
USER pwuser

CMD ["python", "apply.py"]
