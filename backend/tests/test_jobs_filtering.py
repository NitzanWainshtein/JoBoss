# Unit tests for the pure matching logic in the jobs Lambda.
# These cover the QA regressions from 2026-07: generic roles blanket-matching
# non-tech jobs, and senior titles leaking into junior feeds.
#
# Run:  pytest backend/tests

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lambdas" / "jobs"))

import handler as jobs  # noqa: E402


def job(title, description=""):
    return {"jobId": "t1", "title": title, "description": description}


JUNIOR_DEV_PREFS = {
    "preferredRoles": ["full stack developer", "frontend developer"],
    "desiredRole": "software engineer",  # generic
    "experienceLevel": "junior",
    "availability": "",
}


# ── detect_job_level ──────────────────────────────────────────────────────────

def test_senior_title_is_authoritative_over_description():
    # A stray "2 years experience with X" must not add 'junior' to a Senior title.
    j = job("Senior Full Stack Engineer",
            "8+ years required. 2 years experience with Kubernetes is a plus.")
    assert jobs.detect_job_level(j) == {"senior"}


def test_junior_title_detected():
    assert "junior" in jobs.detect_job_level(job("Junior Backend Developer"))


def test_hebrew_senior_title():
    assert "senior" in jobs.detect_job_level(job("מפתח פייתון בכיר"))


def test_grade_suffix_levels():
    assert "senior" in jobs.detect_job_level(job("Software Engineer III"))
    assert "mid" in jobs.detect_job_level(job("Software Engineer II"))


def test_architecture_is_not_architect():
    # "ASIC Architecture Intern" must not be tagged senior via 'architect'.
    levels = jobs.detect_job_level(job("ASIC Architecture Intern"))
    assert "senior" not in levels
    assert "junior" in levels


def test_bare_years_in_description_need_experience_context():
    # "2 years" without "experience" is boilerplate, not a junior signal.
    assert jobs.detect_job_level(job("Backend Developer", "2 years with AWS")) == set()
    assert "junior" in jobs.detect_job_level(
        job("Backend Developer", "1-2 years of experience required"))


# ── job_matches_experience ────────────────────────────────────────────────────

def test_senior_job_excluded_for_junior_user():
    assert not jobs.job_matches_experience(job("Senior React Developer"), JUNIOR_DEV_PREFS)


def test_unsignalled_job_included():
    assert jobs.job_matches_experience(job("React Developer"), JUNIOR_DEV_PREFS)


# ── job_matches_roles / generic-role gate ─────────────────────────────────────

def test_non_tech_job_rejected_despite_generic_role():
    # The original QA bug: "software engineer" (generic) matched EVERYTHING.
    assert not jobs.job_matches_roles(job("Legal Counsel - Product"), JUNIOR_DEV_PREFS)
    assert not jobs.job_matches_roles(job("Technical Recruiter"), JUNIOR_DEV_PREFS)


def test_generic_role_still_matches_recognizable_tech_title():
    assert jobs.job_matches_roles(job("Forward Deployed Software Engineer"), JUNIOR_DEV_PREFS)


def test_specific_role_matches_by_keywords():
    assert jobs.job_matches_roles(job("React Frontend Engineer"), JUNIOR_DEV_PREFS)


def test_description_boilerplate_does_not_satisfy_generic_gate():
    # Domain words in the description ("work with platform engineers") must not
    # make a non-tech job pass the generic gate.
    j = job("Technical Recruiter", "You will hire platform engineers and product managers.")
    assert not jobs.job_is_recognizable_tech(j)


def test_no_roles_at_all_includes_everything():
    assert jobs.job_matches_roles(job("Legal Counsel"), {"preferredRoles": [], "desiredRole": ""})


# ── _role_detail scoring ──────────────────────────────────────────────────────

MANY_ROLES_PREFS = {
    "preferredRoles": [
        "frontend developer", "backend developer", "software engineer",
        "full stack developer", "ui developer", "react developer",
        "java developer", "python developer", "android developer",
        "node.js developer", "ios developer", "mobile developer",
        "bi developer", "cloud engineer", "aws engineer", "ai engineer",
    ],
    "desiredRole": "", "experienceLevel": "junior", "availability": "",
}


def test_role_score_not_punished_by_many_preferred_roles():
    # A frontend job for a user with 16 roles used to score ~9/50 because the
    # score was matched/total. A specific match must give the full 50.
    score, matched, _, _ = jobs._role_detail(job("React Frontend Engineer"), MANY_ROLES_PREFS)
    assert score == 50
    assert "frontend developer" in matched


def test_generic_only_match_gives_half_credit():
    # Tech job outside all specific domains — only "software engineer" matches.
    score, matched, _, _ = jobs._role_detail(job("Chip Design Software Engineer"), MANY_ROLES_PREFS)
    assert matched == ["software engineer"]
    assert score == 25


def test_non_tech_job_scores_zero():
    score, matched, _, _ = jobs._role_detail(job("Legal Counsel - Product"), MANY_ROLES_PREFS)
    assert score == 0
    assert matched == []


def test_hebrew_job_matches_hebrew_keywords():
    j = job("דרוש/ה מפתח/ת פרונטאנד", "פיתוח צד לקוח ב-React לחברת סטארטאפ")
    assert jobs.job_matches_roles(j, MANY_ROLES_PREFS)
    score, matched, _, _ = jobs._role_detail(j, MANY_ROLES_PREFS)
    assert score == 50
    assert "frontend developer" in matched
