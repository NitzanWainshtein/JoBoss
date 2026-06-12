import base64
import json
import os
import re
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

import boto3
from botocore.exceptions import ClientError


REGION = os.getenv("AWS_REGION", "us-east-1")
MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
AI_MODE = os.getenv("AI_MODE", "auto")
USERS_TABLE = os.getenv("USERS_TABLE", "joboss-users")
JOBS_TABLE = os.getenv("JOBS_TABLE", "joboss-jobs")
APPLICATIONS_TABLE = os.getenv("APPLICATIONS_TABLE", "joboss-applications")
RESUME_BUCKET = os.getenv("RESUME_BUCKET_NAME", "joboss-resumes-171109860478")
SQS_QUEUE_URL = os.getenv("SQS_QUEUE_URL", "https://sqs.us-east-1.amazonaws.com/171109860478/joboss-auto-apply-queue")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)
sqs = boto3.client("sqs", region_name=REGION)
bedrock = boto3.client("bedrock-runtime", region_name=REGION)

users_table = dynamodb.Table(USERS_TABLE)
jobs_table = dynamodb.Table(JOBS_TABLE)
applications_table = dynamodb.Table(APPLICATIONS_TABLE)


def decimal_to_native(obj):
    if isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        return float(obj)
    raise TypeError


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
        },
        "body": json.dumps(body, default=decimal_to_native),
    }


def get_body(event):
    if isinstance(event.get("body"), str):
        return json.loads(event.get("body") or "{}")
    return event.get("body") or event


def get_user_id(event, body):
    claims = (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("claims", {})
    )
    user_id = claims.get("sub")
    if user_id:
        return user_id

    # NOTE: the Authorization-header decode below is unverified — it only
    # stands in until POST /ai/tailor gets a Cognito authorizer at the gateway.
    # Never fall back to body["userId"]: that let anyone act as any user.
    return get_user_id_from_authorization_header(event)


def get_user_id_from_authorization_header(event):
    headers = event.get("headers") or {}
    token = headers.get("Authorization") or headers.get("authorization") or ""
    token = token.replace("Bearer ", "", 1).strip()

    parts = token.split(".")
    if len(parts) < 2:
        return None

    try:
        payload = parts[1]
        payload += "=" * (-len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload.encode("utf-8"))
        claims = json.loads(decoded.decode("utf-8"))
        return claims.get("sub")
    except Exception:
        return None


def parse_s3_url(url):
    if not url or not url.startswith("s3://"):
        return None, None

    without_scheme = url.replace("s3://", "", 1)
    bucket, _, key = without_scheme.partition("/")
    return bucket, key


def get_user(user_id):
    result = users_table.get_item(Key={"userId": user_id})
    return result.get("Item")


def get_job(job_id):
    result = jobs_table.get_item(Key={"jobId": job_id})
    return result.get("Item")


def find_resume(user, resume_id):
    resumes = user.get("resumes") or []

    if resume_id:
        return next((resume for resume in resumes if resume.get("resumeId") == resume_id), None)

    active_resume = next((resume for resume in resumes if resume.get("isActive")), None)
    if active_resume:
        return active_resume

    if user.get("resumeUrl"):
        return {
            "resumeId": "active-resume",
            "url": user["resumeUrl"],
            "fileName": "resume.pdf",
        }

    return resumes[0] if resumes else None


def build_resume_from_text(resume_id, resume_text):
    if not resume_text:
        return None

    return {
        "resumeId": resume_id or "provided-resume-text",
        "fileName": "provided-resume-text.txt",
        "url": "",
    }


def read_resume_text(resume):
    bucket, key = parse_s3_url(resume.get("url") or resume.get("resumeUrl"))

    if not bucket or not key:
        return ""

    obj = s3.get_object(Bucket=bucket, Key=key)
    content = obj["Body"].read()

    try:
        text = content.decode("utf-8", errors="ignore").strip()
    except Exception:
        text = ""

    if text and "%PDF" not in text[:20]:
        return text[:8000]

    return (
        f"Original resume file: {resume.get('fileName', 'resume.pdf')}. "
        "The uploaded file is binary/PDF, so this demo uses available profile metadata "
        "and job details to create a mock tailored resume preview."
    )


def build_job_description(job):
    requirements = job.get("requirements") or job.get("technologies") or []
    if isinstance(requirements, list):
        requirements_text = ", ".join(str(item) for item in requirements)
    else:
        requirements_text = str(requirements)

    return "\n".join([
        f"Title: {job.get('title', '')}",
        f"Company: {job.get('company', '')}",
        f"Location: {job.get('location', '')}",
        f"Requirements: {requirements_text}",
        f"Description: {job.get('description', '')}",
    ]).strip()


def build_prompt(resume_text, job_description):
    return f"""<task>
You are an expert resume writer. Tailor the candidate's resume for the target role.

Work through these phases silently (do NOT output analysis, only the final resume):

PHASE 1 — JOB ANALYSIS:
Extract from the job description: required technical skills, experience level,
key responsibilities, domain/industry context, and keywords that must appear.

PHASE 2 — SKILLS MATCHING with confidence scoring:
For each required skill, classify what exists in the resume:
- DIRECT (high confidence): candidate explicitly has this exact skill
- TRANSFERABLE (medium confidence): candidate has a related skill that proves the capability
- ADJACENT (lower confidence): candidate has experience in a related domain
- GAP: candidate lacks this — DO NOT invent it, simply omit
Score overall fit and identify the 3 strongest angles to position this candidate.

PHASE 3 — TRUTH-PRESERVING GENERATION RULES:
1. NEVER invent skills, years of experience, job titles, or projects — only use what is in the resume.
2. REFRAME existing experience to highlight relevance without fabricating new claims.
3. LEAD each section with the most relevant points for this specific role.
4. For DIRECT/TRANSFERABLE matches: feature them prominently.
5. For GAPs: simply omit — do not apologize or mention missing skills.
6. OUTPUT ONLY the resume — no commentary, no explanations, no ethical notes.
</task>

<job_description>
{job_description}
</job_description>

<original_resume>
{resume_text}
</original_resume>

Output the tailored resume in this exact markdown format:

# [CANDIDATE NAME]
[contact info — phone · email · location]

## PROFESSIONAL SUMMARY
[2-3 sentences positioning the candidate for THIS specific role using only their actual background. Include relevant keywords from the job description that genuinely apply.]

## TECHNICAL SKILLS
[**Category:** skill1, skill2 — organized by relevance to the job, only skills from the original resume]

## PROFESSIONAL EXPERIENCE
[**Job Title — Company**]
[dates]
[- Bullets reordered to lead with accomplishments most relevant to this role]

## PROJECTS
[**Project Name (Tech Stack)**]
[- Bullets reframed to highlight aspects most relevant to the job]

## EDUCATION
[Preserved exactly from the original resume]""".strip()


def invoke_bedrock_claude(messages, max_tokens=2000):
    import time
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "temperature": 0.4,
        "messages": messages,
    }
    payload = json.dumps(body)

    # Exponential backoff on ThrottlingException: 1s, 2s, 4s before giving up.
    delay = 1
    last_exc = None
    for attempt in range(3):
        try:
            result = bedrock.invoke_model(
                modelId=MODEL_ID,
                contentType="application/json",
                accept="application/json",
                body=payload,
            )
            result_body = json.loads(result["body"].read())
            return result_body["content"][0]["text"]
        except Exception as e:
            err_code = getattr(e, "response", {}).get("Error", {}).get("Code", "") if hasattr(e, "response") else ""
            if err_code == "ThrottlingException" and attempt < 2:
                print(f"[BEDROCK_THROTTLE] attempt {attempt + 1}/3 — retrying in {delay}s")
                time.sleep(delay)
                delay *= 2
                last_exc = e
            else:
                raise
    raise last_exc


def invoke_bedrock_nova(prompt):
    return invoke_bedrock_claude([
        {"role": "user", "content": [{"type": "text", "text": prompt}]}
    ])


def read_resume_bytes(resume):
    bucket, key = parse_s3_url(resume.get("url") or resume.get("resumeUrl"))
    if not bucket or not key:
        return None
    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
        return obj["Body"].read()
    except Exception:
        return None


def build_mock_tailored_resume(user, job, resume_text):
    title = job.get("title", "the role")
    company = job.get("company", "the company")
    requirements = job.get("requirements") or job.get("technologies") or []
    skills = ", ".join(requirements[:6]) if isinstance(requirements, list) else str(requirements)
    skills = skills or extract_resume_skills(resume_text)
    candidate_name = find_resume_name(resume_text)
    project_lines = find_resume_lines(
        resume_text,
        ["project", "github", "developed", "built", "implemented", "react", "java", "python", "aws"],
        5,
    )
    education_lines = find_resume_lines(
        resume_text,
        ["university", "college", "bachelor", "computer science", "student", "degree"],
        3,
    )
    experience_lines = find_resume_lines(
        resume_text,
        ["experience", "supervisor", "manager", "led", "maintained", "worked", "developed"],
        4,
    )

    return f"""
{candidate_name}
Target Role: {title} | {company}

PROFESSIONAL SUMMARY
Computer Science student and software developer focused on {title} roles. Brings hands-on software project experience and a practical foundation aligned with {company}'s requirements: {skills}.

TECHNICAL SKILLS
{skills}

PROJECTS
{format_resume_bullets(project_lines, ["Built software projects demonstrating practical development, problem solving, and implementation skills.", "Applied programming fundamentals and modern development tools in academic and personal projects."])}

EDUCATION
{format_resume_bullets(education_lines, ["Computer Science studies with emphasis on software development fundamentals."])}

EXPERIENCE
{format_resume_bullets(experience_lines, ["Demonstrated responsibility, communication, ownership, and structured problem solving in previous roles."])}
""".strip()


def get_resume_lines(resume_text):
    skipped_headings = {
        "summary", "professional summary", "projects", "project", "skills",
        "technical skills", "education", "experience", "work experience",
        "contact", "contact information",
    }

    return [
        line.strip(" -•\t")
        for line in resume_text.replace("\r", "\n").split("\n")
        if line.strip() and line.strip().lower() not in skipped_headings
    ]


def find_resume_name(resume_text):
    for line in get_resume_lines(resume_text)[:8]:
        if 2 <= len(line.split()) <= 4 and not any(char.isdigit() for char in line):
            if "@" not in line and "student" not in line.lower() and "resume" not in line.lower():
                return line
    return "Candidate"


def extract_resume_skills(resume_text):
    known_skills = [
        "React", "JavaScript", "TypeScript", "Node.js", "Python", "Java", "C", "C++",
        "AWS", "Lambda", "DynamoDB", "SQL", "MongoDB", "Git", "HTML", "CSS",
    ]
    text = resume_text.lower()
    matched = [skill for skill in known_skills if skill.lower() in text]
    return ", ".join(matched[:10]) or "Software development, problem solving, teamwork"


def find_resume_lines(resume_text, keywords, limit):
    keyword_set = [keyword.lower() for keyword in keywords]
    clean_lines = [
        line for line in get_resume_lines(resume_text)
        if any(keyword in line.lower() for keyword in keyword_set)
    ]

    return clean_lines[:limit]


def format_resume_bullets(lines, fallback):
    selected = lines or fallback
    return "\n".join(f"- {line[:190]}" for line in selected)


def check_job_relevance(user, job, resume_text, pdf_bytes=None):
    """Returns {isRelevant: bool, reason: str}. Always falls back to isRelevant=True on error."""
    if AI_MODE.lower() == "mock":
        return {"isRelevant": True, "reason": ""}

    job_title = job.get("title", "")
    requirements = job.get("requirements") or job.get("technologies") or []
    req_text = ", ".join(str(r) for r in requirements[:8]) if isinstance(requirements, list) else str(requirements)

    relevance_q = (
        f"Job title: {job_title}\n"
        f"Requirements: {req_text}\n\n"
        "Is this job reasonably relevant to this candidate's background? "
        "Be lenient — only flag a clear, obvious mismatch (e.g. CS student vs mechanical engineering). "
        'Answer ONLY with valid JSON: {"isRelevant": true/false, "reason": "brief Hebrew explanation if false, empty string if true"}'
    )

    try:
        if pdf_bytes and len(pdf_bytes) > 100:
            pdf_b64 = base64.standard_b64encode(pdf_bytes).decode("utf-8")
            messages = [{
                "role": "user",
                "content": [
                    {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": pdf_b64}},
                    {"type": "text", "text": relevance_q},
                ],
            }]
        else:
            resume_snippet = resume_text[:600] if resume_text else ""
            messages = [{"role": "user", "content": [{"type": "text", "text": f"Resume excerpt:\n{resume_snippet}\n\n{relevance_q}"}]}]

        raw = invoke_bedrock_claude(messages, max_tokens=120)
        match = re.search(r'\{[\s\S]*?\}', raw)
        if match:
            parsed = json.loads(match.group())
            return {
                "isRelevant": bool(parsed.get("isRelevant", True)),
                "reason": str(parsed.get("reason", "")),
            }
    except Exception as e:
        print(f"[RELEVANCE_CHECK_ERROR] {type(e).__name__}: {e}")

    return {"isRelevant": True, "reason": ""}


def extract_text_from_pdf_bytes(pdf_bytes):
    """Step 1: extract plain text from binary PDF using the document API."""
    pdf_b64 = base64.standard_b64encode(pdf_bytes).decode("utf-8")
    messages = [{
        "role": "user",
        "content": [
            {
                "type": "document",
                "source": {"type": "base64", "media_type": "application/pdf", "data": pdf_b64},
            },
            {
                "type": "text",
                "text": (
                    "Extract ALL text from this resume PDF exactly as written. "
                    "Preserve every section header, bullet point, date, skill, job title, "
                    "company name, project name, and contact detail. "
                    "Output ONLY the resume text — no commentary, no formatting changes."
                ),
            },
        ],
    }]
    try:
        extracted = invoke_bedrock_claude(messages, max_tokens=3000)
        return extracted if extracted and len(extracted) > 100 else None
    except Exception as e:
        print(f"[PDF_EXTRACT_ERROR] {e}")
        return None


def generate_tailored_resume(user, job, resume_text, pdf_bytes=None):
    job_description = build_job_description(job)

    if AI_MODE.lower() == "mock":
        return build_mock_tailored_resume(user, job, resume_text), "mock"

    try:
        effective_resume_text = resume_text

        # For binary PDFs: extract text first, then use the text-based SKILL prompt.
        # Two-step approach is more reliable than passing the raw PDF to the tailoring prompt.
        if pdf_bytes and len(pdf_bytes) > 100:
            extracted = extract_text_from_pdf_bytes(pdf_bytes)
            if extracted:
                effective_resume_text = extracted
                print(f"[PDF_EXTRACT] extracted {len(extracted)} chars from PDF")

        prompt = build_prompt(effective_resume_text, job_description)
        result = invoke_bedrock_claude(
            [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
            max_tokens=4000,
        )
        mode = "bedrock-pdf-extracted" if (pdf_bytes and effective_resume_text != resume_text) else "bedrock"
        return result, mode

    except Exception as e:
        print(f"[AI_ERROR] {type(e).__name__}: {e}")
        return build_mock_tailored_resume(user, job, resume_text), "mock"


def save_tailored_resume(user_id, job_id, tailored_text):
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    tailored_resume_id = f"tailored_{uuid4().hex}"
    key = f"users/{user_id}/tailored/{job_id}/{tailored_resume_id}.pdf"
    pdf_bytes = build_simple_pdf(tailored_text)

    s3.put_object(
        Bucket=RESUME_BUCKET,
        Key=key,
        Body=pdf_bytes,
        ContentType="application/pdf",
    )

    return {
        "tailoredResumeId": tailored_resume_id,
        "tailoredResumeUrl": f"s3://{RESUME_BUCKET}/{key}",
        "createdAt": now,
    }


_UNICODE_MAP = str.maketrans({
    "–": "-", "—": "-", "‒": "-",  # dashes
    "‘": "'", "’": "'",                   # curly single quotes
    "“": '"', "”": '"',                   # curly double quotes
    "•": "-", "‣": "-", "◦": "-",    # bullets
    "→": "->", "←": "<-", "…": "...",# arrows / ellipsis
    " ": " ",                                  # non-breaking space
})


def _sanitize(text):
    return text.translate(_UNICODE_MAP)


def escape_pdf_text(text):
    return (
        _sanitize(text)
        .replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
    )


def wrap_text(text, max_chars=70):
    lines = []
    for raw_line in text.splitlines():
        words = raw_line.split()
        if not words:
            lines.append("")
            continue
        current = ""
        for word in words:
            if len(current) + len(word) + 1 > max_chars:
                lines.append(current)
                current = word
            else:
                current = f"{current} {word}".strip()
        if current:
            lines.append(current)
    return lines


def _make_page_content(lines, start_y=760):
    parts = ["BT", "/F1 11 Tf", f"90 {start_y} Td", "14 TL"]
    for i, line in enumerate(lines):
        if i > 0:
            parts.append("T*")
        parts.append(f"({escape_pdf_text(line)}) Tj")
    parts.append("ET")
    return "\n".join(parts).encode("latin-1", errors="replace")


def build_simple_pdf(text):
    all_lines = wrap_text(text)
    lines_per_page = 52
    pages = [all_lines[i:i + lines_per_page] for i in range(0, len(all_lines), lines_per_page)]
    if not pages:
        pages = [[]]

    objects = []
    page_content_refs = []

    # object 1: catalog (placeholder, filled after)
    # object 2: pages dict (placeholder)
    # pages and content streams follow

    base_obj = 3  # first real object index (1-based, but we'll assign below)

    contents = []
    for page_lines in pages:
        contents.append(_make_page_content(page_lines))

    # Build object list:
    # 1 = Catalog
    # 2 = Pages
    # For each page N (0-indexed): object 3+2N = Page, object 4+2N = content stream
    n = len(pages)
    page_obj_ids = [3 + 2 * i for i in range(n)]
    content_obj_ids = [4 + 2 * i for i in range(n)]
    font_obj_id = 3 + 2 * n

    kids = " ".join(f"{oid} 0 R" for oid in page_obj_ids)
    page_objects = {}
    page_objects[1] = f"<< /Type /Catalog /Pages 2 0 R >>".encode("ascii")
    page_objects[2] = f"<< /Type /Pages /Kids [{kids}] /Count {n} >>".encode("ascii")

    for i, (pid, cid, cnt) in enumerate(zip(page_obj_ids, content_obj_ids, contents)):
        page_objects[pid] = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            f"/Resources << /Font << /F1 {font_obj_id} 0 R >> >> "
            f"/Contents {cid} 0 R >>".encode("ascii")
        )
        page_objects[cid] = (
            b"<< /Length " + str(len(cnt)).encode("ascii") + b" >>\nstream\n" + cnt + b"\nendstream"
        )

    page_objects[font_obj_id] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"

    max_id = font_obj_id
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = {}

    for oid in range(1, max_id + 1):
        offsets[oid] = len(pdf)
        pdf.extend(f"{oid} 0 obj\n".encode("ascii"))
        pdf.extend(page_objects[oid])
        pdf.extend(b"\nendobj\n")

    xref_start = len(pdf)
    pdf.extend(f"xref\n0 {max_id + 1}\n".encode("ascii"))
    pdf.extend(b"0000000000 65535 f \n")
    for oid in range(1, max_id + 1):
        pdf.extend(f"{offsets[oid]:010d} 00000 n \n".encode("ascii"))

    pdf.extend(
        f"trailer\n<< /Size {max_id + 1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF".encode("ascii")
    )

    return bytes(pdf)


def tailor_from_direct_text(event):
    resume_text = event.get("resume_text", "").strip()
    job_description = event.get("job_description", "").strip()

    if not resume_text or not job_description:
        return None

    prompt = build_prompt(resume_text, job_description)
    try:
        tailored_resume = invoke_bedrock_nova(prompt)
        mode = "bedrock"
    except Exception:
        tailored_resume = build_mock_tailored_resume({}, {"description": job_description}, resume_text)
        mode = "mock"

    return response(200, {
        "message": "Tailored resume generated",
        "tailoredResume": tailored_resume,
        "mode": mode,
    })


def build_analyze_cv_prompt(resume_text):
    return f"""Analyze this resume and return ONLY a valid JSON object with no explanation or markdown.

Resume:
{resume_text[:5000]}

Return exactly this JSON structure:
{{
  "suggestedRoles": ["3 to 8 specific job titles that match this candidate"],
  "experienceLevel": "one of: Student, Junior, Mid, Senior, Lead, Manager",
  "technologies": ["5 to 15 technologies or frameworks found in the resume"]
}}"""


def build_extract_profile_prompt(cv_text):
    return f"""Extract the following from this CV. Return only a JSON object with these exact keys: phone, currentLocation, currentCompany, fullName, linkedinUrl, githubUrl.

Rules:
- currentCompany: Extract ONLY the user's CURRENT employer (where they work right now, not past jobs). If they are a student or unemployed or it's unclear, return null for currentCompany. Return null if you're not confident the company is current.
- linkedinUrl and githubUrl: return the full profile URL if present.
- If a field is not found, return null for that field.

CV text:
{cv_text}""".strip()


def extract_profile_fields(resume_text, pdf_bytes=None):
    """Use Bedrock to extract phone/currentLocation/currentCompany/fullName from a CV.
    Returns a dict with those keys (values may be None), or {} on failure."""
    try:
        if pdf_bytes and len(pdf_bytes) > 100:
            pdf_b64 = base64.standard_b64encode(pdf_bytes).decode("utf-8")
            instruction = build_extract_profile_prompt("[SEE ATTACHED PDF RESUME]")
            messages = [{
                "role": "user",
                "content": [
                    {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": pdf_b64}},
                    {"type": "text", "text": instruction},
                ],
            }]
            raw = invoke_bedrock_claude(messages, max_tokens=300)
        elif resume_text:
            raw = invoke_bedrock_nova(build_extract_profile_prompt(resume_text[:5000]))
        else:
            return {}

        match = re.search(r'\{[\s\S]*\}', raw)
        if not match:
            return {}

        parsed = json.loads(match.group())
        return {
            "phone": parsed.get("phone"),
            "currentLocation": parsed.get("currentLocation"),
            "currentCompany": parsed.get("currentCompany"),
            "fullName": parsed.get("fullName"),
            "linkedinUrl": parsed.get("linkedinUrl"),
            "githubUrl": parsed.get("githubUrl"),
        }
    except Exception as e:
        print(f"[EXTRACT_PROFILE_ERROR] {type(e).__name__}: {e}")
        return {}


def enrich_user_profile_from_cv(user_id, extracted):
    """Update joboss-users with extracted CV fields, but only fields that are not already set
    (never overwrite user-entered data)."""
    if not user_id or not extracted:
        return

    user = get_user(user_id) or {}
    updates = {}
    for field in ("phone", "currentLocation", "currentCompany", "fullName", "linkedinUrl", "githubUrl"):
        value = extracted.get(field)
        if value and isinstance(value, str) and value.strip() and not str(user.get(field, "")).strip():
            updates[field] = value.strip()

    if not updates:
        return

    set_clause = ", ".join(f"#{k} = :{k}" for k in updates)
    expr_names = {f"#{k}": k for k in updates}
    expr_values = {f":{k}": v for k, v in updates.items()}

    try:
        users_table.update_item(
            Key={"userId": user_id},
            UpdateExpression=f"SET {set_clause}",
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values,
        )
        print(f"[ENRICH_PROFILE] userId={user_id} updated={list(updates.keys())}")
    except Exception as e:
        print(f"[ENRICH_PROFILE_ERROR] {type(e).__name__}: {e}")


def analyze_cv(event):
    body = get_body(event)
    resume_url = body.get("resumeUrl", "")
    resume_text = body.get("resumeText", "").strip()
    user_id = get_user_id(event, body)

    pdf_bytes = None
    if resume_url and not resume_text:
        bucket, key = parse_s3_url(resume_url)
        if bucket and key:
            try:
                obj = s3.get_object(Bucket=bucket, Key=key)
                content = obj["Body"].read()
                text = content.decode("utf-8", errors="ignore").strip()
                if text and "%PDF" not in text[:20]:
                    resume_text = text[:5000]
                else:
                    pdf_bytes = content
            except Exception:
                pass

    # Enrich the user's profile with phone/location/company/name from the CV.
    # Runs even for binary PDFs (via Bedrock document API). Best-effort, never blocks the response.
    if user_id:
        try:
            extracted = extract_profile_fields(resume_text, pdf_bytes=pdf_bytes)
            enrich_user_profile_from_cv(user_id, extracted)
        except Exception as e:
            print(f"[ANALYZE_CV_ENRICH_ERROR] {type(e).__name__}: {e}")

    if not resume_text:
        return response(200, {"suggestedRoles": [], "experienceLevel": "", "technologies": []})

    try:
        raw = invoke_bedrock_nova(build_analyze_cv_prompt(resume_text))
        match = re.search(r'\{[\s\S]*\}', raw)
        if match:
            parsed = json.loads(match.group())
            return response(200, {
                "suggestedRoles": parsed.get("suggestedRoles", [])[:8],
                "experienceLevel": parsed.get("experienceLevel", ""),
                "technologies": parsed.get("technologies", [])[:15],
            })
    except Exception:
        pass

    return response(200, {"suggestedRoles": [], "experienceLevel": "", "technologies": []})


def build_failure_prompt(fail_reason):
    return f"""You are helping a job seeker understand why an automated job application failed.
The technical failure reason was: "{fail_reason}"

Respond in Hebrew with ONLY a JSON object (no markdown, no explanation):
{{
  "title": "a very short Hebrew title (2-4 words) naming what went wrong, e.g. האתר חסם את הבוט",
  "summary": "2-3 short sentences in simple Hebrew explaining what happened, no technical jargon",
  "category": "one of: captcha | bot_blocked | missing_data | no_form | site_error | timeout | unknown",
  "action": "one short recommended next step in Hebrew"
}}

Map common cases:
- captcha / hcaptcha / recaptcha detected → category captcha
- access denied, blocked, 403, bot detection, cloudflare → category bot_blocked
- missing email/phone/resume/required field → category missing_data
- no application form found, no form, no apply button → category no_form
- timeout or page load failure → category timeout
- site or element or selector errors → category site_error
- anything unclear → category unknown""".strip()


FAILURE_FALLBACK = {
    "title": "ההגשה נכשלה",
    "summary": "ההגשה האוטומטית נכשלה מסיבה טכנית. ניתן לנסות להגיש ידנית.",
    "category": "unknown",
    "action": "נסה להגיש ידנית עם תוסף הכרום של JoBoss.",
}


SUBSCRIPTIONS_TABLE = os.getenv("SUBSCRIPTIONS_TABLE", "joboss-subscriptions")
subscriptions_table = dynamodb.Table(SUBSCRIPTIONS_TABLE)


def get_effective_plan(user_id, user):
    """Resolve the user's effective plan, preferring an ACTIVE/TRIAL subscription
    over the (often stale) users.plan field."""
    try:
        result = subscriptions_table.get_item(Key={"userId": user_id})
        sub = result.get("Item")
        if sub and sub.get("status", "").upper() in ("ACTIVE", "TRIAL"):
            plan = sub.get("planKey") or sub.get("plan")
            if plan:
                return str(plan).upper()
    except Exception as e:
        print(f"[PLAN_LOOKUP_ERROR] {e}")
    return str((user or {}).get("plan", "FREE")).upper()


def explain_failure(event):
    """Generate (and cache) a human-friendly Hebrew explanation for a failed
    auto-apply. Premium/Premium+ only. Cached on the application item as
    `failExplanation` so Bedrock is called at most once per failure."""
    body = get_body(event)
    user_id = get_user_id(event, body)
    job_id = body.get("jobId")

    if not user_id or not job_id:
        return response(400, {"error": "userId and jobId are required"})

    user = get_user(user_id)
    if not user:
        return response(404, {"error": "User was not found"})

    # Plan gate — only Premium / Premium+. Use the subscription-derived effective
    # plan, since users.plan is often stale (FREE) while the subscription is active.
    if get_effective_plan(user_id, user) == "FREE":
        return response(403, {"error": "Failure explanations are a Premium feature", "code": "NOT_AVAILABLE"})

    try:
        result = applications_table.get_item(Key={"userId": user_id, "jobId": job_id})
        application = result.get("Item")
    except Exception as e:
        print(f"[EXPLAIN_FAILURE_DB_ERROR] {e}")
        application = None

    if not application:
        return response(404, {"error": "Application was not found"})

    # Return cached explanation if present (idempotent — no extra Bedrock call).
    cached = application.get("failExplanation")
    if cached:
        return response(200, {"explanation": cached, "cached": True})

    fail_reason = application.get("failReason") or "unknown failure"

    explanation = dict(FAILURE_FALLBACK)
    try:
        raw = invoke_bedrock_nova(build_failure_prompt(fail_reason))
        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            parsed = json.loads(match.group())
            explanation = {
                "title": parsed.get("title") or FAILURE_FALLBACK["title"],
                "summary": parsed.get("summary") or FAILURE_FALLBACK["summary"],
                "category": parsed.get("category") or "unknown",
                "action": parsed.get("action") or FAILURE_FALLBACK["action"],
            }
    except Exception as e:
        print(f"[EXPLAIN_FAILURE_AI_ERROR] {type(e).__name__}: {e}")

    explanation["generatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    # Cache it on the application item.
    try:
        applications_table.update_item(
            Key={"userId": user_id, "jobId": job_id},
            UpdateExpression="SET failExplanation = :e",
            ExpressionAttributeValues={":e": explanation},
        )
    except Exception as e:
        print(f"[EXPLAIN_FAILURE_CACHE_ERROR] {e}")

    return response(200, {"explanation": explanation, "cached": False})


def _mark_tailoring_failed(user_id, job_id, err):
    """A tailoring crash used to leave the application stuck on
    'pending_tailoring' forever (infinite spinner, no Auto Apply, no refund).
    Mark it failed and quota-exempt so the user's daily credit is returned."""
    if not user_id or not job_id:
        return
    try:
        applications_table.update_item(
            Key={"userId": user_id, "jobId": job_id},
            UpdateExpression="SET autoApplyStatus = :f, failReason = :r, quotaExempt = :q, updatedAt = :t",
            ConditionExpression="autoApplyStatus = :pt",
            ExpressionAttributeValues={
                ":f": "failed",
                ":r": f"tailoring_failed: {str(err)[:200]}",
                ":q": True,
                ":pt": "pending_tailoring",
                ":t": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            },
        )
        print(f"[TAILOR_FAIL_MARKED] userId={user_id} jobId={job_id}")
    except Exception:
        pass  # not a pending_tailoring record — nothing to repair


def _maybe_dispatch_auto_apply(user_id, job_id, tailored_resume_url, job):
    """If this application was held in 'pending_tailoring' state, transition it
    to 'pending' and dispatch to the auto-apply SQS queue with the tailored CV URL.
    Fails silently — tailoring success must not be rolled back by a queue hiccup."""
    try:
        result = applications_table.update_item(
            Key={"userId": user_id, "jobId": job_id},
            UpdateExpression="SET autoApplyStatus = :p, updatedAt = :t",
            ConditionExpression="autoApplyStatus = :pt",
            ExpressionAttributeValues={
                ":p": "pending",
                ":pt": "pending_tailoring",
                ":t": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            },
            ReturnValues="UPDATED_NEW",
        )
        print(f"[AUTO_APPLY_DISPATCH] transitioned pending_tailoring → pending userId={user_id} jobId={job_id}")
    except Exception as e:
        # ConditionalCheckFailed = not a pending_tailoring record (autoApply off, or already dispatched).
        code = getattr(e, "response", {}).get("Error", {}).get("Code", "") if hasattr(e, "response") else type(e).__name__
        if "ConditionalCheckFailed" not in str(code):
            print(f"[AUTO_APPLY_DISPATCH_ERROR] unexpected error userId={user_id} jobId={job_id}: {e}")
        return  # not a pending_tailoring record — nothing to dispatch

    try:
        message = {
            "userId": user_id,
            "jobId": job_id,
            "jobUrl": (job or {}).get("applyUrl", ""),
            "jobTitle": (job or {}).get("title", ""),
            "company": (job or {}).get("company", ""),
            "tailoredResumeUrl": tailored_resume_url,
            "aiTailoring": True,
        }
        kwargs = {"QueueUrl": SQS_QUEUE_URL, "MessageBody": json.dumps(message)}
        if SQS_QUEUE_URL.endswith(".fifo"):
            kwargs["MessageGroupId"] = user_id
        sqs.send_message(**kwargs)
        print(f"[AUTO_APPLY_DISPATCH] queued with tailored CV userId={user_id} jobId={job_id}")
    except Exception as e:
        # Revert status so the user isn't stuck on "pending" with no Fargate task.
        print(f"[AUTO_APPLY_DISPATCH_SQS_ERROR] userId={user_id} jobId={job_id}: {e}")
        try:
            applications_table.update_item(
                Key={"userId": user_id, "jobId": job_id},
                UpdateExpression="SET autoApplyStatus = :f, failReason = :r, quotaExempt = :q, updatedAt = :t",
                ExpressionAttributeValues={
                    ":f": "failed",
                    ":r": f"SQS dispatch error after tailoring: {str(e)[:200]}",
                    ":q": True,
                    ":t": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                },
            )
        except Exception:
            pass


def lambda_handler(event, context):
    path = event.get("path") or event.get("rawPath") or ""

    if event.get("httpMethod") == "OPTIONS":
        return response(200, {"message": "CORS preflight OK"})

    if "analyze-cv" in path:
        return analyze_cv(event)

    if "explain-failure" in path:
        return explain_failure(event)

    direct_text_response = tailor_from_direct_text(event)
    if direct_text_response:
        return direct_text_response

    user_id = None
    job_id = None
    try:
        body = get_body(event)

        user_id = get_user_id(event, body)
        job_id = body.get("jobId")
        resume_id = body.get("resumeId")
        provided_resume_text = (body.get("resumeText") or "").strip()

        if not user_id or not job_id:
            return response(400, {"error": "userId and jobId are required"})

        user = get_user(user_id)
        if not user:
            return response(404, {"error": "User was not found"})

        job = get_job(job_id) or body.get("job")
        if not job:
            return response(404, {"error": "Job was not found"})

        resume = find_resume(user, resume_id) or build_resume_from_text(resume_id, provided_resume_text)
        if not resume:
            return response(404, {"error": "Resume was not found"})

        # ── AI tailoring quota ─────────────────────────────────────────────
        # Use get_effective_plan() so Premium users with a stale users.plan = "FREE"
        # are still correctly gated (same fix as explain_failure).
        AI_MONTHLY_LIMITS = {"FREE": 0, "PREMIUM": 10, "PREMIUM_PLUS": -1}
        user_plan = get_effective_plan(user_id, user)
        ai_limit = AI_MONTHLY_LIMITS.get(user_plan, 0)

        if ai_limit == 0:
            return response(403, {"error": "AI tailoring not available on Free plan", "code": "AI_NOT_AVAILABLE"})

        if ai_limit != -1:
            now_month = datetime.now(timezone.utc).strftime("%Y-%m")
            stored_month = user.get("aiTailoringsMonth", "")
            ai_used = int(user.get("aiTailoringsUsed", 0)) if stored_month == now_month else 0

            if ai_used >= ai_limit:
                return response(429, {
                    "error": "Monthly AI tailoring limit reached",
                    "code": "AI_LIMIT_REACHED",
                    "used": ai_used,
                    "limit": ai_limit,
                    "plan": user_plan,
                })
        # ──────────────────────────────────────────────────────────────────

        pdf_bytes = None if provided_resume_text else read_resume_bytes(resume)
        resume_text = provided_resume_text or read_resume_text(resume)

        force = body.get("force", False)
        if not force:
            relevance = check_job_relevance(user, job, resume_text, pdf_bytes=pdf_bytes)
            if not relevance.get("isRelevant", True):
                return response(200, {
                    "isRelevant": False,
                    "reason": relevance.get("reason") or "המשרה אינה תואמת לפרופיל שלך",
                })

        tailored_text, mode = generate_tailored_resume(user, job, resume_text, pdf_bytes=pdf_bytes)
        saved_resume = save_tailored_resume(user_id, job_id, tailored_text)

        try:
            applications_table.update_item(
                Key={"userId": user_id, "jobId": job_id},
                UpdateExpression="SET tailoredResumeUrl = :url, tailoredResume = :text, tailoredAt = :at",
                ExpressionAttributeValues={
                    ":url": saved_resume["tailoredResumeUrl"],
                    ":text": tailored_text[:5000],
                    ":at": saved_resume["createdAt"],
                },
            )
        except Exception:
            pass

        # If the swipes Lambda deferred the SQS dispatch (pending_tailoring), do it
        # now that we have the tailored CV URL. Update the status first, then send.
        _maybe_dispatch_auto_apply(user_id, job_id, saved_resume["tailoredResumeUrl"], job)

        if ai_limit != -1:
            try:
                now_month = datetime.now(timezone.utc).strftime("%Y-%m")
                users_table.update_item(
                    Key={"userId": user_id},
                    UpdateExpression="SET aiTailoringsUsed = :used, aiTailoringsMonth = :month",
                    ExpressionAttributeValues={
                        ":used": ai_used + 1,
                        ":month": now_month,
                    },
                )
            except Exception:
                pass

        return response(200, {
            "message": "Tailored resume generated",
            "mode": mode,
            "job": job,
            "sourceResume": resume,
            "tailoredResume": tailored_text,
            **saved_resume,
        })

    except json.JSONDecodeError:
        return response(400, {"error": "Invalid JSON body"})

    except ClientError as error:
        _mark_tailoring_failed(user_id, job_id, error)
        return response(500, {
            "error": "AWS service error",
            "details": str(error),
        })

    except Exception as error:
        _mark_tailoring_failed(user_id, job_id, error)
        return response(500, {
            "error": "Internal server error",
            "details": str(error),
        })
