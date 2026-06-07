"""
Test check_job_relevance across mismatch/match scenarios.
Run: python backend/scripts/test_relevance.py
"""
import json, boto3, re

REGION = "us-east-1"
MODEL  = "us.anthropic.claude-opus-4-6-v1"
bedrock = boto3.client("bedrock-runtime", region_name=REGION)

# ── Resumes ────────────────────────────────────────────────────────────────
RESUME_CS = """
Aviv Oz | avivoz4@gmail.com | Kfar Sava
Education: Computer Science student, Ariel University (2023-present)
Experience: Shift Supervisor, Teva Pharmaceuticals (2021-present) - security
Projects: TCP Chat Server (Python/sockets), Fitness Studio app (Java OOP), Library System (Java)
Skills: Python, Java, C++, Linux, Git, Data structures, Algorithms, Socket programming, OOP
""".strip()

RESUME_CASHIER = """
Miri Cohen | miri@email.com | Tel Aviv
Education: High school graduate
Experience:
  - Cashier, Rami Levy Supermarket (2019-present) - cash register operation, customer service, handling returns, inventory stocking
  - Cashier, Mega supermarket (2017-2019)
Skills: Customer service, Cash handling, Hebrew/Russian, team work
""".strip()

# ── Jobs ───────────────────────────────────────────────────────────────────
JOBS = [
    {
        "name": "CS student → קופאי/ת בסופר",
        "resume": RESUME_CS,
        "job_title": "קופאי/ת",
        "job_req": "שירות לקוחות, עמידה בתנאים פיזיים, ניסיון בקופה, עברית שוטפת",
        "job_desc": "דרוש/ה קופאי/ת לרשת סופרמרקטים. תנאים: עבודה במשמרות, שירות לקוחות, ספירת קופה. ניסיון קודם יתרון.",
        "expected": "mismatch"
    },
    {
        "name": "קופאי/ת → Software Engineer",
        "resume": RESUME_CASHIER,
        "job_title": "Software Engineer",
        "job_req": "Python, Java, algorithms, data structures, CS degree, OOP, Git",
        "job_desc": "We are looking for a software engineer with strong CS fundamentals. Requirements: Python/Java, algorithms, data structures, 2+ years experience, CS degree.",
        "expected": "mismatch"
    },
    {
        "name": "CS student → Backend Developer (רלוונטי)",
        "resume": RESUME_CS,
        "job_title": "Backend Developer",
        "job_req": "Python, Java, Linux, Git, OOP, data structures, algorithms",
        "job_desc": "Junior backend developer role. Requirements: Python or Java, Linux, Git, OOP principles, data structures and algorithms fundamentals. CS student or graduate welcome.",
        "expected": "relevant"
    },
    {
        "name": "CS student → Mechanical Engineer (הבדיקה המקורית)",
        "resume": RESUME_CS,
        "job_title": "Mechanical Engineer",
        "job_req": "CAD, SolidWorks, mechanical design, FEM analysis, materials science",
        "job_desc": "HP is looking for a Mechanical Engineer. Requirements: B.Sc. in Mechanical Engineering, CAD/SolidWorks experience, thermal design, product development.",
        "expected": "mismatch"
    },
]


def check_relevance(resume_text, job_title, job_req, job_desc, pdf_bytes=None):
    relevance_q = (
        f"Job title: {job_title}\n"
        f"Requirements: {job_req}\n"
        f"Description: {job_desc}\n\n"
        "Is this job reasonably relevant to this candidate's background? "
        "Be lenient — only flag a clear, obvious mismatch (e.g. CS student vs mechanical engineering). "
        'Answer ONLY with valid JSON: {"isRelevant": true/false, "reason": "brief Hebrew explanation if false, empty string if true"}'
    )

    messages = [{"role": "user", "content": [
        {"type": "text", "text": f"Resume:\n{resume_text}\n\n{relevance_q}"}
    ]}]

    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 150,
        "temperature": 0.2,
        "messages": messages,
    }
    result = bedrock.invoke_model(
        modelId=MODEL,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(body),
    )
    raw = json.loads(result["body"].read())["content"][0]["text"]
    match = re.search(r'\{[\s\S]*?\}', raw)
    if match:
        return json.loads(match.group()), raw
    return {"isRelevant": True, "reason": ""}, raw


print(f"\n{'='*65}")
print("  RELEVANCE CHECK TESTS")
print(f"{'='*65}\n")

all_pass = True
for t in JOBS:
    print(f"TEST: {t['name']}")
    print(f"  Expected: {t['expected']}")
    result, raw = check_relevance(t["resume"], t["job_title"], t["job_req"], t["job_desc"])
    is_relevant = result.get("isRelevant", True)
    reason = result.get("reason", "")

    detected = "relevant" if is_relevant else "mismatch"
    correct = detected == t["expected"]
    all_pass = all_pass and correct

    status = "PASS" if correct else "FAIL"
    print(f"  Result:   {detected}  [{status}]")
    if reason:
        print(f"  Reason:   {reason}")
    else:
        print(f"  Reason:   (none — relevant)")
    print(f"  Raw:      {raw[:120]}")
    print()

print(f"{'='*65}")
print(f"  Overall: {'ALL PASS' if all_pass else 'SOME FAILED'}")
print(f"{'='*65}\n")
