# Unit tests for pure helpers in the uploads Lambda.

from conftest import load_lambda

# This Lambda's entry file is lambda_function.py, not handler.py.
uploads = load_lambda("uploads", entry="lambda_function.py")


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
