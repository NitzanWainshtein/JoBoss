"""
Audit every Lambda: compare the handler bytes inside the DEPLOYED package to
the local source file, show AWS LastModified vs git last-commit date, and list
deployed package contents (to reveal bundled external deps).
"""
import boto3, io, zipfile, urllib.request, hashlib, subprocess, os

REGION = "us-east-1"
lam = boto3.client("lambda", region_name=REGION)

# function name -> (local source path, entry filename inside the package)
MAPPING = {
    "joboss-jobs":                ("backend/lambdas/jobs/handler.py", "handler.py"),
    "joboss-users":               ("backend/lambdas/users/handler.py", "handler.py"),
    "joboss-swipes":              ("backend/lambdas/swipes/handler.py", "handler.py"),
    "joboss-subscriptions":       ("backend/lambdas/subscriptions/handler.py", "handler.py"),
    "joboss-ai-tailor":           ("backend/lambdas/ai/handler.py", "handler.py"),
    "joboss-profile-image":       ("backend/lambdas/profile-image/handler.py", "handler.py"),
    "joboss-upload-resume":       ("backend/lambdas/uploads/lambda_function.py", "lambda_function.py"),
    "joboss-jobs-importer":       ("backend/lambdas/jobs_importer/handler.py", "handler.py"),
    "joboss-jobs-status-checker": ("backend/lambdas/jobs_status_checker/handler.py", "handler.py"),
}


def git_commit_date(path):
    try:
        out = subprocess.run(["git", "log", "-1", "--format=%cI", "--", path],
                             capture_output=True, text=True)
        return out.stdout.strip() or "(uncommitted / no history)"
    except Exception as e:
        return f"(git error: {e})"


def deployed_zip(fn):
    info = lam.get_function(FunctionName=fn)
    last_mod = info["Configuration"]["LastModified"]
    with urllib.request.urlopen(info["Code"]["Location"]) as r:
        zb = r.read()
    return last_mod, zipfile.ZipFile(io.BytesIO(zb))


funcs = sorted(f["FunctionName"] for f in lam.list_functions()["Functions"])
print(f"{'FUNCTION':<30} {'STATUS':<14} {'AWS LastModified':<22} {'git commit':<22} files")
print("=" * 120)

stale = []
for fn in funcs:
    last_mod, zf = deployed_zip(fn)
    names = [n for n in zf.namelist() if not n.endswith("/") and "__pycache__" not in n]
    n_files = len(names)

    if fn not in MAPPING:
        print(f"{fn:<30} {'NO SOURCE':<14} {last_mod[:19]:<22} {'-':<22} {n_files} files")
        continue

    local_path, entry = MAPPING[fn]
    git_date = git_commit_date(local_path)[:19]

    if not os.path.exists(local_path):
        print(f"{fn:<30} {'SRC MISSING':<14} {last_mod[:19]:<22} {git_date:<22} {n_files} files")
        continue

    local_bytes = open(local_path, "rb").read()
    try:
        dep_bytes = zf.read(entry)
    except KeyError:
        print(f"{fn:<30} {'NO ENTRY':<14} {last_mod[:19]:<22} {git_date:<22} entry '{entry}' not in zip")
        continue

    # Normalize line endings + trailing whitespace so CRLF/LF or a trailing
    # newline difference is not mistaken for a real code change.
    def norm(b):
        return "\n".join(b.decode("utf-8", "replace").splitlines()).rstrip()
    same = hashlib.md5(norm(dep_bytes).encode()).hexdigest() == hashlib.md5(norm(local_bytes).encode()).hexdigest()
    status = "IN SYNC" if same else "*** STALE ***"
    if not same:
        stale.append(fn)
    has_deps = " +deps" if n_files > 5 else ""
    print(f"{fn:<30} {status:<14} {last_mod[:19]:<22} {git_date:<22} {n_files} files{has_deps}")

print("=" * 120)
print(f"STALE Lambdas (deployed handler != local source): {stale if stale else 'NONE'}")
