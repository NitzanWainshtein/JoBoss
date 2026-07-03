"""
deploy_all.py — master deployer for every JoBoss Lambda.

RUN THIS FIRST, before any testing session, so AWS is guaranteed to be running
the latest local source.  (We have repeatedly lost hours to "fixed locally but
never deployed" — this script ends that.)

    python infrastructure/deploy/deploy_all.py            # deploy everything
    python infrastructure/deploy/deploy_all.py jobs users # deploy only matching names

Per-Lambda build modes:
  single  – zip just the entry file (stdlib/boto3-only handlers)
  dir     – zip all *.py in the source dir (multi-module, no pip deps)
  bundle  – zip the dir's *.py + a vendored deps folder (e.g. stripe_pkg)
  manual  – skipped automatically; needs platform wheels built separately

SAFETY: for `single`/`dir` modes the script first inspects the currently
deployed package.  If it contains more files than we are about to upload
(i.e. bundled dependencies), it REFUSES to deploy that function rather than
wipe the dependencies.  This makes the script safe to run blindly.
"""
import io, sys, time, zipfile, urllib.request, hashlib
from pathlib import Path
import boto3

REGION = "us-east-1"
ROOT = Path(__file__).resolve().parents[2]
lam = boto3.client("lambda", region_name=REGION)

LAMBDAS = [
    {"fn": "joboss-jobs",                "dir": "backend/lambdas/jobs",               "mode": "single", "entry": "handler.py"},
    {"fn": "joboss-users",               "dir": "backend/lambdas/users",              "mode": "single", "entry": "handler.py"},
    {"fn": "joboss-swipes",              "dir": "backend/lambdas/swipes",             "mode": "single", "entry": "handler.py"},
    {"fn": "joboss-profile-image",       "dir": "backend/lambdas/profile-image",      "mode": "single", "entry": "handler.py"},
    {"fn": "joboss-ai-tailor",           "dir": "backend/lambdas/ai",                 "mode": "single", "entry": "handler.py"},
    {"fn": "joboss-upload-resume",       "dir": "backend/lambdas/uploads",            "mode": "single", "entry": "lambda_function.py"},
    {"fn": "joboss-jobs-status-checker", "dir": "backend/lambdas/jobs_status_checker","mode": "dir",    "entry": "handler.py"},
    {"fn": "joboss-subscriptions",       "dir": "backend/lambdas/subscriptions",      "mode": "bundle", "entry": "handler.py",
     "deps": ".tmp_lambda/stripe_pkg"},  # local artifact: pip install stripe -t .tmp_lambda/stripe_pkg
    {"fn": "joboss-auto-apply",           "dir": "backend/lambdas/auto-apply",         "mode": "single", "entry": "handler.py"},
    {"fn": "joboss-jobs-importer",        "dir": "backend/lambdas/jobs_importer",      "mode": "manual", "entry": "handler.py",
     "reason": "bundles telethon (Linux wheels) — build & deploy via its own packaged zip"},
]


def build_zip(entry_cfg):
    """Return (zip_bytes, set_of_arcnames, local_entry_bytes)."""
    src_dir = ROOT / entry_cfg["dir"]
    entry = entry_cfg["entry"]
    buf = io.BytesIO()
    arcnames = set()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        if entry_cfg["mode"] == "single":
            z.write(src_dir / entry, entry)
            arcnames.add(entry)
        elif entry_cfg["mode"] == "dir":
            for p in sorted(src_dir.glob("*.py")):
                z.write(p, p.name)
                arcnames.add(p.name)
        elif entry_cfg["mode"] == "bundle":
            for p in sorted(src_dir.glob("*.py")):
                z.write(p, p.name)
                arcnames.add(p.name)
            deps = ROOT / entry_cfg["deps"]
            for p in deps.rglob("*"):
                if p.is_file():
                    arc = str(p.relative_to(deps)).replace("\\", "/")
                    z.write(p, arc)
                    arcnames.add(arc)
    local_entry_bytes = (src_dir / entry).read_bytes()
    return buf.getvalue(), arcnames, local_entry_bytes


def deployed_filelist(fn):
    info = lam.get_function(FunctionName=fn)
    with urllib.request.urlopen(info["Code"]["Location"]) as r:
        zb = r.read()
    with zipfile.ZipFile(io.BytesIO(zb)) as z:
        files = [n for n in z.namelist() if not n.endswith("/") and "__pycache__" not in n]
    return files


def wait_active(fn):
    for _ in range(40):
        cfg = lam.get_function_configuration(FunctionName=fn)
        if cfg.get("LastUpdateStatus") != "InProgress" and cfg.get("State") != "Pending":
            return
        time.sleep(2)


def verify(fn, entry, local_bytes):
    info = lam.get_function(FunctionName=fn)
    with urllib.request.urlopen(info["Code"]["Location"]) as r:
        zb = r.read()
    with zipfile.ZipFile(io.BytesIO(zb)) as z:
        dep = z.read(entry)
    return hashlib.md5(dep).hexdigest() == hashlib.md5(local_bytes).hexdigest()


def deploy_one(cfg):
    fn, mode, entry = cfg["fn"], cfg["mode"], cfg["entry"]
    if mode == "manual":
        return "SKIPPED", cfg.get("reason", "manual deploy required")

    zip_bytes, arcnames, local_bytes = build_zip(cfg)

    # Safety guard: don't wipe bundled deps with a code-only/dir deploy.
    if mode in ("single", "dir"):
        deployed = deployed_filelist(fn)
        if len(deployed) > len(arcnames):
            return "REFUSED", (f"deployed package has {len(deployed)} files but we would "
                               f"upload only {len(arcnames)} — looks like bundled deps; "
                               f"refusing to wipe. Use a bundle/dedicated deploy.")

    lam.update_function_code(FunctionName=fn, ZipFile=zip_bytes, Publish=True)
    wait_active(fn)
    ok = verify(fn, entry, local_bytes)
    return ("OK" if ok else "VERIFY-FAIL"), f"{len(arcnames)} file(s)"


def main():
    targets = sys.argv[1:]
    selected = [c for c in LAMBDAS if not targets or any(t in c["fn"] for t in targets)]

    print(f"Deploying {len(selected)} Lambda(s) to {REGION}\n" + "=" * 70)
    results = []
    for cfg in selected:
        try:
            status, detail = deploy_one(cfg)
        except Exception as e:
            status, detail = "ERROR", str(e)
        results.append((cfg["fn"], status, detail))
        print(f"  {cfg['fn']:<30} {status:<12} {detail}")

    print("=" * 70)
    bad = [r for r in results if r[1] not in ("OK", "SKIPPED")]
    print("Summary:", "ALL OK ✓" if not bad else f"{len(bad)} need attention ✗")
    for fn, status, detail in results:
        if status not in ("OK",):
            print(f"  - {fn}: {status} — {detail}")


if __name__ == "__main__":
    main()
