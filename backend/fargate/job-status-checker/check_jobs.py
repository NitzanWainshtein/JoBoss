# JoBoss feature:
# - F-18: Job Status Monitoring & Cleanup (Tier 2)

"""
JoBoss Job Status Checker — Tier 2 (Fargate, real browser).

Runs once a day as a scheduled ECS task, shortly after the Tier 1 Lambda
(backend/lambdas/jobs_status_checker) finishes — see
infrastructure/job-status-checker/ for both schedules. Tier 1 flags a job
tier2Pending=true when a plain HTTP request could not confidently tell whether
the posting is still open: blocked, timed out, or a JS-only page that never
rendered as static HTML. This is the real-browser follow-up — one headless
Chromium instance, reused for the whole batch (not one Fargate task per job;
that would multiply cost for no benefit), checks each flagged applyUrl exactly as
a person opening the link would.

Escalation: checkFailCount reaching ESCALATE_AFTER_FAILS (2, decided 2026-08-13)
sends a job to admin review (reviewStatus=pending_review) instead of deleting it
or guessing it's still open. A job in that state is skipped by both tiers until
an admin resolves it via the admin panel — see backend/lambdas/admin/handler.py's
handle_list_pending_review_jobs / handle_resolve_job_review.

DRY_RUN mirrors Tier 1's flag: defaults to true, deliberately, so a first run
against production can be observed in CloudWatch before it is trusted to write.
"""

import logging
import os
from datetime import datetime, timezone

import boto3
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

from jobs_repository import (
    delete_job,
    escalate_to_review,
    mark_checked_open,
    mark_still_inconclusive,
    scan_tier2_pending,
)

try:
    from playwright_stealth import stealth_sync
except ImportError:  # pragma: no cover - always present in the built image
    stealth_sync = None

REGION = os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
TABLE_NAME = os.environ.get("DYNAMODB_JOBS_TABLE", "joboss-jobs")
DRY_RUN = os.environ.get("DRY_RUN", "true").lower() == "true"
ESCALATE_AFTER_FAILS = int(os.environ.get("ESCALATE_AFTER_FAILS", "2"))
NAV_TIMEOUT_MS = 20_000

# A real job page's rendered text runs to thousands of characters. Kept in sync
# with backend/lambdas/jobs_status_checker/job_status_detector.py's
# INACTIVE_TEXT_MARKERS by backend/tests/test_status_checker_markers_in_sync.py —
# that test fails the moment the two lists disagree.
MIN_CONTENT_CHARS = 200
INACTIVE_TEXT_MARKERS = [
    "job no longer available",
    "this job is no longer available",
    "position has been filled",
    "this position has been filled",
    "no longer accepting applications",
    "job has expired",
    "this job has expired",
    "the job you are looking for is no longer available",
    "המשרה אינה זמינה",
    "המשרה לא זמינה",
]

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("job-status-checker-tier2")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
table = dynamodb.Table(TABLE_NAME)


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def classify_with_browser(page, apply_url):
    """Returns (status, reason): "closed" / "open" / "inconclusive"."""
    try:
        response = page.goto(apply_url, wait_until="networkidle", timeout=NAV_TIMEOUT_MS)
    except PlaywrightTimeout:
        return "inconclusive", "playwright_timeout"
    except Exception as e:
        return "inconclusive", f"playwright_error:{type(e).__name__}"

    status_code = response.status if response else 0
    if status_code in (404, 410):
        return "closed", f"http_{status_code}"
    if status_code and status_code != 200:
        return "inconclusive", f"http_{status_code}"

    try:
        text = page.inner_text("body").strip().lower()
    except Exception:
        text = ""

    if any(marker in text for marker in INACTIVE_TEXT_MARKERS):
        return "closed", "text_marker"
    if len(text) < MIN_CONTENT_CHARS:
        return "inconclusive", "empty_response"
    return "open", "ok"


def process_job(page, job, checked_at, counts):
    job_id = job["jobId"]
    apply_url = job.get("applyUrl", "")
    fail_count = int(job.get("checkFailCount", 0) or 0)
    title, company = job.get("title", ""), job.get("company", "")

    status, reason = ("inconclusive", "no_apply_url") if not apply_url \
        else classify_with_browser(page, apply_url)

    if status == "closed":
        if DRY_RUN:
            log.info("DRY RUN: would delete %r @ %r (%s) reason=%s", title, company, apply_url, reason)
        else:
            delete_job(table, job_id)
        counts["deleted"] += 1

    elif status == "open":
        if not DRY_RUN:
            mark_checked_open(table, job_id, checked_at)
        counts["kept"] += 1

    else:  # inconclusive even with a real browser
        new_fail_count = fail_count + 1
        if new_fail_count >= ESCALATE_AFTER_FAILS:
            if not DRY_RUN:
                escalate_to_review(table, job_id, reason, new_fail_count, checked_at)
            counts["escalated"] += 1
            log.info("Escalated to admin: %r @ %r (%s) reason=%s attempts=%d",
                      title, company, apply_url, reason, new_fail_count)
        else:
            if not DRY_RUN:
                mark_still_inconclusive(table, job_id, reason, new_fail_count, checked_at)
            counts["still_inconclusive"] += 1


def main():
    jobs = scan_tier2_pending(table)
    log.info("Tier 2: %d job(s) flagged by Tier 1 (dryRun=%s)", len(jobs), DRY_RUN)

    if not jobs:
        return

    checked_at = now_iso()
    counts = {"deleted": 0, "kept": 0, "escalated": 0, "still_inconclusive": 0}

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox",
                  "--disable-dev-shm-usage", "--disable-gpu"],
        )
        ctx = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
        )
        page = ctx.new_page()
        if stealth_sync:
            stealth_sync(page)

        for job in jobs:
            try:
                process_job(page, job, checked_at, counts)
            except Exception as e:
                # One job's unexpected failure must not abort the whole batch —
                # everything after it still deserves a check today.
                log.error("Unexpected error checking jobId=%s: %s", job.get("jobId"), e)

        browser.close()

    log.info("Tier 2 complete: %s", counts)


if __name__ == "__main__":
    main()
