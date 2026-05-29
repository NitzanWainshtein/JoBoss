import json
import boto3
import os
from datetime import datetime, timezone
from decimal import Decimal

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
    if "plan" in body and body["plan"] not in ["FREE", "PREMIUM"]:
        return "plan must be FREE or PREMIUM"

    if "role" in body and body["role"] not in ["USER", "ADMIN"]:
        return "role must be USER or ADMIN"

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
        "plan",
        "role",
        "autoApply",
        "autoTailorCV",
        "onboardingCompleted",
        "preferredRoles",
        "availability",
        "latitude",
        "longitude",
    ]

    for field in allowed_fields:
        if field in body:
            user[field] = body[field]

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

    return build_response(200, {
        "message": "User profile fetched successfully",
        "user": normalize_user(user)
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
        "plan": body.get("plan", "FREE"),
        "role": body.get("role", "USER"),
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
        return build_response(500, {
            "message": "Failed to process user request",
            "error": str(e)
        })