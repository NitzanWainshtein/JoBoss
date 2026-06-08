"""
Direct Bedrock test for CV tailoring quality.
Tests: Opus 4.6 + SKILL prompt vs old Haiku prompt
Run: python backend/scripts/test_cv_tailor.py
"""
import json, boto3, sys, textwrap

REGION = "us-east-1"
MODEL_OPUS   = "us.anthropic.claude-opus-4-6-v1"
MODEL_HAIKU  = "us.anthropic.claude-haiku-4-5-20251001-v1:0"

bedrock = boto3.client("bedrock-runtime", region_name=REGION)

# ── Sample resume (CS student, similar to Aviv's profile) ──────────────────
SAMPLE_RESUME = """
Aviv Oz
+972-54-762-7020 · avivoz4@gmail.com · Kfar Sava, Israel

EDUCATION
Ariel University
Bachelor's Degree in Computer Science
2023 – Present
- Second-year student
- Relevant coursework: Data Structures, Object-Oriented Programming, Algorithms, Operating Systems

PROFESSIONAL EXPERIENCE
Shift Supervisor – Security Department
Teva Pharmaceutical Industries
2021 – Present
- Led daily shift operations and supervised 4 security staff members
- Maintained safety compliance and reported security incidents
- Trusted with access to sensitive areas and incident documentation
- Developed crisis response, leadership, and communication skills

PROJECTS
TCP Chat Server (Python)
- Developed a full-featured TCP chat server using socket programming and threading in Python
- Implemented user registration, private messaging, broadcast, and session control using CLI interface
- Demonstrated deep understanding of network protocols and system architecture
- Link: github.com/AvivOz/Final_Project_Networks

Fitness Studio Management System (Java)
- Developed an object-oriented fitness studio simulator using Java with modular class structure
- Managed members, classes, and trainers using file-based configuration and complex business logic
- Demonstrated OOP principles including inheritance, encapsulation, and interface implementation
- Link: github.com/AvivOz/Fitness-studio

Library Management System (Java)
- Developed a modular library system in Java with advanced OOP principles
- Implemented check-in/out functionality with polymorphism and inheritance
- Link: github.com/AvivOz/Library-Management-System-OOP_EX3

SKILLS
Programming Languages: Python, Java, C, C++
Tools & Platforms: Git, GitHub, Linux, IntelliJ, CLion, PyCharm, Visual Studio
Technical Expertise: Socket programming, OOP, Data structures, Algorithms, Operating systems concepts, CLI development
Networking & Analysis: Wireshark
Operating Systems: Linux, Windows
Soft Skills: Quick learner, responsible, team player, problem-solving, critical thinking
Languages: Hebrew (native), English (high level)
""".strip()

# ── Two test jobs ──────────────────────────────────────────────────────────
JOB_BACKEND = {
    "name": "Backend Developer — CrowdStrike",
    "description": """
Title: Sr. Software Engineer - Application Analysis (Hybrid, ISR)
Company: CrowdStrike
Requirements: Python, C++, Linux, Network security, System architecture, OOP, Git, Threading, Distributed systems
Description: Join our Application Analysis team to build high-performance security software.
You will develop backend services in Python and C++, work with network protocols,
and contribute to systems that analyze threats at scale. Strong fundamentals in
data structures, algorithms, and Linux systems required. Security domain knowledge a plus.
"""
}

JOB_DEVOPS = {
    "name": "DevOps Engineer — Startup",
    "description": """
Title: Junior DevOps Engineer
Company: CloudNative Ltd
Requirements: Linux, Python, Bash, Docker, Kubernetes, CI/CD, AWS, Git, Monitoring
Description: Help us build and maintain cloud infrastructure. You will write automation scripts,
manage containerized deployments, and support our development pipeline. Linux proficiency
and Python scripting are essential. Experience with AWS services is a strong plus.
"""
}


def build_new_prompt(resume_text, job_description):
    """Exact copy of the SKILL-based prompt from handler.py."""
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
[2-3 sentences positioning the candidate for THIS specific role using only their actual background.]

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


def build_old_prompt(resume_text, job_description):
    """Old Haiku-era prompt for comparison."""
    return f"""You are a resume editor. Your ONLY output must be a tailored resume.
Tailor the candidate resume to the given job description.
Keep facts truthful. Return clean resume-ready text only.

Candidate Resume:
{resume_text}

Job Description:
{job_description}

Return: PROFESSIONAL SUMMARY / TECHNICAL SKILLS / PROJECTS / EDUCATION / EXPERIENCE"""


def call_bedrock(model_id, prompt, max_tokens=2500):
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "temperature": 0.4,
        "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
    }
    result = bedrock.invoke_model(
        modelId=model_id,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(body),
    )
    data = json.loads(result["body"].read())
    return data["content"][0]["text"], data.get("usage", {})


def score_output(output, job_desc, original_resume):
    """Heuristic quality checks."""
    checks = {}

    # 1. No fabrication markers
    fabricated_terms = ["10 years", "5 years", "senior engineer", "team lead", "led a team of",
                        "managed developers", "architected", "CTO", "founded"]
    checks["no_fabrication"] = not any(t.lower() in output.lower() for t in fabricated_terms)

    # 2. Structured sections present
    checks["has_summary"]    = "PROFESSIONAL SUMMARY" in output.upper() or "## PROFESSIONAL" in output
    checks["has_skills"]     = "TECHNICAL SKILLS" in output.upper() or "## TECHNICAL" in output
    checks["has_projects"]   = "PROJECTS" in output.upper()
    checks["has_education"]  = "EDUCATION" in output.upper()

    # 3. Contact info preserved
    checks["has_contact"]    = "aviv" in output.lower() or "avivoz" in output.lower()

    # 4. Job keywords present in output
    job_keywords = [w.strip().lower() for w in job_desc.replace(",", " ").split() if len(w) > 4]
    keyword_hits = sum(1 for kw in job_keywords if kw in output.lower())
    checks["keyword_alignment"] = keyword_hits >= 5

    # 5. No refusal/ethical notes
    refusal_markers = ["cannot ethically", "I cannot", "I'm unable", "misrepresent", "dishonest"]
    checks["no_refusal"] = not any(m.lower() in output.lower() for m in refusal_markers)

    # 6. Length reasonable (not too short)
    checks["adequate_length"] = len(output) > 800

    score = sum(checks.values())
    return score, checks


def divider(title):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print('='*70)


def run_test(job, model_id, prompt_fn, label):
    print(f"\n[{label}] {job['name']}")
    print(f"  Model: {model_id}")
    prompt = prompt_fn(SAMPLE_RESUME, job["description"])
    try:
        output, usage = call_bedrock(model_id, prompt)
        score, checks = score_output(output, job["description"], SAMPLE_RESUME)

        print(f"  Tokens used: in={usage.get('input_tokens','?')} out={usage.get('output_tokens','?')}")
        print(f"  Quality score: {score}/{len(checks)}")
        for k, v in checks.items():
            icon = "OK" if v else "FAIL"
            print(f"    [{icon}] {k}")
        print(f"\n  --- FULL OUTPUT ---")
        print(textwrap.indent(output, "  "))
        print(f"\n  [{len(output)} chars total]")
        return output, score
    except Exception as e:
        print(f"  ERROR: {e}")
        return None, 0


if __name__ == "__main__":
    results = {}

    divider("TEST 1: Backend job — Opus + SKILL prompt")
    out1, s1 = run_test(JOB_BACKEND, MODEL_OPUS, build_new_prompt, "OPUS+SKILL")
    results["opus_backend"] = s1

    divider("TEST 2: DevOps job — Opus + SKILL prompt")
    out2, s2 = run_test(JOB_DEVOPS, MODEL_OPUS, build_new_prompt, "OPUS+SKILL")
    results["opus_devops"] = s2

    divider("TEST 3: Backend job — Haiku + SKILL prompt  [production model]")
    out3, s3 = run_test(JOB_BACKEND, MODEL_HAIKU, build_new_prompt, "HAIKU+SKILL")
    results["haiku_skill_backend"] = s3

    divider("TEST 4: DevOps job — Haiku + SKILL prompt  [production model]")
    out4, s4 = run_test(JOB_DEVOPS, MODEL_HAIKU, build_new_prompt, "HAIKU+SKILL")
    results["haiku_skill_devops"] = s4

    divider("TEST 5: Backend job — Haiku + OLD prompt (original baseline)")
    out5, s5 = run_test(JOB_BACKEND, MODEL_HAIKU, build_old_prompt, "HAIKU+OLD")
    results["haiku_old_backend"] = s5

    divider("SUMMARY")
    print()
    max_score = 9
    print("  Model / Prompt          Backend      DevOps")
    print("  " + "-"*44)
    print(f"  Opus  + SKILL           {results['opus_backend']}/{max_score}          {results['opus_devops']}/{max_score}")
    print(f"  Haiku + SKILL (prod)    {results['haiku_skill_backend']}/{max_score}          {results['haiku_skill_devops']}/{max_score}")
    print(f"  Haiku + OLD  (baseline) {results['haiku_old_backend']}/{max_score}")
    print()

    opus_avg  = (results["opus_backend"]  + results["opus_devops"])  / 2
    haiku_avg = (results["haiku_skill_backend"] + results["haiku_skill_devops"]) / 2
    drop = opus_avg - haiku_avg

    print(f"  Opus  avg: {opus_avg:.1f}/9")
    print(f"  Haiku avg: {haiku_avg:.1f}/9")
    print(f"  Quality drop (Opus -> Haiku+SKILL): {drop:.1f} points")
    print()
    if drop <= 0.5:
        print("  VERDICT: Haiku+SKILL is on par with Opus — switch is safe.")
    elif drop <= 1.5:
        print("  VERDICT: Minor quality drop — acceptable trade-off for cost savings.")
    else:
        print("  VERDICT: Significant quality drop — consider keeping Opus or tuning the prompt.")
    print()
