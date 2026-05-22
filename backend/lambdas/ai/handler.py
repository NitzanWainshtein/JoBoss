import base64
import json
import os
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

import boto3
from botocore.exceptions import ClientError


REGION = os.getenv("AWS_REGION", "us-east-1")
MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "amazon.nova-micro-v1:0")
AI_MODE = os.getenv("AI_MODE", "auto")
USERS_TABLE = os.getenv("USERS_TABLE", "joboss-users")
JOBS_TABLE = os.getenv("JOBS_TABLE", "joboss-jobs")
RESUME_BUCKET = os.getenv("RESUME_BUCKET_NAME", "joboss-resumes-171109860478")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)
bedrock = boto3.client("bedrock-runtime", region_name=REGION)

users_table = dynamodb.Table(USERS_TABLE)
jobs_table = dynamodb.Table(JOBS_TABLE)


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

    user_id = get_user_id_from_authorization_header(event)
    if user_id:
        return user_id

    return body.get("userId")


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
    return f"""
You are an expert resume editor.

Task:
Tailor the candidate resume to the given job description.
- Keep facts truthful. Do not invent experience, tools, or years.
- Emphasize relevant skills and achievements.
- Use concise ATS-friendly bullet points.
- Return plain text only.

Candidate Resume:
{resume_text}

Job Description:
{job_description}

Return:
A tailored resume version with a short summary, experience bullets, and skills.
""".strip()


def invoke_bedrock_nova(prompt):
    body = {
        "messages": [
            {
                "role": "user",
                "content": [{"text": prompt}],
            }
        ],
        "inferenceConfig": {
            "maxTokens": 900,
            "temperature": 0.4,
            "topP": 0.9,
        },
    }

    result = bedrock.invoke_model(
        modelId=MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(body),
    )

    result_body = json.loads(result["body"].read())
    return result_body["output"]["message"]["content"][0]["text"]


def build_mock_tailored_resume(user, job, resume_text):
    title = job.get("title", "the role")
    company = job.get("company", "the company")
    desired_role = user.get("desiredRole") or title
    experience = user.get("experienceLevel") or "relevant"
    requirements = job.get("requirements") or job.get("technologies") or []
    skills = ", ".join(requirements[:6]) if isinstance(requirements, list) else str(requirements)
    skills = skills or "Python, React, AWS, problem solving"
    resume_summary = summarize_resume_text(resume_text)

    return f"""
Tailored Resume - {title} at {company}

Professional Summary
Candidate targeting {desired_role} roles with {experience} experience. This version emphasizes the candidate's real resume experience and aligns it with {company}'s {title} position.

Selected Resume Evidence
{resume_summary}

Tailored Experience Highlights
- Reframed the candidate's existing experience around the job requirements: {skills}.
- Highlighted relevant software, cloud, backend, frontend, and delivery experience where it appears in the resume.
- Kept the wording truthful and based on the uploaded resume content.

Fit For This Role
- Job target: {title} at {company}.
- Key matched requirements: {skills}.
- ATS-friendly wording focused on the overlap between the resume and job description.

Skills
{skills}
""".strip()


def summarize_resume_text(resume_text):
    clean_lines = [
        line.strip()
        for line in resume_text.replace("\r", "\n").split("\n")
        if line.strip()
    ]

    if not clean_lines:
        return "- Resume text could not be extracted, so this version uses profile and job details."

    selected = clean_lines[:8]
    return "\n".join(f"- {line[:180]}" for line in selected)


def generate_tailored_resume(user, job, resume_text):
    job_description = build_job_description(job)
    prompt = build_prompt(resume_text, job_description)

    if AI_MODE.lower() == "mock":
        return build_mock_tailored_resume(user, job, resume_text), "mock"

    try:
        return invoke_bedrock_nova(prompt), "bedrock"
    except Exception:
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


def escape_pdf_text(text):
    return (
        text.replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
    )


def wrap_text(text, max_chars=86):
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


def build_simple_pdf(text):
    lines = wrap_text(text)
    content_lines = ["BT", "/F1 11 Tf", "50 790 Td", "14 TL"]

    for index, line in enumerate(lines[:52]):
        if index > 0:
            content_lines.append("T*")
        content_lines.append(f"({escape_pdf_text(line)}) Tj")

    content_lines.append("ET")
    content = "\n".join(content_lines).encode("latin-1", errors="replace")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(content)).encode("ascii") + b" >>\nstream\n" + content + b"\nendstream",
    ]

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = []

    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode("ascii"))
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")

    xref_start = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    pdf.extend(b"0000000000 65535 f \n")

    for offset in offsets:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))

    pdf.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF".encode("ascii")
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


def lambda_handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return response(200, {"message": "CORS preflight OK"})

    direct_text_response = tailor_from_direct_text(event)
    if direct_text_response:
        return direct_text_response

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

        job = get_job(job_id)
        if not job:
            return response(404, {"error": "Job was not found"})

        resume = find_resume(user, resume_id)
        if not resume:
            return response(404, {"error": "Resume was not found"})

        resume_text = provided_resume_text or read_resume_text(resume)
        tailored_text, mode = generate_tailored_resume(user, job, resume_text)
        saved_resume = save_tailored_resume(user_id, job_id, tailored_text)

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
        return response(500, {
            "error": "AWS service error",
            "details": str(error),
        })

    except Exception as error:
        return response(500, {
            "error": "Internal server error",
            "details": str(error),
        })
