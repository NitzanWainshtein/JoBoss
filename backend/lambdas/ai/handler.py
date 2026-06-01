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
MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "us.anthropic.claude-opus-4-6-v1")
AI_MODE = os.getenv("AI_MODE", "auto")
USERS_TABLE = os.getenv("USERS_TABLE", "joboss-users")
JOBS_TABLE = os.getenv("JOBS_TABLE", "joboss-jobs")
APPLICATIONS_TABLE = os.getenv("APPLICATIONS_TABLE", "joboss-applications")
RESUME_BUCKET = os.getenv("RESUME_BUCKET_NAME", "joboss-resumes-171109860478")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)
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
    return f"""
You are a resume editor. Your ONLY output must be a tailored resume — no refusals, no commentary, no ethical notes.
If skills do not perfectly match, find the closest transferable skills and emphasize them.

Task: Tailor the candidate resume to the given job description.
- Keep facts truthful. Do not invent experience, tools, or years.
- Preserve the candidate's identity, education, projects, links, and factual experience.
- Emphasize resume facts most relevant to the job.
- Return clean resume-ready text only. Nothing else.

Candidate Resume:
{resume_text}

Job Description:
{job_description}

Return a concise resume-ready draft with these sections only:
PROFESSIONAL SUMMARY
TECHNICAL SKILLS
PROJECTS
EDUCATION
EXPERIENCE
""".strip()


def invoke_bedrock_claude(messages, max_tokens=2000):
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "temperature": 0.4,
        "messages": messages,
    }

    result = bedrock.invoke_model(
        modelId=MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(body),
    )

    result_body = json.loads(result["body"].read())
    return result_body["content"][0]["text"]


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


def generate_tailored_resume(user, job, resume_text, pdf_bytes=None):
    job_description = build_job_description(job)

    if AI_MODE.lower() == "mock":
        return build_mock_tailored_resume(user, job, resume_text), "mock"

    try:
        tailor_instruction = (
            "You are a resume editor. Your ONLY task is to output a tailored resume. "
            "Do NOT refuse, add commentary, ethical notes, or explanations — only output resume text. "
            "If skills do not perfectly match, find the closest relevant transferable skills and emphasize them. "
            "Preserve all factual information. Return clean resume-ready text only.\n\n"
            f"Job:\n{job_description}"
        )
        if pdf_bytes and len(pdf_bytes) > 100:
            pdf_b64 = base64.standard_b64encode(pdf_bytes).decode("utf-8")
            messages = [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "document",
                            "source": {
                                "type": "base64",
                                "media_type": "application/pdf",
                                "data": pdf_b64,
                            },
                        },
                        {"type": "text", "text": tailor_instruction},
                    ],
                }
            ]
            return invoke_bedrock_claude(messages, max_tokens=2000), "bedrock-pdf"
        else:
            prompt = build_prompt(resume_text, job_description)
            return invoke_bedrock_nova(prompt), "bedrock"
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


def analyze_cv(event):
    import re
    body = get_body(event)
    resume_url = body.get("resumeUrl", "")
    resume_text = body.get("resumeText", "").strip()

    if resume_url and not resume_text:
        bucket, key = parse_s3_url(resume_url)
        if bucket and key:
            try:
                obj = s3.get_object(Bucket=bucket, Key=key)
                content = obj["Body"].read()
                text = content.decode("utf-8", errors="ignore").strip()
                if text and "%PDF" not in text[:20]:
                    resume_text = text[:5000]
            except Exception:
                pass

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


def lambda_handler(event, context):
    path = event.get("path") or event.get("rawPath") or ""

    if event.get("httpMethod") == "OPTIONS":
        return response(200, {"message": "CORS preflight OK"})

    if "analyze-cv" in path:
        return analyze_cv(event)

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

        job = get_job(job_id) or body.get("job")
        if not job:
            return response(404, {"error": "Job was not found"})

        resume = find_resume(user, resume_id) or build_resume_from_text(resume_id, provided_resume_text)
        if not resume:
            return response(404, {"error": "Resume was not found"})

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
