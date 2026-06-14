# JoBoss features:
# - F-01: User Registration & Authentication
# - F-02: Onboarding Flow (5-Step Wizard)
# - F-10: Resume Upload & Management
# - F-23: Edit Profile & Change Password
# - F-24: Account Suspension Screen
# - F-28: Show All Jobs Toggle

import json
import re
import boto3
import os
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")

USERS_TABLE_NAME = os.environ.get("USERS_TABLE_NAME", "joboss-users")
users_table = dynamodb.Table(USERS_TABLE_NAME)
RESUME_BUCKET_NAME = os.environ.get("RESUME_BUCKET_NAME", "joboss-resumes-171109860478")


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
            "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS"
        },
        "body": json.dumps(body, default=decimal_to_native)
    }


def get_claims_from_event(event):
    return (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("claims", {})
    )


def get_user_id_from_event(event):
    claims = get_claims_from_event(event)
    return claims.get("sub")


def get_user_email_from_event(event):
    claims = get_claims_from_event(event)
    return claims.get("email", "")


def get_user_name_from_event(event):
    claims = get_claims_from_event(event)
    return (claims.get("name") or claims.get("given_name") or "").strip()


EMAIL_RE = re.compile(r"\S+@\S+\.\S+")


def looks_like_email(value):
    return isinstance(value, str) and bool(EMAIL_RE.fullmatch(value.strip()))


def generate_presigned_resume_url(resume_url):
    """Generate a 1-hour presigned GET URL from an s3:// resume URL. Returns '' on failure."""
    if not resume_url or not isinstance(resume_url, str) or not resume_url.startswith("s3://"):
        return ""
    without_scheme = resume_url.replace("s3://", "", 1)
    bucket, _, key = without_scheme.partition("/")
    if not bucket or not key:
        return ""
    try:
        return s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=3600,
        )
    except Exception as e:
        print(f"PRESIGN ERROR: {type(e).__name__}: {e}")
        return ""


def get_http_method(event):
    return (
        event.get("httpMethod")
        or event.get("requestContext", {}).get("http", {}).get("method")
        or ""
    ).upper()


def normalize_user(user):
    if not user:
        return user

    user.setdefault("fullName", "")
    user.setdefault("email", "")
    user.setdefault("preferredLocation", "")
    user.setdefault("searchRadius", 20)
    user.setdefault("desiredRole", "")
    user.setdefault("experienceLevel", "")
    user.setdefault("plan", "FREE")
    user.setdefault("role", "USER")
    user.setdefault("autoApply", False)
    user.setdefault("autoTailorCV", False)
    user.setdefault("resumeUrl", None)
    user.setdefault("resumes", [])
    user.setdefault("onboardingCompleted", False)
    user.setdefault("preferredRoles", [])
    user.setdefault("availability", "")
    user.setdefault("phone", "")
    user.setdefault("currentLocation", "")
    user.setdefault("currentCompany", "")
    user.setdefault("gender", "")
    user.setdefault("linkedinUrl", "")
    user.setdefault("githubUrl", "")
    user.setdefault("websiteUrl", "")
    user.setdefault("latitude", None)
    user.setdefault("longitude", None)

    if isinstance(user.get("resumes"), list):
        user["resumes"] = [normalize_resume(resume) for resume in user["resumes"] if isinstance(resume, dict)]
    else:
        user["resumes"] = []

    return user


def normalize_resume(resume):
    normalized = dict(resume)
    normalized.setdefault("resumeId", "")
    normalized.setdefault("url", "")
    normalized.setdefault("fileName", "")
    normalized.setdefault("uploadedAt", "")
    normalized.setdefault("isActive", False)
    return normalized


def validate_user_fields(body):
    if "autoApply" in body and not isinstance(body["autoApply"], bool):
        return "autoApply must be true or false"

    if "searchRadius" in body:
        if not isinstance(body["searchRadius"], (int, float)):
            return "searchRadius must be a number"

        if body["searchRadius"] < 0:
            return "searchRadius must be greater than or equal to 0"

    return None


def get_s3_key_from_resume_url(url):
    prefix = f"s3://{RESUME_BUCKET_NAME}/"
    if url and url.startswith(prefix):
        return url.replace(prefix, "", 1)
    return None


def get_now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def build_updated_user_from_body(existing_user, body):
    user = normalize_user(existing_user or {"userId": body.get("userId")})

    allowed_fields = [
        "fullName",
        "email",
        "preferredLocation",
        "searchRadius",
        "desiredRole",
        "experienceLevel",
        # NOTE: "plan" and "role" are intentionally NOT self-editable.
        # plan is owned by the subscriptions service / admin; role by Cognito groups.
        "autoApply",
        "autoTailorCV",
        "onboardingCompleted",
        "preferredRoles",
        "availability",
        "phone",
        "currentLocation",
        "currentCompany",
        "gender",
        "linkedinUrl",
        "githubUrl",
        "websiteUrl",
    ]

    for field in allowed_fields:
        if field in body:
            user[field] = body[field]

    if "latitude" in body and body["latitude"] is not None:
        user["latitude"] = Decimal(str(body["latitude"]))
    if "longitude" in body and body["longitude"] is not None:
        user["longitude"] = Decimal(str(body["longitude"]))

    if "resumeUrl" in body:
        user["resumeUrl"] = body["resumeUrl"]

    if "resumeData" in body and isinstance(body["resumeData"], dict):
        resume_data = body["resumeData"]
        existing_resumes = [normalize_resume(resume) for resume in user.get("resumes", [])]

        for resume in existing_resumes:
            resume["isActive"] = False

        new_resume = {
            "resumeId": resume_data["resumeId"],
            "url": resume_data["resumeUrl"],
            "fileName": resume_data["fileName"],
            "uploadedAt": resume_data["uploadedAt"],
            "isActive": True
        }

        existing_resumes.append(new_resume)
        existing_resumes.sort(key=lambda item: item.get("uploadedAt", ""), reverse=True)

        if len(existing_resumes) > 3:
            oldest = existing_resumes.pop()
            oldest_url = oldest.get("url", "")
            s3_key = get_s3_key_from_resume_url(oldest_url)
            if s3_key:
                s3.delete_object(Bucket=RESUME_BUCKET_NAME, Key=s3_key)

        user["resumes"] = existing_resumes
        user["resumeUrl"] = new_resume["url"]

    action = body.get("action")
    resume_id = body.get("resumeId")

    if action in {"delete", "setActive"} and resume_id:
        existing_resumes = [normalize_resume(resume) for resume in user.get("resumes", [])]
        target_resume = None

        for resume in existing_resumes:
            if resume.get("resumeId") == resume_id:
                target_resume = resume
                break

        if not target_resume:
            raise ValueError("resumeId not found")

        if action == "delete":
            existing_resumes = [resume for resume in existing_resumes if resume.get("resumeId") != resume_id]

            if target_resume.get("url"):
                s3_key = get_s3_key_from_resume_url(target_resume.get("url"))
                if s3_key:
                    s3.delete_object(Bucket=RESUME_BUCKET_NAME, Key=s3_key)

            if not existing_resumes:
                user["resumeUrl"] = None
            elif target_resume.get("isActive"):
                for index, resume in enumerate(existing_resumes):
                    resume["isActive"] = index == 0
                user["resumeUrl"] = existing_resumes[0].get("url")

            user["resumes"] = existing_resumes

        if action == "setActive":
            for resume in existing_resumes:
                resume["isActive"] = resume.get("resumeId") == resume_id

            user["resumes"] = existing_resumes
            user["resumeUrl"] = target_resume.get("url")

    if user.get("resumes"):
        active_resume = next((resume for resume in user["resumes"] if resume.get("isActive")), None)
        if active_resume:
            user["resumeUrl"] = active_resume.get("url")
        else:
            user["resumes"][0]["isActive"] = True
            user["resumeUrl"] = user["resumes"][0].get("url")

    return user


def get_user_profile(event):
    user_id = get_user_id_from_event(event)

    if not user_id:
        return build_response(401, {
            "message": "Missing user identity"
        })

    response = users_table.get_item(
        Key={
            "userId": user_id
        }
    )

    user = response.get("Item")

    if not user:
        return build_response(404, {
            "message": "User profile not found"
        })

    user = normalize_user(user)

    # fullName fallback: if missing or storing an email (legacy bad data),
    # use the Cognito name attribute from the token claims instead.
    current_name = (user.get("fullName") or "").strip()
    if not current_name or looks_like_email(current_name):
        cognito_name = get_user_name_from_event(event)
        if cognito_name and not looks_like_email(cognito_name):
            user["fullName"] = cognito_name
        elif looks_like_email(current_name):
            user["fullName"] = ""

    # Presigned URL so the browser/extension can fetch the resume PDF directly.
    user["resumePresignedUrl"] = generate_presigned_resume_url(user.get("resumeUrl"))

    active_resume = next((r for r in user.get("resumes", []) if r.get("isActive")), None)
    user["resumeFileName"] = (active_resume or {}).get("fileName", "") if active_resume else ""

    return build_response(200, {
        "message": "User profile fetched successfully",
        "user": user
    })


def create_user_profile(event):
    body = json.loads(event.get("body") or "{}")

    user_id = get_user_id_from_event(event)

    if not user_id:
        return build_response(401, {
            "message": "Missing user identity"
        })

    validation_error = validate_user_fields(body)
    if validation_error:
        return build_response(400, {
            "message": validation_error
        })

    now = datetime.now(timezone.utc).isoformat()

    user_item = {
        "userId": user_id,
        "fullName": body.get("fullName", ""),
        "email": body.get("email") or get_user_email_from_event(event),
        "preferredLocation": body.get("preferredLocation", ""),
        "searchRadius": body.get("searchRadius", 20),
        "desiredRole": body.get("desiredRole", ""),
        "experienceLevel": body.get("experienceLevel", ""),
        # plan/role are never taken from the client (privilege escalation risk).
        "plan": "FREE",
        "role": "USER",
        "autoApply": body.get("autoApply", False),
        "resumeUrl": body.get("resumeUrl"),
        "resumes": body.get("resumes", []),
        "createdAt": now,
        "updatedAt": now
    }

    users_table.put_item(
        Item=user_item,
        ConditionExpression="attribute_not_exists(userId)"
    )

    return build_response(201, {
        "message": "User profile created successfully",
        "user": user_item
    })


def update_user_profile(event):
    body = json.loads(event.get("body") or "{}")
    user_id = get_user_id_from_event(event)

    print(f"PUT /users/me userId={user_id} body_keys={list(body.keys())} preferredRoles={body.get('preferredRoles')}")

    if not user_id:
        return build_response(401, {
            "message": "Missing user identity"
        })

    validation_error = validate_user_fields(body)
    if validation_error:
        return build_response(400, {
            "message": validation_error
        })

    response = users_table.get_item(
        Key={
            "userId": user_id
        }
    )

    current_user = response.get("Item") or {"userId": user_id}
    updated_user = build_updated_user_from_body(current_user, body)
    updated_user["updatedAt"] = get_now_iso()

    users_table.put_item(Item=updated_user)

    return build_response(200, {
        "message": "User profile updated successfully",
        "user": normalize_user(updated_user)
    })


def handler(event, context):
    try:
        method = get_http_method(event)

        if method != "OPTIONS":
            user_id = get_user_id_from_event(event)
            if user_id:
                record = users_table.get_item(Key={"userId": user_id}).get("Item", {})
                if record.get("blocked"):
                    return build_response(403, {"error": "Account suspended", "code": "ACCOUNT_SUSPENDED"})

        if method == "GET":
            return get_user_profile(event)

        if method == "POST":
            return create_user_profile(event)

        if method == "PUT":
            return update_user_profile(event)

        if method == "OPTIONS":
            return build_response(200, {
                "message": "CORS preflight successful"
            })

        return build_response(405, {
            "message": f"Method {method} is not allowed"
        })

    except users_table.meta.client.exceptions.ConditionalCheckFailedException:
        return build_response(409, {
            "message": "User profile already exists"
        })

    except ValueError as e:
        return build_response(400, {
            "message": str(e)
        })

    except json.JSONDecodeError:
        return build_response(400, {
            "message": "Invalid JSON body"
        })

    except Exception as e:
        print(f"USERS ERROR: {type(e).__name__}: {e}")
        return build_response(500, {
            "message": "Failed to process user request"
        })