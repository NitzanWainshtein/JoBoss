# Unit tests for pure helpers in the uploads Lambda.

import importlib.util
import sys
from pathlib import Path

# uploads/ has no __init__.py and the file is lambda_function.py — load directly.
_path = Path(__file__).resolve().parents[1] / "lambdas" / "uploads" / "lambda_function.py"
_spec = importlib.util.spec_from_file_location("uploads_lambda", _path)
uploads = importlib.util.module_from_spec(_spec)
sys.modules["uploads_lambda"] = uploads
_spec.loader.exec_module(uploads)


def test_sanitize_strips_path_traversal():
    assert "/" not in uploads.sanitize_file_name("../../etc/passwd")
    assert "\\" not in uploads.sanitize_file_name("..\\..\\windows\\cv.pdf")


def test_sanitize_keeps_hebrew_and_basic_chars():
    assert uploads.sanitize_file_name("קורות חיים 2026.pdf") == "קורות חיים 2026.pdf"


def test_sanitize_empty_falls_back():
    assert uploads.sanitize_file_name("") == "resume.pdf"
    assert uploads.sanitize_file_name(None) == "resume.pdf"


def test_sanitize_caps_length():
    assert len(uploads.sanitize_file_name("a" * 500 + ".pdf")) <= 120
