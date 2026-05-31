"""
Job description normalization helpers.

This module turns raw company job page text into a concise, consistent
candidate-facing description using Bedrock. It removes page boilerplate and
keeps only information that is relevant to the specific job.
"""


def build_normalize_job_description_prompt(title, company, location, raw_description):
    return f"""
You are a job description editor for a job-matching app.

Task:
Rewrite the raw job page text into a clean, consistent job description for candidates.

Rules:
- Use only information that appears in the raw text.
- Do not invent requirements, technologies, benefits, salary, seniority, or responsibilities.
- Remove irrelevant content such as navigation menus, footer text, cookie notices, privacy text, equal opportunity boilerplate, generic company marketing, and unrelated jobs.
- Keep the language English.
- Be concise but useful.
- If a section has no reliable information, omit that section.
- Do not include markdown fences.
- Return plain text only.
- Never return a refusal, apology, or explanation that you cannot complete the task.
- If the raw text contains any role-specific details, extract and structure them even if the page also says applications are closed or no longer accepted.

Job metadata:
Title: {title}
Company: {company}
Location: {location}

Required output format:

Summary
Write about 4 concise lines explaining the role, domain/team, and main work.

Responsibilities
- 3 to 6 bullets

Requirements
- 3 to 7 bullets

Nice to have
- 0 to 4 bullets, only if clearly present

Technologies
Comma-separated list of technologies, tools, methods, or domains clearly mentioned.

Raw job page text:
{raw_description[:7000]}
""".strip()


def normalize_job_description(body, invoke_bedrock, response):
    title = (body.get("title") or "").strip()
    company = (body.get("company") or "").strip()
    location = (body.get("location") or "").strip()
    raw_description = (body.get("rawDescription") or body.get("raw_description") or "").strip()

    if not raw_description:
        return response(400, {"error": "rawDescription is required"})

    prompt = build_normalize_job_description_prompt(
        title,
        company,
        location,
        raw_description,
    )

    try:
        normalized_description = invoke_bedrock(prompt).strip()

        return response(200, {
            "message": "Job description normalized",
            "description": normalized_description[:5000],
            "mode": "bedrock",
        })

    except Exception as e:
        print(f"[NORMALIZE_JOB_DESCRIPTION_ERROR] {type(e).__name__}: {e}")

        return response(200, {
            "message": "Job description normalization fallback",
            "description": raw_description[:5000],
            "mode": "fallback",
        })