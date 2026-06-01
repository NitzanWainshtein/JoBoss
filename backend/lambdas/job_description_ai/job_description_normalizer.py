"""
Job description normalization helpers.

This module turns raw company job page text into a concise, consistent
candidate-facing description using Bedrock. It removes page boilerplate and
keeps only information that is relevant to the specific job.
"""

import json
import re


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

Return ONLY a valid JSON object with this exact structure:
{{
  "shortDescription": "1 to 2 concise sentences, about 35 to 55 words, written for a swipe card. It should summarize the role, company/team, and main work without bullets.",
  "description": "Summary\\nWrite about 4 concise lines explaining the role, domain/team, and main work.\\n\\nResponsibilities\\n- 3 to 6 bullets\\n\\nRequirements\\n- 3 to 7 bullets\\n\\nNice to have\\n- 0 to 4 bullets, only if clearly present\\n\\nTechnologies\\nComma-separated list of technologies, tools, methods, or domains clearly mentioned."
}}

Raw job page text:
{raw_description[:7000]}
""".strip()


def is_valid_normalized_description(text: str) -> bool:
    return (text or "").strip().lower().startswith("summary")

def extract_json_object(text: str):
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{[\s\S]*\}", text or "")
    if not match:
        return None

    try:
        return json.loads(match.group())
    except json.JSONDecodeError:
        return None


def build_short_description_from_full_description(description: str) -> str:
    summary = ""
    current_section = None

    for line in (description or "").splitlines():
        stripped = line.strip()
        if not stripped:
            continue

        lowered = stripped.lower()
        if lowered in {"summary", "responsibilities", "requirements", "nice to have", "technologies"}:
            current_section = lowered
            continue

        if current_section == "summary":
            summary = f"{summary} {stripped}".strip()

    if not summary:
        summary = " ".join((description or "").split())

    return summary[:700]


def build_metadata_fallback_short_description(title, company, location):
    title = title or "this role"
    company = company or "the company"
    location_text = f" in {location}" if location else ""

    return (
        f"{company} is hiring for {title}{location_text}. "
        "The full role details were not available during import, so candidates should review the original apply page."
    )


def build_metadata_fallback_description(title, company, location):
    title = title or "this role"
    company = company or "the company"
    location_text = f" in {location}" if location else ""

    return f"""
Summary
{company} is hiring for {title}{location_text}. The source page did not expose a complete structured job description during import, so candidates should review the original apply page for the full role details.

Responsibilities
- Review the original apply page for role-specific responsibilities.

Requirements
- Review the original apply page for role-specific requirements.

Technologies
Not specified in the imported source text.
""".strip()

def build_metadata_fallback_result(title, company, location):
    return {
        "shortDescription": build_metadata_fallback_short_description(title, company, location),
        "description": build_metadata_fallback_description(title, company, location),
    }

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
        raw_normalized_response = invoke_bedrock(prompt).strip()
        parsed_response = extract_json_object(raw_normalized_response)

        if not parsed_response:
            parsed_response = {
                "description": raw_normalized_response,
            }

        normalized_description = (parsed_response.get("description") or "").strip()
        short_description = (parsed_response.get("shortDescription") or "").strip()

        if not is_valid_normalized_description(normalized_description):
            fallback_result = build_metadata_fallback_result(title, company, location)
            normalized_description = fallback_result["description"]
            short_description = fallback_result["shortDescription"]

        if not short_description:
            short_description = build_short_description_from_full_description(normalized_description)

        return response(200, {
            "message": "Job description normalized",
            "description": normalized_description[:5000],
            "shortDescription": short_description[:700],
            "mode": "bedrock",
        })

    except Exception as e:
        print(f"[NORMALIZE_JOB_DESCRIPTION_ERROR] {type(e).__name__}: {e}")

        fallback_result = build_metadata_fallback_result(title, company, location)

        return response(200, {
            "message": "Job description normalization fallback",
            "description": fallback_result["description"],
            "shortDescription": fallback_result["shortDescription"],
            "mode": "fallback",
        })