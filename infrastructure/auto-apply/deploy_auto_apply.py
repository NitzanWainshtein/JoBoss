"""
Deploy Step 2 + 3: update joboss-swipes (with SQS env var) and create/update
the joboss-auto-apply Lambda with an SQS event source mapping.
"""
import io, json, time, zipfile, urllib.request
from pathlib import Path
import boto3

REGION       = "us-east-1"
ACCOUNT      = "171109860478"
ROLE_ARN     = f"arn:aws:iam::{ACCOUNT}:role/JoBossLambdaRole"
QUEUE_URL    = f"https://sqs.{REGION}.amazonaws.com/{ACCOUNT}/joboss-auto-apply-queue"
QUEUE_ARN    = f"arn:aws:sqs:{REGION}:{ACCOUNT}:joboss-auto-apply-queue"
ROOT         = Path(__file__).resolve().parents[2]  # infrastructure/auto-apply/ -> repo root

lam = boto3.client("lambda", region_name=REGION)


def zip_file(src_path, arcname):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(src_path, arcname)
    return buf.getvalue()


def wait_active(fn):
    for _ in range(40):
        cfg = lam.get_function_configuration(FunctionName=fn)
        if cfg.get("LastUpdateStatus") != "InProgress" and cfg.get("State") != "Pending":
            return
        print(f"  waiting for {fn}…")
        time.sleep(2)


def verify(fn, entry, local_path):
    info = lam.get_function(FunctionName=fn)
    with urllib.request.urlopen(info["Code"]["Location"]) as r:
        zb = r.read()
    with zipfile.ZipFile(io.BytesIO(zb)) as z:
        dep = z.read(entry)
    local = open(local_path, "rb").read()
    # normalise line endings for comparison
    norm = lambda b: b.decode("utf-8", "replace").replace("\r\n", "\n").rstrip()
    return norm(dep) == norm(local)


# ── Step 2: update joboss-swipes + add SQS env var ───────────────────────────
print("=" * 60)
print("Updating joboss-swipes…")
swipes_src = ROOT / "backend/lambdas/swipes/handler.py"
zb = zip_file(swipes_src, "handler.py")
lam.update_function_code(FunctionName="joboss-swipes", ZipFile=zb, Publish=True)
wait_active("joboss-swipes")

# Merge SQS_QUEUE_URL into existing env vars
cfg = lam.get_function_configuration(FunctionName="joboss-swipes")
env = cfg.get("Environment", {}).get("Variables", {})
env["SQS_QUEUE_URL"] = QUEUE_URL
env["USERS_TABLE"]   = "joboss-users"
lam.update_function_configuration(
    FunctionName="joboss-swipes",
    Environment={"Variables": env},
)
wait_active("joboss-swipes")
ok = verify("joboss-swipes", "handler.py", swipes_src)
print(f"  joboss-swipes deployed, verified={ok}, env.SQS_QUEUE_URL set ✓")

# ── Step 3: create or update joboss-auto-apply ────────────────────────────────
print()
print("=" * 60)
print("Deploying joboss-auto-apply…")
aa_src = ROOT / "backend/lambdas/auto-apply/handler.py"
aa_zb  = zip_file(aa_src, "handler.py")

try:
    lam.get_function(FunctionName="joboss-auto-apply")
    exists = True
except lam.exceptions.ResourceNotFoundException:
    exists = False

ENV_VARS = {
    "APPLICATIONS_TABLE":  "joboss-applications",
    "ECS_CLUSTER":         "joboss-cluster",
    "TASK_DEFINITION":     "joboss-auto-apply-task",
    "SUBNET_IDS":          "subnet-0a10d63e8b9de6c69,subnet-035a97eeb27dc6634",
    "SECURITY_GROUP_IDS":  "sg-085aae94a31a97725",
}

if exists:
    lam.update_function_code(FunctionName="joboss-auto-apply", ZipFile=aa_zb, Publish=True)
    wait_active("joboss-auto-apply")
    lam.update_function_configuration(
        FunctionName="joboss-auto-apply",
        Handler="handler.handler",
        Runtime="python3.12",
        Timeout=300,
        MemorySize=256,
        Environment={"Variables": ENV_VARS},
    )
else:
    lam.create_function(
        FunctionName="joboss-auto-apply",
        Runtime="python3.12",
        Role=ROLE_ARN,
        Handler="handler.handler",
        Code={"ZipFile": aa_zb},
        Description="Auto Apply — SQS-triggered → ECS Fargate Playwright (Phase 2)",
        Timeout=300,
        MemorySize=256,
        Publish=True,
        Environment={"Variables": ENV_VARS},
    )
wait_active("joboss-auto-apply")
print(f"  joboss-auto-apply {'updated' if exists else 'created'} ✓")

# ── SQS event source mapping ──────────────────────────────────────────────────
print()
print("Wiring SQS trigger to joboss-auto-apply…")
mappings = lam.list_event_source_mappings(
    FunctionName="joboss-auto-apply",
    EventSourceArn=QUEUE_ARN,
)["EventSourceMappings"]

if mappings:
    print(f"  Trigger already exists (UUID={mappings[0]['UUID']}), skipping create")
else:
    resp = lam.create_event_source_mapping(
        FunctionName="joboss-auto-apply",
        EventSourceArn=QUEUE_ARN,
        BatchSize=1,          # process one message at a time in Phase 1
        Enabled=True,
        FunctionResponseTypes=["ReportBatchItemFailures"],
    )
    print(f"  SQS trigger created: UUID={resp['UUID']}")

print()
print("=" * 60)
print("All done.")
print(f"  QUEUE_URL  = {QUEUE_URL}")
print(f"  QUEUE_ARN  = {QUEUE_ARN}")
