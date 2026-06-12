"""
JoBoss Auto Apply — Fargate Playwright script (Phase 2)

Entry point for the ECS Fargate task. Reads TASK_PAYLOAD from the environment
(injected by ECS at launch), opens the job URL with Playwright/Chromium,
attempts to fill and submit the application form, updates DynamoDB, and sends
a result email via SES.

Timeout: 240 seconds (4 min) — leaves 60 s buffer inside the 5-min SQS
visibility window so the Lambda can handle failure reporting if the task never
starts.
"""

import json
import logging
import os
import signal
import sys
import tempfile
import time
from contextlib import contextmanager
from datetime import datetime, timezone

import boto3
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
from playwright_stealth import stealth_sync

# ── Config ────────────────────────────────────────────────────────────────────
REGION            = os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
RESUME_BUCKET     = "joboss-resumes-171109860478"
APPLICATIONS_TABLE = os.environ.get("APPLICATIONS_TABLE", "joboss-applications")
USERS_TABLE       = os.environ.get("USERS_TABLE", "joboss-users")
SES_SENDER        = os.environ.get("SES_SENDER", "joboss.appteam@gmail.com")
MAX_SECONDS       = 240

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("auto-apply")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
s3       = boto3.client("s3",  region_name=REGION)
ses      = boto3.client("ses", region_name=REGION)
apps_tbl = dynamodb.Table(APPLICATIONS_TABLE)
users_tbl = dynamodb.Table(USERS_TABLE)


# ── Helpers ───────────────────────────────────────────────────────────────────

def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def update_status(user_id, job_id, status, fail_reason=None):
    expr   = "SET #s = :s, updatedAt = :ts"
    names  = {"#s": "status"}
    values = {":s": status, ":ts": now_iso()}
    if fail_reason:
        expr += ", failReason = :fr"
        values[":fr"] = fail_reason[:500]
    apps_tbl.update_item(
        Key={"userId": user_id, "jobId": job_id},
        UpdateExpression=expr,
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )
    log.info("DB status → %s (userId=%s, jobId=%s)", status, user_id, job_id)


def get_user_email(user_id):
    try:
        item = users_tbl.get_item(Key={"userId": user_id}).get("Item", {})
        return item.get("email", "")
    except Exception:
        return ""


def _download_s3_pdf(bucket, key, label="resume"):
    """Download a PDF from S3 to a temp file and return its path."""
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    s3.download_fileobj(bucket, key, tmp)
    tmp.flush()
    log.info("%s downloaded: s3://%s/%s → %s", label, bucket, key, tmp.name)
    return tmp.name


def download_resume(user_id, tailored_s3_url=None):
    """Return a local path to the best available resume PDF.

    Priority:
      1. tailored_s3_url (s3://bucket/key) — the Bedrock-tailored version for
         this specific job, passed in the SQS payload by the ai-tailor Lambda.
      2. Latest original PDF under users/{user_id}/ in the resume bucket.
    """
    # 1. Tailored CV takes priority.
    if tailored_s3_url and tailored_s3_url.startswith("s3://"):
        try:
            without_scheme = tailored_s3_url[5:]
            bucket, _, key = without_scheme.partition("/")
            if bucket and key:
                return _download_s3_pdf(bucket, key, label="tailored_resume")
            log.warning("Could not parse tailored_s3_url=%s, falling back to original", tailored_s3_url)
        except Exception as e:
            log.warning("Tailored CV download failed (%s), falling back to original", e)

    # 2. Fall back to the most recent original upload.
    prefix = f"users/{user_id}/"
    try:
        resp = s3.list_objects_v2(Bucket=RESUME_BUCKET, Prefix=prefix)
        # Exclude the tailored/ sub-prefix so we only pick original uploads.
        pdfs = sorted(
            [o["Key"] for o in resp.get("Contents", [])
             if o["Key"].lower().endswith(".pdf") and "/tailored/" not in o["Key"]],
            reverse=True,
        )
        if not pdfs:
            log.warning("No original PDF found for userId=%s", user_id)
            return None
        return _download_s3_pdf(RESUME_BUCKET, pdfs[0], label="original_resume")
    except Exception as e:
        log.error("Resume download failed: %s", e)
        return None


def send_email(to_addr, subject, body_text):
    if not to_addr:
        log.warning("No email address for user — skipping SES send")
        return
    try:
        ses.send_email(
            Source=SES_SENDER,
            Destination={"ToAddresses": [to_addr]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {"Text": {"Data": body_text, "Charset": "UTF-8"}},
            },
        )
        log.info("Email sent → %s | subject: %s", to_addr, subject)
    except Exception as e:
        log.error("SES send failed: %s", e)


# ── CAPTCHA / access-block detection ─────────────────────────────────────────

CAPTCHA_SELECTORS = [
    "iframe[src*='recaptcha']",
    ".g-recaptcha",
    "iframe[src*='hcaptcha']",
    ".h-captcha",
    "#captcha",
    "[data-captcha]",
]
BLOCK_TITLE_KEYWORDS = ["access denied", "robot check", "just a moment", "ddos-guard",
                         "cloudflare", "are you human", "verify you are human"]


def detect_captcha(page):
    title = (page.title() or "").lower()
    if any(k in title for k in BLOCK_TITLE_KEYWORDS):
        return f"blocked page title: '{page.title()}'"
    for sel in CAPTCHA_SELECTORS:
        try:
            if page.locator(sel).count() > 0:
                return f"captcha element found: {sel}"
        except Exception:
            pass
    return None


# ── Field-filling helpers ─────────────────────────────────────────────────────

FIELD_PATTERNS = {
    "name": [
        "input[name*='name' i]", "input[placeholder*='name' i]",
        "input[id*='name' i]", "input[autocomplete='name']",
        "input[name='fullName']", "input[name='full_name']",
    ],
    "first_name": [
        "input[name*='first' i]", "input[placeholder*='first' i]",
        "input[id*='first' i]", "input[autocomplete='given-name']",
    ],
    "last_name": [
        "input[name*='last' i]", "input[placeholder*='last' i]",
        "input[id*='last' i]", "input[autocomplete='family-name']",
    ],
    "email": [
        "input[type='email']", "input[name*='email' i]",
        "input[placeholder*='email' i]", "input[id*='email' i]",
        "input[autocomplete='email']",
    ],
    "phone": [
        "input[type='tel']", "input[name*='phone' i]",
        "input[placeholder*='phone' i]", "input[id*='phone' i]",
        "input[autocomplete='tel']",
    ],
    "resume": [
        "input[type='file'][name*='resume' i]",
        "input[type='file'][name*='cv' i]",
        "input[type='file'][accept*='pdf' i]",
        "input[type='file']",
    ],
}

SUBMIT_PATTERNS = [
    "button[type='submit']",
    "input[type='submit']",
    "button:has-text('submit')",
    "button:has-text('apply')",
    "button:has-text('send application')",
    "button:has-text('הגש')",
    "button:has-text('הגשת מועמדות')",
    "button:has-text('שלח')",
    "button:has-text('שליחה')",
    "[data-qa='btn-submit']",
    ".submit-button",
    "#submit",
]

# Buttons that advance a multi-step application wizard to its next page.
NEXT_STEP_PATTERNS = [
    "button:has-text('Next')",
    "button:has-text('Continue')",
    "button:has-text('הבא')",
    "button:has-text('המשך')",
    "button:has-text('המשיכו')",
    "a:has-text('Next')",
    "[class*='next-step']",
    "[data-qa*='next']",
]


def try_fill_field(page, patterns, value, field_name):
    for sel in patterns:
        try:
            loc = page.locator(sel).first
            if loc.count() == 0:
                continue
            if not loc.is_visible() or not loc.is_enabled():
                continue
            loc.fill(value)
            log.info("Filled %s via '%s'", field_name, sel)
            return True
        except Exception:
            continue
    return False


def try_upload_resume(page, resume_path):
    if not resume_path:
        return False
    for sel in FIELD_PATTERNS["resume"]:
        try:
            loc = page.locator(sel).first
            if loc.count() == 0:
                continue
            loc.set_input_files(resume_path)
            log.info("Resume uploaded via '%s'", sel)
            return True
        except Exception:
            continue
    return False


def try_click_first(page, selectors):
    """Try each selector in order; click the first visible+enabled match. Returns selector used or None."""
    for sel in selectors:
        try:
            loc = page.locator(sel).first
            if loc.count() == 0:
                continue
            if not loc.is_visible() or not loc.is_enabled():
                continue
            loc.click()
            log.info("Clicked '%s'", sel)
            return sel
        except Exception:
            continue
    return None


def wait_for_settle(page, timeout=15_000):
    try:
        page.wait_for_load_state("networkidle", timeout=timeout)
    except PlaywrightTimeout:
        pass


def fill_common_fields(page, user_email, resume_path):
    """Fill name/email/phone/resume. Returns True if at least one field was filled."""
    filled_any = False
    if try_fill_field(page, FIELD_PATTERNS["name"], "Applicant", "name"):
        filled_any = True
    else:
        fn = try_fill_field(page, FIELD_PATTERNS["first_name"], "Applicant", "first_name")
        ln = try_fill_field(page, FIELD_PATTERNS["last_name"], "", "last_name")
        if fn or ln:
            filled_any = True
    if try_fill_field(page, FIELD_PATTERNS["email"], user_email or "applicant@example.com", "email"):
        filled_any = True
    try_fill_field(page, FIELD_PATTERNS["phone"], "", "phone")
    if resume_path and try_upload_resume(page, resume_path):
        filled_any = True
    return filled_any


# ── Site-specific flows ───────────────────────────────────────────────────────

def apply_smartrecruiters(page, user_email, resume_path):
    """
    SmartRecruiters multi-step flow:
      1. Click the Apply / Apply now button to open the application form
      2. Fill fields
      3. Click Next / Continue / Submit
    Returns (success: bool, reason: str | None)
    """
    log.info("SmartRecruiters flow")
    wait_for_settle(page)
    captcha = detect_captcha(page)
    if captcha:
        return False, f"captcha_detected: {captcha}"

    # SmartRecruiters uses "I'm interested" / js-oneclick links.
    # Prefer navigating directly to the oneclick-ui href — more reliable than a click.
    navigated = False
    try:
        btn = page.locator("a.js-oneclick").first
        if btn.count() > 0:
            oneclick_href = btn.get_attribute("href")
            if oneclick_href:
                log.info("SmartRecruiters: navigating to oneclick URL: %s", oneclick_href)
                page.goto(oneclick_href, wait_until="domcontentloaded", timeout=60_000)
                wait_for_settle(page)
                navigated = True
    except Exception as e:
        log.warning("SmartRecruiters: oneclick navigation failed: %s", e)

    if not navigated:
        # Fallback — try clicking any "I'm interested" or "Apply" CTA
        apply_btns = [
            "a.js-oneclick",
            "a:has-text(\"I'm interested\")",
            "button:has-text(\"I'm interested\")",
            "[data-ui='apply-btn']",
            "button:has-text('Apply now')",
            "a:has-text('Apply now')",
            "button:has-text('Apply')",
            "a:has-text('Apply')",
        ]
        clicked = try_click_first(page, apply_btns)
        if clicked:
            wait_for_settle(page)
        else:
            log.warning("SmartRecruiters: no Apply/Interested button found — trying form directly")

    captcha = detect_captcha(page)
    if captcha:
        return False, f"captcha_detected: {captcha}"

    # Step 2 — fill fields
    page.wait_for_timeout(2_000)
    filled = fill_common_fields(page, user_email, resume_path)
    if not filled:
        return False, "no fillable form fields found on page"

    # Step 3 — advance through steps
    next_btns = [
        "[data-ui='btn-submit']",
        "button[type='submit']",
        "button:has-text('Next')",
        "button:has-text('Continue')",
        "button:has-text('Send')",
        "button:has-text('Submit')",
        "button:has-text('Apply')",
        "input[type='submit']",
    ]
    page.wait_for_timeout(1_000)
    clicked = try_click_first(page, next_btns)
    if not clicked:
        return False, "could not find submit/next button"

    wait_for_settle(page)
    captcha = detect_captcha(page)
    if captcha:
        return False, f"captcha_detected: {captcha}"

    return True, None


def apply_lever(page, user_email, resume_path):
    """
    Lever single-page flow: fields are directly on the page.
    Returns (success: bool, reason: str | None)
    """
    log.info("Lever flow")

    # Lever job listing URLs end with /job-id; the application form is at /job-id/apply
    current_url = page.url
    if not current_url.rstrip("/").endswith("/apply"):
        apply_url_form = current_url.rstrip("/") + "/apply"
        log.info("Lever: navigating to application form: %s", apply_url_form)
        page.goto(apply_url_form, wait_until="domcontentloaded", timeout=60_000)

    wait_for_settle(page)

    captcha = detect_captcha(page)
    if captcha:
        return False, f"captcha_detected: {captcha}"

    # Wait for the application form fields to appear
    for sel in ["input[name='name']", "input[name='email']", "form"]:
        try:
            page.wait_for_selector(sel, timeout=10_000)
            log.info("Lever form ready (found '%s')", sel)
            break
        except PlaywrightTimeout:
            continue

    page.wait_for_timeout(1_000)

    # Lever uses specific name attributes
    filled_any = False
    try:
        if try_fill_field(page, ["input[name='name']"], "Applicant", "name"):
            filled_any = True
    except Exception:
        pass
    try:
        if try_fill_field(page, ["input[name='email']"], user_email or "applicant@example.com", "email"):
            filled_any = True
    except Exception:
        pass
    try:
        try_fill_field(page, ["input[name='phone']"], "", "phone")
    except Exception:
        pass
    if resume_path:
        try:
            if try_upload_resume(page, resume_path):
                filled_any = True
        except Exception:
            pass

    if not filled_any:
        # Fall back to generic selectors
        filled_any = fill_common_fields(page, user_email, resume_path)

    if not filled_any:
        return False, "no fillable form fields found on page"

    submit_btns = [
        "button[type='submit']",
        "input[type='submit']",
        "button:has-text('Submit application')",
        "button:has-text('Submit')",
        "button:has-text('Apply')",
    ]
    page.wait_for_timeout(1_000)
    clicked = try_click_first(page, submit_btns)
    if not clicked:
        return False, "could not find submit button"

    wait_for_settle(page)
    captcha = detect_captcha(page)
    if captcha:
        return False, f"captcha_detected: {captcha}"

    return True, None


# CTAs that lead from a job posting to its application form.
APPLY_CTA_SELECTORS = [
    "a:has-text('Apply')", "button:has-text('Apply')",
    "a:has-text('Apply here')", "a:has-text('Apply now')",
    "button:has-text('Apply now')", "a:has-text('Register')",
    "button:has-text('Register')", "a:has-text('Create account')",
    # Hebrew career sites
    "a:has-text('הגשת מועמדות')", "button:has-text('הגשת מועמדות')",
    "a:has-text('הגש מועמדות')", "button:has-text('הגש מועמדות')",
    "a:has-text('להגשת מועמדות')", "a:has-text('שלחו קורות חיים')",
    "[class*='apply']", "[id*='apply']",
]

# Containers that may hold an application form in an overlay.
MODAL_SELECTORS = ["dialog", "[role='dialog']", ".modal", "#modal", "[class*='modal']"]

# Signals that a page is a genuine job application form (require >= 2).
JOB_URL_KEYWORDS = ["job", "career", "apply", "position", "vacancy", "opening", "recruitment"]
JOB_TEXT_KEYWORDS = ["resume", "cv", "cover letter", "application", "apply for", "job opening"]


def is_real_application_form(page):
    """Guard against submitting random forms (search bars, newsletter signups, etc.).
    Requires at least TWO independent signals that this is a real job application.
    Returns True only when >= 2 signals are present."""
    signals = 0
    found = []

    # 1. Resume / file upload field.
    try:
        if page.locator("input[type='file']").count() > 0:
            signals += 1
            found.append("file_upload")
    except Exception:
        pass

    # 2. Name field AND email field together.
    try:
        name_sels = FIELD_PATTERNS.get("name", []) + FIELD_PATTERNS.get("first_name", [])
        has_name = any(page.locator(s).count() > 0 for s in name_sels)
        has_email = any(page.locator(s).count() > 0 for s in FIELD_PATTERNS.get("email", []))
        if has_name and has_email:
            signals += 1
            found.append("name+email")
    except Exception:
        pass

    # 3. Three or more (non-hidden) input fields total.
    try:
        total_inputs = page.locator("input:not([type='hidden']), textarea").count()
        if total_inputs >= 3:
            signals += 1
            found.append(f"inputs={total_inputs}")
    except Exception:
        pass

    # 4. URL contains a job-related keyword.
    try:
        url = (page.url or "").lower()
        if any(k in url for k in JOB_URL_KEYWORDS):
            signals += 1
            found.append("url_keyword")
    except Exception:
        pass

    # 5. Page text mentions resume / application terms.
    try:
        text = (page.inner_text("body") or "").lower()
        if any(k in text for k in JOB_TEXT_KEYWORDS):
            signals += 1
            found.append("text_keyword")
    except Exception:
        pass

    log.info("Form validation: %d signal(s) [%s]", signals, ", ".join(found) or "none")
    return signals >= 2


def has_form_fields(page):
    """Return True if the page currently shows at least one visible fillable field."""
    selectors = [
        "input[type='text']", "input[type='email']", "input[type='tel']",
        "input:not([type])", "textarea", "input[type='file']",
        "input[name='name']", "input[name='email']",
    ]
    for sel in selectors:
        try:
            loc = page.locator(sel)
            if loc.count() > 0 and loc.first.is_visible():
                return True
        except Exception:
            continue
    return False


def _submit_and_finish(page):
    """Click submit, wait for settle, and check for a post-submit CAPTCHA."""
    page.wait_for_timeout(1_000)
    clicked = try_click_first(page, SUBMIT_PATTERNS)
    if not clicked:
        return False, "could not find submit button"

    wait_for_settle(page)
    captcha = detect_captcha(page)
    if captcha:
        return False, f"captcha_detected: {captcha}"

    return True, None


MAX_WIZARD_STEPS = 4


def _wizard_fill_and_submit(page, user_email, resume_path):
    """Walk a (possibly multi-step) application wizard: fill the visible
    fields, submit if a submit button exists, otherwise advance with
    Next/Continue and fill again. Many career sites split the form across
    several pages — a single submit click used to fail with
    'could not find submit button' even though the flow was completable."""
    for step in range(MAX_WIZARD_STEPS):
        if step > 0:
            # New wizard page — fill whatever fields it shows (best effort).
            fill_common_fields(page, user_email, resume_path)

        page.wait_for_timeout(1_000)
        if try_click_first(page, SUBMIT_PATTERNS):
            wait_for_settle(page)
            captcha = detect_captcha(page)
            if captcha:
                return False, f"captcha_detected: {captcha}"
            # If submitting only advanced the wizard (form fields still
            # visible), keep walking instead of declaring success.
            page.wait_for_timeout(1_500)
            if not has_form_fields(page):
                return True, None
            log.info("Wizard: submit advanced to another step (%d)", step + 1)
            continue

        if try_click_first(page, NEXT_STEP_PATTERNS):
            log.info("Wizard: advanced to step %d", step + 2)
            wait_for_settle(page)
            page.wait_for_timeout(1_500)
            captcha = detect_captcha(page)
            if captcha:
                return False, f"captcha_detected: {captcha}"
            continue

        return False, "could not find submit/next button"

    # Ran out of steps; if the form is gone, assume the last submit landed.
    if not has_form_fields(page):
        return True, None
    return False, f"application wizard did not finish within {MAX_WIZARD_STEPS} steps"


def _attempt_apply(page, user_email, resume_path):
    """Validate the current page is a real application form, then fill + submit.
    Returns (success, reason) if an attempt was made, or None if this page is not
    a valid application form (so the caller can keep navigating)."""
    if not is_real_application_form(page):
        return None
    if not fill_common_fields(page, user_email, resume_path):
        return None
    return _wizard_fill_and_submit(page, user_email, resume_path)


def apply_generic(page, user_email, resume_path):
    """
    Generic fallback flow for unknown job boards. Acts as a navigator: if the
    landing page has no form, it tries to reach one (click Apply/Register CTA,
    inspect modals, follow redirects) before giving up.
    Returns (success: bool, reason: str | None)
    """
    log.info("Generic flow")
    wait_for_settle(page)

    captcha = detect_captcha(page)
    if captcha:
        return False, f"captcha_detected: {captcha}"

    page.wait_for_timeout(3_000)

    captcha = detect_captcha(page)
    if captcha:
        return False, f"captcha_detected: {captcha}"

    # Direct attempt — a validated form is already on the landing page.
    res = _attempt_apply(page, user_email, resume_path)
    if res is not None:
        return res

    log.info("No valid form on landing page — entering navigator mode")
    start_url = page.url

    # Step 1 — click an Apply/Register CTA, then re-validate + attempt.
    cta = try_click_first(page, APPLY_CTA_SELECTORS)
    if cta:
        log.info("Clicked apply CTA: %s", cta)
        wait_for_settle(page)
        page.wait_for_timeout(2_000)
        captcha = detect_captcha(page)
        if captcha:
            return False, f"captcha_detected: {captcha}"
        res = _attempt_apply(page, user_email, resume_path)
        if res is not None:
            return res

    # Step 2 — a modal/dialog may have opened; if it holds a validated form, apply.
    for msel in MODAL_SELECTORS:
        try:
            loc = page.locator(msel)
            if loc.count() == 0:
                continue
            modal = loc.first
            if not modal.is_visible():
                continue
            if modal.locator("input, textarea").count() > 0:
                log.info("Found modal with fields: %s", msel)
                res = _attempt_apply(page, user_email, resume_path)
                if res is not None:
                    return res
        except Exception:
            continue

    # Step 3 — we may have been redirected to a new page; settle and re-attempt.
    if page.url != start_url:
        log.info("URL changed %s -> %s, re-checking for form", start_url, page.url)
        wait_for_settle(page)
        page.wait_for_timeout(2_000)
        captcha = detect_captcha(page)
        if captcha:
            return False, f"captcha_detected: {captcha}"
        res = _attempt_apply(page, user_email, resume_path)
        if res is not None:
            return res

    # Step 4 — genuinely no valid application form anywhere.
    return False, "no fillable form fields found on page"


# ── Main apply logic ──────────────────────────────────────────────────────────

def run_apply(payload):
    user_id             = payload["userId"]
    job_id              = payload["jobId"]
    job_url             = payload.get("jobUrl", "")
    job_title           = payload.get("jobTitle", "")
    company             = payload.get("company", "")
    tailored_resume_url = payload.get("tailoredResumeUrl", "")

    log.info(
        "Starting apply: userId=%s jobId=%s url=%s tailoredCV=%s",
        user_id, job_id, job_url, "yes" if tailored_resume_url else "no",
    )

    if not job_url:
        reason = "no jobUrl provided"
        log.error(reason)
        update_status(user_id, job_id, "auto_apply_failed", reason)
        return False, reason

    user_email  = get_user_email(user_id)
    resume_path = download_resume(user_id, tailored_s3_url=tailored_resume_url)

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
            locale="he-IL",
        )
        page = ctx.new_page()
        stealth_sync(page)  # patch navigator.webdriver, canvas fingerprint, etc.

        try:
            page.goto(job_url, wait_until="domcontentloaded", timeout=60_000)

            # Dispatch to the right site-specific flow
            url_lower = job_url.lower()
            if "smartrecruiters.com" in url_lower:
                success, reason = apply_smartrecruiters(page, user_email, resume_path)
            elif "lever.co" in url_lower:
                success, reason = apply_lever(page, user_email, resume_path)
            else:
                success, reason = apply_generic(page, user_email, resume_path)

            if success:
                update_status(user_id, job_id, "auto_apply_success")
            else:
                update_status(user_id, job_id, "auto_apply_failed", reason)

            browser.close()
            _send_result_email(success, user_email, job_title, company, job_url, reason)
            return success, reason

        except PlaywrightTimeout as e:
            reason = f"page load timeout: {e}"
            log.error(reason)
            update_status(user_id, job_id, "auto_apply_failed", reason[:500])
            try:
                browser.close()
            except Exception:
                pass
            _send_result_email(False, user_email, job_title, company, job_url, reason)
            return False, reason

        except Exception as e:
            reason = f"unexpected error: {e}"
            log.exception("Playwright error")
            update_status(user_id, job_id, "auto_apply_failed", reason[:500])
            try:
                browser.close()
            except Exception:
                pass
            _send_result_email(False, user_email, job_title, company, job_url, reason)
            return False, reason


def _send_result_email(success, user_email, job_title, company, job_url, fail_reason=None):
    if success:
        subject = f"✅ JoBoss הגיש עבורך מועמדות ל-{job_title} ב-{company}"
        body = (
            f"שלום,\n\n"
            f"JoBoss הגיש בהצלחה את מועמדותך למשרת {job_title} ב-{company}.\n\n"
            f"קישור למשרה: {job_url}\n\n"
            f"בהצלחה! 🚀\n— צוות JoBoss"
        )
    else:
        subject = f"⚠️ JoBoss לא הצליח להגיש עבורך ל-{job_title} ב-{company}"
        body = (
            f"שלום,\n\n"
            f"JoBoss ניסה להגיש את מועמדותך למשרת {job_title} ב-{company} אך נתקל בבעיה.\n\n"
            f"סיבה: {fail_reason or 'שגיאה לא ידועה'}\n\n"
            f"אנא הגש ידנית דרך הקישור: {job_url}\n\n"
            f"— צוות JoBoss"
        )
    send_email(user_email, subject, body)


# ── Timeout enforcement ───────────────────────────────────────────────────────

def _timeout_handler(signum, frame):
    log.error("MAX_SECONDS=%d exceeded — forcing exit", MAX_SECONDS)
    sys.exit(1)


# ── Entrypoint ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    signal.signal(signal.SIGALRM, _timeout_handler)
    signal.alarm(MAX_SECONDS)

    raw = os.environ.get("TASK_PAYLOAD", "")
    if not raw:
        log.error("TASK_PAYLOAD env var is empty — nothing to do")
        sys.exit(1)

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        log.error("Invalid TASK_PAYLOAD JSON: %s", e)
        sys.exit(1)

    log.info("TASK_PAYLOAD: %s", json.dumps(payload))
    success, reason = run_apply(payload)
    log.info("RESULT: success=%s reason=%s", success, reason)
    sys.exit(0 if success else 1)
