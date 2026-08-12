"""Tests for /jobs pagination and for the sort determinism it depends on.

The unpaginated response is ~2.3KB per job. Lambda caps a synchronous response at
6MB, so the endpoint stops working entirely somewhere around 2,600 jobs — not
gradually, but as an outright failure. Pagination is what moves that wall.

Two properties matter and both are tested here:

1. Pagination is opt-in. A request with no `limit` returns everything, because the
   deployed frontend fetches once and filters client-side — truncating its list
   would empty the swipe deck as soon as the user had swiped the first page.

2. The sort is a deterministic TOTAL order. Scores tie constantly, Python's sort is
   stable, and the input order comes from a DynamoDB scan that is not guaranteed to
   repeat. Without a tiebreaker, offset pagination silently skips and duplicates
   jobs between pages.

Run:  pytest backend/tests
"""
import random

from conftest import load_lambda

jobs_mod = load_lambda("jobs")


def make_jobs(n, scores=None):
    out = []
    for i in range(n):
        job = {"jobId": f"job-{i:04d}", "title": f"Job {i}", "description": "x" * 10}
        if scores is not None:
            job["matchScore"] = scores[i]
        out.append(job)
    return out


# ── opt-in behaviour ──────────────────────────────────────────────────────────

def test_no_limit_returns_everything():
    jobs = make_jobs(345)
    page, meta = jobs_mod.paginate(jobs, {})
    assert len(page) == 345
    assert meta["paginated"] is False
    assert meta["total"] == 345
    assert meta["hasMore"] is False


def test_empty_query_params_is_not_treated_as_a_limit():
    # API Gateway sends queryStringParameters: None when there is no query string.
    page, _ = jobs_mod.paginate(make_jobs(10), {})
    assert len(page) == 10


def test_unrelated_params_do_not_paginate():
    # The location-filtered call sends lat/lng/radius and expects the full list.
    page, meta = jobs_mod.paginate(make_jobs(50), {"lat": "32.1", "lng": "34.8", "radius": "45"})
    assert len(page) == 50
    assert meta["paginated"] is False


# ── slicing ───────────────────────────────────────────────────────────────────

def test_first_page():
    page, meta = jobs_mod.paginate(make_jobs(100), {"limit": "20"})
    assert [j["jobId"] for j in page] == [f"job-{i:04d}" for i in range(20)]
    assert meta == {
        "total": 100, "offset": 0, "limit": 20,
        "paginated": True, "hasMore": True, "nextOffset": 20,
    }


def test_middle_page():
    page, meta = jobs_mod.paginate(make_jobs(100), {"limit": "20", "offset": "40"})
    assert [j["jobId"] for j in page] == [f"job-{i:04d}" for i in range(40, 60)]
    assert meta["nextOffset"] == 60
    assert meta["hasMore"] is True


def test_last_partial_page_reports_no_more():
    page, meta = jobs_mod.paginate(make_jobs(45), {"limit": "20", "offset": "40"})
    assert len(page) == 5
    assert meta["hasMore"] is False
    assert meta["nextOffset"] is None


def test_offset_past_the_end_is_empty_not_an_error():
    page, meta = jobs_mod.paginate(make_jobs(10), {"limit": "20", "offset": "999"})
    assert page == []
    assert meta["hasMore"] is False
    assert meta["nextOffset"] is None


def test_paging_through_covers_every_job_exactly_once():
    jobs = make_jobs(137)
    seen, offset = [], 0
    while True:
        page, meta = jobs_mod.paginate(jobs, {"limit": "25", "offset": str(offset)})
        seen.extend(j["jobId"] for j in page)
        if not meta["hasMore"]:
            break
        offset = meta["nextOffset"]

    assert len(seen) == 137
    assert len(set(seen)) == 137, "a job was returned on two different pages"
    assert seen == [j["jobId"] for j in jobs], "order changed while paging"


# ── hostile input ─────────────────────────────────────────────────────────────

def test_limit_is_capped():
    page, meta = jobs_mod.paginate(make_jobs(1000), {"limit": "99999"})
    assert meta["limit"] == jobs_mod.MAX_PAGE_SIZE
    assert len(page) == jobs_mod.MAX_PAGE_SIZE


def test_garbage_limit_falls_back_to_unpaginated():
    # An unparseable limit must not become 0 and return an empty deck.
    page, meta = jobs_mod.paginate(make_jobs(30), {"limit": "abc"})
    assert len(page) == 30
    assert meta["paginated"] is False


def test_zero_and_negative_limit_still_return_something():
    for value in ("0", "-5"):
        page, _ = jobs_mod.paginate(make_jobs(30), {"limit": value})
        assert len(page) == 1, f"limit={value} must not produce an empty page"


def test_negative_and_garbage_offset_are_treated_as_zero():
    for value in ("-10", "abc"):
        page, meta = jobs_mod.paginate(make_jobs(30), {"limit": "5", "offset": value})
        assert meta["offset"] == 0
        assert [j["jobId"] for j in page] == [f"job-{i:04d}" for i in range(5)]


# ── sort determinism, which pagination correctness rests on ───────────────────
#
# apply_preference_scoring computes matchScore itself and overwrites whatever is on
# the job, so scores cannot be injected — these drive it with real job content and
# let it score them. It also sets every score to None when prefs are empty, which
# means "some scored, some not" is unreachable in practice: a response is either
# entirely scored or entirely unscored.

PREFS = {
    "preferredRoles": ["frontend developer"],
    "desiredRole": "",
    "experienceLevel": "junior",
    "availability": "",
}


def identical_jobs(n):
    """Same content, different ids — so every one scores identically."""
    return [
        {"jobId": f"job-{i:04d}", "title": "React Frontend Engineer", "description": "React work"}
        for i in range(n)
    ]


def test_tied_scores_get_a_stable_total_order():
    a, b = identical_jobs(50), identical_jobs(50)
    random.Random(1).shuffle(a)
    random.Random(2).shuffle(b)

    sa, _ = jobs_mod.apply_preference_scoring(a, PREFS, None, None)
    sb, _ = jobs_mod.apply_preference_scoring(b, PREFS, None, None)

    # Confirm the premise: these really are tied, so only the tiebreaker can order them.
    assert len({j["matchScore"] for j in sa}) == 1

    assert [j["jobId"] for j in sa] == [j["jobId"] for j in sb], (
        "two different scan orders produced different output orders — offset "
        "pagination would skip and duplicate jobs between pages"
    )
    assert [j["jobId"] for j in sa] == sorted(j["jobId"] for j in sa)


def test_no_prefs_still_produces_a_deterministic_order():
    # No preferences means nothing is scored, so jobId alone must order the list.
    a, b = make_jobs(30), make_jobs(30)
    random.Random(3).shuffle(a)
    random.Random(4).shuffle(b)

    sa, _ = jobs_mod.apply_preference_scoring(a, {}, None, None)
    sb, _ = jobs_mod.apply_preference_scoring(b, {}, None, None)

    assert all(j["matchScore"] is None for j in sa)
    assert [j["jobId"] for j in sa] == [j["jobId"] for j in sb]
    assert [j["jobId"] for j in sa] == sorted(j["jobId"] for j in sa)


def test_better_matches_come_first():
    # A relevant job must outrank an irrelevant one for a frontend-focused user.
    jobs = [
        {"jobId": "b-legal", "title": "Legal Counsel - Product", "description": "contracts"},
        {"jobId": "a-react", "title": "React Frontend Engineer", "description": "React, TypeScript"},
    ]
    ordered, _ = jobs_mod.apply_preference_scoring(jobs, PREFS, None, None)

    assert [j["jobId"] for j in ordered] == ["a-react", "b-legal"]
    # And not merely because "a-" sorts before "b-": the scores must differ.
    assert ordered[0]["matchScore"] > ordered[1]["matchScore"]


def test_scores_are_descending_across_a_mixed_list():
    jobs = [
        {"jobId": f"job-{i}", "title": t, "description": d}
        for i, (t, d) in enumerate([
            ("React Frontend Engineer", "React"),
            ("Legal Counsel", "contracts"),
            ("Frontend Developer", "Vue"),
            ("Technical Recruiter", "hiring"),
            ("Senior Backend Engineer", "Python"),
        ])
    ]
    ordered, _ = jobs_mod.apply_preference_scoring(jobs, PREFS, None, None)
    scores = [j["matchScore"] for j in ordered]
    assert scores == sorted(scores, reverse=True)


def test_pagination_order_matches_the_unpaginated_order():
    # The guarantee a client depends on: page 0 + page 1 is the same sequence it
    # would have received in one unpaginated response.
    jobs = identical_jobs(40) + [
        {"jobId": "zz-legal", "title": "Legal Counsel", "description": "contracts"},
    ]
    random.Random(7).shuffle(jobs)
    ordered, _ = jobs_mod.apply_preference_scoring(jobs, PREFS, None, None)
    full = [j["jobId"] for j in ordered]

    paged = []
    offset = 0
    while True:
        page, meta = jobs_mod.paginate(ordered, {"limit": "9", "offset": str(offset)})
        paged.extend(j["jobId"] for j in page)
        if not meta["hasMore"]:
            break
        offset = meta["nextOffset"]

    assert paged == full
