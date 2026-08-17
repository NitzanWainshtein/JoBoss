"""Guards that the closure-text markers stay identical between Tier 1 (Lambda,
HTTP-only) and Tier 2 (Fargate, real browser).

Both files independently define INACTIVE_TEXT_MARKERS — a Lambda zip and a Docker
image cannot share a Python module without shared-layer infrastructure this
project does not have yet. If the two lists drift, the two tiers disagree about
whether the same page text means a job closed, and which tier happened to run
last decides the outcome.

Tier 2's file cannot be imported directly in tests at all: it needs playwright, a
Docker-only dependency never installed in this dev/CI environment (same reason
jobs_importer's telethon is never installed here — see
backend/lambdas/jobs_importer/requirements.txt). This reads both files as source
text and extracts the list via the AST, so it never executes or imports either
module.

Run:  pytest backend/tests
"""
import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TIER1_FILE = ROOT / "lambdas" / "jobs_status_checker" / "job_status_detector.py"
TIER2_FILE = ROOT / "fargate" / "job-status-checker" / "check_jobs.py"


def extract_list_literal(path, var_name):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id == var_name for t in node.targets
        ):
            return ast.literal_eval(node.value)
    raise AssertionError(f"{var_name} not found in {path}")


def test_both_files_exist():
    assert TIER1_FILE.is_file(), TIER1_FILE
    assert TIER2_FILE.is_file(), TIER2_FILE


def test_closure_markers_identical_between_tiers():
    tier1 = extract_list_literal(TIER1_FILE, "INACTIVE_TEXT_MARKERS")
    tier2 = extract_list_literal(TIER2_FILE, "INACTIVE_TEXT_MARKERS")
    assert tier1 == tier2, (
        "Tier 1 and Tier 2 closure-text markers have drifted — a phrase added to "
        "one detector but not the other means the two tiers can disagree about "
        "whether the same page text means the job is closed."
    )


def test_min_content_threshold_identical_between_tiers():
    tier1 = extract_list_literal(TIER1_FILE, "MIN_CONTENT_CHARS")
    tier2 = extract_list_literal(TIER2_FILE, "MIN_CONTENT_CHARS")
    assert tier1 == tier2, (
        "Tier 1 and Tier 2 disagree on how much rendered text counts as a real "
        "page vs. a bot-block/JS-shell response."
    )


def test_marker_list_is_not_accidentally_empty():
    # A passing "identical" comparison between two empty lists would be a false
    # sense of safety — that only proves neither file has been broken the same way.
    assert len(extract_list_literal(TIER1_FILE, "INACTIVE_TEXT_MARKERS")) >= 5
