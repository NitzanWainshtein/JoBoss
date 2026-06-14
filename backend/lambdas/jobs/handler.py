# JoBoss features:
# - F-03: Job Discovery & Swipe Interface
# - F-04: Job Filtering & Matching Algorithm

import json
import re
import boto3
import os
import math
import base64
import urllib.parse
import urllib.request
from decimal import Decimal
from botocore.exceptions import ClientError

dynamodb = boto3.resource("dynamodb")

JOBS_TABLE_NAME = os.environ.get("JOBS_TABLE_NAME", "joboss-jobs")
USERS_TABLE_NAME = os.environ.get("USERS_TABLE_NAME", "joboss-users")
jobs_table = dynamodb.Table(JOBS_TABLE_NAME)
users_table = dynamodb.Table(USERS_TABLE_NAME)

NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"

# ── Preference keyword map ────────────────────────────────────────────────────
# Each key is a canonical role/concept; value is the set of keywords that
# match it in a job title or description (all lowercase).
# Matching is: any keyword is a substring of the normalised job text.
ROLE_KEYWORDS = {
    # Keywords are matched as substrings of normalised "title + description".
    # Use multi-word phrases wherever a single word would cause false positives
    # (e.g. "backend" alone hits "Physical Design Backend Engineer").
    "frontend developer":  ["frontend developer", "front-end developer", "front end developer",
                             "frontend engineer", "front-end engineer", "front end engineer",
                             "react developer", "react engineer", "vue developer",
                             "angular developer", "ui developer", "web developer",
                             "javascript developer", "typescript developer",
                             "next.js developer", "nextjs developer",
                             # Short tech signals — only matched against title (see TITLE_ONLY_KEYWORDS)
                             "frontend", "front-end", "front end",
                             "react", "vue", "angular"],
    "backend developer":   ["backend developer", "back-end developer", "back end developer",
                             "backend engineer", "back-end engineer", "back end engineer",
                             "node.js developer", "nodejs developer",
                             "python developer", "java developer", "go developer",
                             "django developer", "flask developer",
                             "api developer", "server-side developer",
                             # Single-word tech signals — safe in titles
                             "backend", "back-end"],
    "full stack developer":["full stack", "fullstack", "full-stack", "mern", "mean stack"],
    "mobile developer":    ["mobile developer", "mobile engineer",
                             "android developer", "android engineer",
                             "ios developer", "ios engineer",
                             "react native", "flutter developer", "swift developer",
                             "kotlin developer"],
    "devops":              ["devops", "dev ops", "site reliability engineer", "sre engineer",
                             "platform engineer", "cloud engineer",
                             "ci/cd", "kubernetes engineer", "infrastructure engineer",
                             "terraform", "ansible"],
    "data scientist":      ["data scientist", "data science",
                             "machine learning engineer", "ml engineer",
                             "deep learning", "nlp engineer", "ai researcher",
                             "data analyst", "analytics engineer"],
    "data engineer":       ["data engineer", "etl developer",
                             "data pipeline", "spark engineer",
                             "kafka engineer", "airflow", "databricks"],
    "qa engineer":         ["qa engineer", "quality assurance engineer",
                             "test engineer", "automation engineer", "sdet",
                             "selenium", "cypress", "playwright"],
    "security engineer":   ["security engineer", "cybersecurity engineer",
                             "penetration tester", "pentest", "appsec",
                             "devsecops", "soc analyst", "infosec engineer"],
    "product manager":     ["product manager", "product owner", "product lead"],
    "designer":            ["ux designer", "ui designer", "ui/ux", "product designer",
                             "figma", "web designer"],
    "embedded":            ["embedded", "firmware", "rtos", "fpga", "vhdl", "verilog",
                             "hardware engineer", "asic", "phy engineer", "rtl design",
                             "logic design", "chip design", "physical design",
                             "vlsi", "signal processing"],
    "ai engineer":         ["ai engineer", "llm engineer", "generative ai",
                             "prompt engineer", "mlops", "computer vision engineer"],
}

# Aliases: maps any surface form a user might type → canonical key above
ROLE_ALIASES = {
    "react developer": "frontend developer",
    "react engineer": "frontend developer",
    "ui developer": "frontend developer",
    "web developer": "frontend developer",
    "javascript developer": "frontend developer",
    "typescript developer": "frontend developer",
    "vue developer": "frontend developer",
    "angular developer": "frontend developer",
    "node developer": "backend developer",
    "python developer": "backend developer",
    "java developer": "backend developer",
    "software engineer": None,   # generic — don't filter, maps to no-op
    "software developer": None,
    "developer": None,
    "engineer": None,
}

# Keywords that should only be matched against the job *title*, not the full
# description.  These are short/common words that appear in unrelated contexts
# inside long description boilerplate (e.g. "front end" in a Google careers
# page footer, "backend" in a chip-design team name).
TITLE_ONLY_KEYWORDS = {
    "frontend", "front-end", "front end",
    "backend", "back-end", "back end",
    "react", "vue", "angular",
    "mobile", "android", "ios",
    "devops", "sre",
    "security",
    "embedded", "firmware",
}

# ── Experience level detection ────────────────────────────────────────────────
#
# Two-stage detection:
#   1. TITLE signals  — checked against the job title only.  These are strong,
#      unambiguous indicators where the word appears as part of the job title.
#   2. DESCRIPTION signals — checked against title+description combined, but
#      only for patterns that are safe in longer text (years-of-experience
#      phrases, explicit level labels).
#
# "senior" title signals are intentionally broad (sr., lead, architect…) because
# a title is short and any of these words unambiguously indicates seniority.
# We intentionally do NOT include "experienced" as a signal — it's too common
# in descriptions of any level ("experience with React").

SENIOR_TITLE_SIGNALS = [
    "senior", "sr.", "sr ", "lead", "principal", "staff",
    "architect", "manager", "director", "vp ", "head of",
    "distinguished", "fellow",
]

JUNIOR_TITLE_SIGNALS = [
    "junior", "jr.", "jr ", "entry level", "entry-level",
    "associate ", "intern", "graduate",
]

MID_TITLE_SIGNALS = [
    "mid-level", "mid level", "intermediate",
]

# Regex patterns matched against the full text (title + description).
# Matches "5+ years", "10+ years", "5-7 years", "at least 5 years", etc.
_SENIOR_YEARS_RE = re.compile(
    r'\b([5-9]|\d{2,})\+?\s*(?:to\s*\d+\s*)?years?\b'
    r'|at\s+least\s+[5-9]\s+years?'
    r'|\b[5-9]\s*[-–]\s*\d+\s*years?',
    re.IGNORECASE,
)
_JUNIOR_YEARS_RE = re.compile(
    r'\b[0-2]\+?\s*(?:to\s*[0-4]\s*)?years?\s*(?:of\s*experience)?'
    r'|fresh\s*grad|new\s*grad|0\s*[-–]\s*[12]\s*years?',
    re.IGNORECASE,
)
_MID_YEARS_RE = re.compile(
    r'\b[2-4]\+?\s*(?:to\s*[4-6]\s*)?years?\s*(?:of\s*experience)?'
    r'|\b3\s*[-–]\s*5\s*years?'
    r'|\b2\s*[-–]\s*4\s*years?',
    re.IGNORECASE,
)

# Plain description keywords (safe to check in full text)
SENIOR_DESC_SIGNALS = ["mentoring engineers", "mentoring junior", "leading technical",
                        "technical leadership", "architectural decisions", "tech lead"]
JUNIOR_DESC_SIGNALS  = ["no experience required", "will train", "bootcamp", "first job",
                         "new graduate", "fresh graduate"]
STUDENT_SIGNALS      = ["student", "intern", "internship", "academic", "סטודנט", "אקדמי"]

# Availability / employment-type keywords in job text.
# Keys are the canonical values stored by the app (onboarding + ProfilePage).
# Each value is the list of job-text signals that indicate that employment type.
AVAILABILITY_KEYWORDS = {
    # Canonical Hebrew values saved by onboarding / ProfilePage
    "מיידי":       ["full time", "full-time", "fulltime", "permanent", "משרה מלאה"],
    "תוך חודש":    ["full time", "full-time", "fulltime", "permanent", "משרה מלאה"],
    "סתם מסתכל":   [],   # browsing only — no strong job-text filter; always include
    # Legacy English values (in case any user still has them)
    "full-time":   ["full time", "full-time", "fulltime", "permanent", "משרה מלאה"],
    "part-time":   ["part time", "part-time", "parttime", "חלקית", "משרה חלקית"],
    "freelance":   ["freelance", "contract", "consulting", "contractor", "פרילנס"],
    "student":     ["student", "intern", "internship", "academic", "part time", "סטודנט",
                    "אקדמי", "חלקית"],
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def decimal_to_native(obj):
    if isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        return float(obj)
    raise TypeError


def build_response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,OPTIONS"
        },
        "body": json.dumps(body, default=decimal_to_native, ensure_ascii=False)
    }


def get_http_method(event):
    return (
        event.get("httpMethod")
        or event.get("requestContext", {}).get("http", {}).get("method")
        or ""
    ).upper()


def get_query_params(event):
    return event.get("queryStringParameters") or {}


def get_job_id_from_event(event):
    path_params = event.get("pathParameters") or {}
    query_params = get_query_params(event)
    return (
        path_params.get("jobId")
        or path_params.get("id")
        or query_params.get("jobId")
        or query_params.get("id")
    )


def to_float(value):
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def haversine_distance_km(lat1, lng1, lat2, lng2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlng / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def normalize_text(value):
    if value is None:
        return ""
    return str(value).strip().lower()


def location_aliases(value):
    normalized = normalize_text(value)
    aliases = {
        "תל אביב": ["תל אביב", "תל אביב, ישראל", "tel aviv", "tel-aviv", "tel aviv-yafo", "tel-aviv-yafo"],
        "tel aviv": ["תל אביב", "תל אביב, ישראל", "tel aviv", "tel-aviv", "tel aviv-yafo", "tel-aviv-yafo"],
        "remote": ["remote", "מרחוק", "עבודה מרחוק"],
        "herzliya": ["herzliya", "הרצליה"],
        "הרצליה": ["herzliya", "הרצליה"],
        "ramat gan": ["ramat gan", "רמת גן"],
        "רמת גן": ["ramat gan", "רמת גן"],
        "petah tikva": ["petah tikva", "petah-tikva", "פתח תקווה", "פתח תקוה"],
        "פתח תקווה": ["petah tikva", "petah-tikva", "פתח תקווה", "פתח תקוה"],
        "פתח תקוה": ["petah tikva", "petah-tikva", "פתח תקווה", "פתח תקוה"],
        "haifa": ["haifa", "חיפה"],
        "חיפה": ["haifa", "חיפה"],
        "jerusalem": ["jerusalem", "ירושלים"],
        "ירושלים": ["jerusalem", "ירושלים"],
    }
    return aliases.get(normalized, [normalized])


def job_matches_location(job, requested_location):
    if not requested_location:
        return True
    job_location = normalize_text(job.get("location", ""))
    for loc in location_aliases(requested_location):
        n = normalize_text(loc)
        if n in job_location or job_location in n:
            return True
    return False


def geocode_location(location):
    if not location:
        return None, None
    if normalize_text(location) in ["remote", "מרחוק", "עבודה מרחוק"]:
        return None, None
    params = {"q": location, "format": "jsonv2", "limit": "1",
              "countrycodes": "il", "addressdetails": "0"}
    url = f"{NOMINATIM_SEARCH_URL}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "JoBossFinalProject/1.0 (Ariel University student project)"}
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        results = json.loads(r.read().decode("utf-8"))
    if not results:
        return None, None
    return to_float(results[0].get("lat")), to_float(results[0].get("lon"))


def save_job_coordinates(job_id, latitude, longitude):
    if not job_id or latitude is None or longitude is None:
        return
    jobs_table.update_item(
        Key={"jobId": job_id},
        UpdateExpression="SET latitude = :lat, longitude = :lng",
        ExpressionAttributeValues={
            ":lat": Decimal(str(latitude)),
            ":lng": Decimal(str(longitude)),
        },
    )


def ensure_job_coordinates(job):
    job_lat = to_float(job.get("latitude"))
    job_lng = to_float(job.get("longitude"))
    if job_lat is not None and job_lng is not None:
        return job_lat, job_lng, False
    job_id = job.get("jobId")
    location = job.get("location")
    if not job_id or not location:
        return None, None, False
    try:
        glat, glng = geocode_location(location)
        if glat is None or glng is None:
            return None, None, False
        save_job_coordinates(job_id, glat, glng)
        job["latitude"] = glat
        job["longitude"] = glng
        return glat, glng, True
    except Exception as error:
        print(f"Failed to geocode job {job_id} location '{location}': {error}")
        return None, None, False


# ── User preferences helpers ──────────────────────────────────────────────────

def get_user_id_from_event(event):
    """Extract Cognito sub from authorizer claims or JWT token."""
    # API Gateway authorizer path (most common)
    uid = (event.get("requestContext", {})
           .get("authorizer", {})
           .get("claims", {})
           .get("sub"))
    if uid:
        return uid
    # Fallback: decode JWT manually from Authorization header
    headers = event.get("headers") or {}
    token = (headers.get("Authorization") or headers.get("authorization") or "").replace("Bearer ", "").strip()
    parts = token.split(".")
    if len(parts) >= 2:
        try:
            payload = parts[1] + "=" * (-len(parts[1]) % 4)
            return json.loads(base64.urlsafe_b64decode(payload)).get("sub")
        except Exception:
            pass
    return None


def get_user_preferences(user_id):
    """
    Fetch the user's preference fields from DynamoDB.
    Returns a dict with normalised values; all fields default to
    empty/None so callers never get a KeyError.
    """
    if not user_id:
        return {}
    try:
        item = users_table.get_item(Key={"userId": user_id}).get("Item", {})
        return {
            "preferredRoles": [normalize_text(r) for r in (item.get("preferredRoles") or [])],
            "desiredRole":    normalize_text(item.get("desiredRole", "")),
            "experienceLevel":normalize_text(item.get("experienceLevel", "")),
            "availability":   normalize_text(item.get("availability", "")),
            "preferredLocation": item.get("preferredLocation", ""),
            "searchRadius":   to_float(item.get("searchRadius")),
            "latitude":       to_float(item.get("latitude")),
            "longitude":      to_float(item.get("longitude")),
        }
    except Exception as e:
        print(f"PREFS FETCH ERROR: userId={user_id}, error={e}")
        return {}


def role_keywords_for(role_text):
    """
    Return the list of match-keywords for a given role string.
    Checks alias table first, then direct canonical key, then falls
    back to treating the raw string as a keyword itself.
    Returns None (no-op, include all) for generic terms like "developer".
    """
    key = ROLE_ALIASES.get(role_text)
    if key is None and role_text in ROLE_ALIASES:
        # Explicitly mapped to None → generic, skip filtering
        return None
    canonical = key or role_text
    if canonical in ROLE_KEYWORDS:
        return ROLE_KEYWORDS[canonical]
    # Not in the map — use the role text itself as a keyword
    return [role_text]


def job_text(job):
    """Combined lowercase text of title + description for keyword matching."""
    return normalize_text(job.get("title", "") + " " + job.get("description", ""))


def job_title_text(job):
    """Lowercase title only — used for short single-word keywords."""
    return normalize_text(job.get("title", ""))


# ── Preference filters (all default to include when field missing) ────────────

def job_matches_roles(job, prefs):
    """
    Returns True if the job matches any of the user's preferred roles,
    OR if the user has no role preferences set, OR if the job has no
    text to match against.
    """
    roles = prefs.get("preferredRoles", [])
    desired = prefs.get("desiredRole", "")
    all_roles = list(roles)
    if desired:
        all_roles.append(desired)

    # No preferences → include everything
    if not all_roles:
        return True

    text = job_text(job)
    # Job has no text → include (default inclusive)
    if not text.strip():
        return True

    title_text = job_title_text(job)

    for role in all_roles:
        keywords = role_keywords_for(role)
        if keywords is None:
            # Generic term — counts as a match
            return True
        for kw in keywords:
            # Title-only keywords are matched against the short title string
            # only, to avoid false positives from boilerplate in descriptions.
            if kw in TITLE_ONLY_KEYWORDS:
                if kw in title_text:
                    return True
            else:
                if kw in text:
                    return True

    return False


def detect_job_level(job):
    """
    Determine the experience level(s) a job targets.
    Returns a set of strings from {"junior", "mid", "senior", "student"}.
    Returns an empty set when no signal is found (→ caller should include job).

    Priority: title signals are checked first and are authoritative.  If the
    title clearly says "Sr." or "Junior", that verdict is final and description
    signals only add to the set, never contradict the title.
    """
    title = job_title_text(job)
    desc  = job_text(job)   # title + description, normalised

    levels = set()

    # ── Title signals (authoritative) ────────────────────────────────────────
    if any(sig in title for sig in SENIOR_TITLE_SIGNALS):
        levels.add("senior")
    if any(sig in title for sig in JUNIOR_TITLE_SIGNALS):
        levels.add("junior")
    if any(sig in title for sig in MID_TITLE_SIGNALS):
        levels.add("mid")
    if any(sig in title for sig in STUDENT_SIGNALS):
        levels.add("student")

    # ── Description / years signals (additive) ────────────────────────────
    if _SENIOR_YEARS_RE.search(desc):
        levels.add("senior")
    if _JUNIOR_YEARS_RE.search(desc):
        levels.add("junior")
    if _MID_YEARS_RE.search(desc):
        levels.add("mid")
    if any(sig in desc for sig in SENIOR_DESC_SIGNALS):
        levels.add("senior")
    if any(sig in desc for sig in JUNIOR_DESC_SIGNALS):
        levels.add("junior")
    if any(sig in desc for sig in STUDENT_SIGNALS):
        levels.add("student")

    return levels


def job_matches_experience(job, prefs):
    """
    Returns True if the job's detected level matches the user's level,
    OR if no level signal was found in the job (default inclusive).
    """
    user_level = prefs.get("experienceLevel", "")
    # Normalise Hebrew level names stored by onboarding
    _LEVEL_NORM = {"סטודנט": "student", "junior": "junior", "mid": "mid",
                   "senior": "senior", "lead": "senior", "manager": "senior"}
    user_level = _LEVEL_NORM.get(user_level, user_level)

    # "student" availability or level → treat as junior for experience matching
    user_avail = prefs.get("availability", "")
    if user_level == "student" or "student" in user_avail or "סטודנט" in user_avail:
        user_level = "junior"

    if not user_level:
        return True  # user hasn't set a preference

    text = job_text(job)
    if not text.strip():
        return True  # no text → include

    signalled = detect_job_level(job)

    # No level signal found → default inclusive
    if not signalled:
        return True

    return user_level in signalled


def job_matches_availability(job, prefs):
    """
    Returns True if the job text signals an employment type that matches
    the user's availability, OR if the job text signals no type.
    """
    availability = prefs.get("availability", "")
    if not availability:
        return True  # no preference set

    # Find which keywords list to use for this availability value
    kw_list = AVAILABILITY_KEYWORDS.get(availability)
    if kw_list is None:
        # Unknown value — don't filter aggressively
        return True
    if len(kw_list) == 0:
        # Explicitly empty (e.g. "סתם מסתכל" = just browsing) — include everything
        return True

    text = job_text(job)
    if not text.strip():
        return True  # no text → include

    # Check if the job signals any employment type at all
    any_type_signalled = any(
        any(kw in text for kw in kws)
        for kws in AVAILABILITY_KEYWORDS.values()
    )
    if not any_type_signalled:
        return True  # job has no employment-type signal → include

    return any(kw in text for kw in kw_list)


def _role_detail(job, prefs):
    """Returns (score 0-50, matched_roles[], unmatched_roles[], hint_keywords[])."""
    roles = prefs.get("preferredRoles", [])
    desired = prefs.get("desiredRole", "")
    all_roles = [r for r in roles if r]
    if desired:
        all_roles.append(desired)

    if not all_roles:
        return 25, [], [], []

    text = job_text(job)
    title_text = job_title_text(job)
    if not text.strip():
        return 25, [], [], []

    matched, unmatched, hints = [], [], []
    for role in all_roles:
        keywords = role_keywords_for(role)
        if keywords is None:
            matched.append(role)
            continue
        hit = False
        for kw in keywords:
            if (kw in title_text) if kw in TITLE_ONLY_KEYWORDS else (kw in text):
                hit = True
                break
        if hit:
            matched.append(role)
        else:
            unmatched.append(role)
            # Suggest the first 3 keywords the user could add to their CV
            hints.extend(kw for kw in keywords[:5]
                         if kw not in TITLE_ONLY_KEYWORDS and len(kw) > 4)

    score = 0 if not matched else round((len(matched) / len(all_roles)) * 50)
    return score, matched, unmatched, list(dict.fromkeys(hints))[:4]


def _experience_detail(job, prefs):
    """Returns (score 0-30, user_level, detected_levels_set)."""
    user_level = prefs.get("experienceLevel", "")
    _LEVEL_NORM = {"סטודנט": "student", "junior": "junior", "mid": "mid",
                   "senior": "senior", "lead": "senior", "manager": "senior"}
    user_level = _LEVEL_NORM.get(user_level, user_level)

    user_avail = prefs.get("availability", "")
    if user_level == "student" or "student" in user_avail or "סטודנט" in user_avail:
        user_level = "junior"

    if not user_level:
        return 15, "", set()

    signalled = detect_job_level(job)
    if not signalled:
        return 15, user_level, set()

    score = 30 if user_level in signalled else 0
    return score, user_level, signalled


def _distance_detail(job, requested_lat, requested_lng):
    """Returns (score 0-20, dist_km or None, is_remote)."""
    is_remote = "remote" in (job.get("location") or "").strip().lower()
    if is_remote:
        return 20, None, True

    dist = job.get("distanceKm")
    if dist is None:
        job_lat = to_float(job.get("latitude"))
        job_lng = to_float(job.get("longitude"))
        if requested_lat is not None and requested_lng is not None \
                and job_lat is not None and job_lng is not None:
            dist = haversine_distance_km(requested_lat, requested_lng, job_lat, job_lng)
        else:
            return 10, None, False

    if dist <= 10:   s = 20
    elif dist <= 30: s = 16
    elif dist <= 50: s = 12
    elif dist <= 80: s = 7
    else:            s = 3
    return s, round(dist, 1), False


def compute_match_score(job, prefs, requested_lat=None, requested_lng=None):
    """Returns (total 0-100, breakdown_dict)."""
    rs, matched, unmatched, hints = _role_detail(job, prefs)
    es, user_level, detected  = _experience_detail(job, prefs)
    ds, dist_km, is_remote    = _distance_detail(job, requested_lat, requested_lng)
    total = min(100, rs + es + ds)
    breakdown = {
        "roleScore":      rs,   "expScore":  es,   "distScore": ds,
        "matchedRoles":   matched,
        "unmatchedRoles": unmatched,
        "cvHintKeywords": hints,
        "userLevel":      user_level,
        "detectedLevels": list(detected),
        "distanceKm":     dist_km,
        "isRemote":       is_remote,
    }
    return total, breakdown


def get_job_domains(job):
    """Return all ROLE_KEYWORDS categories this job matches (regardless of user prefs)."""
    text = job_text(job)
    title_text = job_title_text(job)
    if not text.strip():
        return []
    matched = []
    for role, keywords in ROLE_KEYWORDS.items():
        for kw in keywords:
            hit = (kw in title_text) if kw in TITLE_ONLY_KEYWORDS else (kw in text)
            if hit:
                matched.append(role)
                break
    return matched


def apply_preference_scoring(jobs, prefs, requested_lat=None, requested_lng=None):
    """
    Compute a 0-100 match score for every job and sort best-first.
    No jobs are dropped — low-scoring ones simply appear further down the stack.
    Also tags each job with matchesPreferences, jobDomains, and jobLevel so the
    frontend can split the deck into primary / discovery pools.
    """
    has_prefs = bool(prefs)

    for job in jobs:
        if has_prefs:
            score, breakdown = compute_match_score(job, prefs, requested_lat, requested_lng)
            job["matchScore"] = score
            job["matchBreakdown"] = breakdown
        else:
            job["matchScore"] = None
            job["matchBreakdown"] = None
        job["matchesPreferences"] = (
            job_matches_roles(job, prefs)
            and job_matches_experience(job, prefs)
            and job_matches_availability(job, prefs)
        ) if has_prefs else True
        job["jobDomains"] = get_job_domains(job)
        job["jobLevel"] = list(detect_job_level(job))

    if has_prefs:
        jobs.sort(key=lambda j: j.get("matchScore", 0), reverse=True)

    if not has_prefs:
        return jobs, {"prefsApplied": False}

    avg = round(sum(j.get("matchScore", 0) for j in jobs) / len(jobs)) if jobs else 0
    primary = sum(1 for j in jobs if j.get("matchesPreferences"))
    print(f"PREFS SCORING: count={len(jobs)}, primary={primary}, avg_score={avg}, "
          f"roles={prefs.get('preferredRoles')}, "
          f"level={prefs.get('experienceLevel')}, "
          f"avail={prefs.get('availability')}")

    return jobs, {"prefsApplied": True, "count": len(jobs), "primaryCount": primary, "avgScore": avg}


# ── Geo filter (unchanged from original) ─────────────────────────────────────

def filter_jobs(jobs, query_params, prefs):
    requested_lat = to_float(query_params.get("lat"))
    requested_lng = to_float(query_params.get("lng"))
    requested_radius = to_float(query_params.get("radius"))
    requested_location = query_params.get("location")

    # Fall back to user's stored location when frontend doesn't send coords
    if requested_lat is None and prefs.get("latitude"):
        requested_lat = prefs["latitude"]
        requested_lng = prefs.get("longitude")
        requested_radius = requested_radius or prefs.get("searchRadius") or 20

    if requested_lat is None and prefs.get("preferredLocation"):
        requested_location = requested_location or prefs["preferredLocation"]

    if requested_lat is not None and requested_lng is not None and requested_radius is not None:
        geo_jobs = []
        remote_jobs = []
        skipped = 0

        for job in jobs:
            if "remote" in (job.get("location") or "").strip().lower():
                remote_jobs.append(dict(job))
                continue
            job_lat = to_float(job.get("latitude"))
            job_lng = to_float(job.get("longitude"))
            if job_lat is None or job_lng is None:
                skipped += 1
                continue
            dist = haversine_distance_km(requested_lat, requested_lng, job_lat, job_lng)
            if dist <= requested_radius:
                enriched = dict(job)
                enriched["distanceKm"] = round(dist, 2)
                geo_jobs.append(enriched)

        geo_jobs.sort(key=lambda j: j.get("distanceKm", 999999))
        return geo_jobs + remote_jobs, {
            "lat": requested_lat,
            "lng": requested_lng,
            "radius": requested_radius,
            "radiusApplied": True,
            "mode": "coordinates",
            "remoteJobsAlwaysIncluded": len(remote_jobs),
            "skippedWithoutCoordinates": skipped,
        }

    if requested_location:
        return (
            [j for j in jobs if job_matches_location(j, requested_location)],
            {"location": requested_location, "radiusApplied": False, "mode": "text-location"},
        )

    return jobs, {"location": None, "radiusApplied": False, "mode": "all"}


# ── Scan ──────────────────────────────────────────────────────────────────────

def scan_all_jobs():
    resp = jobs_table.scan()
    items = resp.get("Items", [])
    while "LastEvaluatedKey" in resp:
        resp = jobs_table.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        items.extend(resp.get("Items", []))
    return items


# ── Route handlers ────────────────────────────────────────────────────────────

def list_jobs(event):
    query_params = get_query_params(event)

    user_id = get_user_id_from_event(event)
    prefs = get_user_preferences(user_id)
    print(f"LIST JOBS: userId={user_id}, prefs_keys={list(prefs.keys()) if prefs else []}")

    jobs = scan_all_jobs()

    # Geo filter first so distanceKm is populated before scoring
    filtered_jobs, geo_filters = filter_jobs(jobs, query_params, prefs)

    # Soft-score and sort — no jobs dropped, low scores appear last
    requested_lat = to_float(query_params.get("lat")) or prefs.get("latitude")
    requested_lng = to_float(query_params.get("lng")) or prefs.get("longitude")
    scored_jobs, score_stats = apply_preference_scoring(filtered_jobs, prefs, requested_lat, requested_lng)

    return build_response(200, {
        "message": "Jobs fetched successfully",
        "count": len(scored_jobs),
        "filters": {**geo_filters, **score_stats},
        "jobs": scored_jobs,
    })


def get_job_by_id(job_id):
    resp = jobs_table.get_item(Key={"jobId": job_id})
    job = resp.get("Item")
    if not job:
        return build_response(404, {"message": "Job not found"})
    return build_response(200, {"message": "Job fetched successfully", "job": job})


def handler(event, context):
    try:
        method = get_http_method(event)

        if method == "OPTIONS":
            return build_response(200, {"message": "CORS preflight successful"})

        if method != "GET":
            return build_response(405, {"message": f"Method {method} is not allowed"})

        job_id = get_job_id_from_event(event)
        if job_id:
            return get_job_by_id(job_id)

        return list_jobs(event)

    except Exception as e:
        print(f"JOBS HANDLER ERROR: {e}")
        return build_response(500, {"message": "Failed to process jobs request", "error": str(e)})
