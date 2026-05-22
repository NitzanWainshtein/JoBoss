import base64
import json
import os
from datetime import datetime, timezone, timedelta

import boto3
from botocore.exceptions import ClientError


REGION = os.getenv("AWS_REGION", "us-east-1")
USERS_TABLE = os.getenv("USERS_TABLE", "joboss-users")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
users_table = dynamodb.Table(USERS_TABLE)


PLAN_LIMITS = {
    "FREE": 5,
    "PREMIUM": 50,
}


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS"
        },
        "body": json.dumps(body)
    }


def get_next_reset_at(now):
    return (now + timedelta(days=1)).replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0
    )


def normalize_subscription_user(user_id):
    now = datetime.now(timezone.utc)
    result = users_table.get_item(Key={"userId": user_id})
    user = result.get("Item")

    if not user:
        user = {
            "userId": user_id,
            "plan": "FREE",
            "dailyApplications": 0,
            "dailyLimit": PLAN_LIMITS["FREE"],
            "limitResetAt": get_next_reset_at(now).isoformat(),
            "createdAt": now.isoformat(),
            "updatedAt": now.isoformat()
        }
        users_table.put_item(Item=user)
        return user

    plan = user.get("plan", "FREE")
    daily_limit = int(user.get("dailyLimit", PLAN_LIMITS.get(plan, PLAN_LIMITS["FREE"])))
    reset_at = user.get("limitResetAt")
    should_reset = False

    if not reset_at:
        should_reset = True
    else:
        try:
            should_reset = datetime.fromisoformat(reset_at) <= now
        except ValueError:
            should_reset = True

    if should_reset:
        reset_at = get_next_reset_at(now).isoformat()
        users_table.update_item(
            Key={"userId": user_id},
            UpdateExpression="""
                SET dailyApplications = :used,
                    dailyLimit = :dailyLimit,
                    limitResetAt = :resetAt,
                    updatedAt = :updatedAt
            """,
            ExpressionAttributeValues={
                ":used": 0,
                ":dailyLimit": daily_limit,
                ":resetAt": reset_at,
                ":updatedAt": now.isoformat()
            }
        )
        user["dailyApplications"] = 0
        user["dailyLimit"] = daily_limit
        user["limitResetAt"] = reset_at

    return user


def get_user_id(event):
    claims = (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("claims", {})
    )
    user_id = claims.get("sub")

    if user_id:
        return user_id

    user_id = get_user_id_from_authorization_header(event)
    if user_id:
        return user_id

    query = event.get("queryStringParameters") or {}
    user_id = query.get("userId")

    if user_id:
        return user_id

    body = event.get("body")
    if body:
        try:
            parsed_body = json.loads(body)
            return parsed_body.get("userId")
        except json.JSONDecodeError:
            return None

    return None


def get_user_id_from_authorization_header(event):
    headers = event.get("headers") or {}
    token = headers.get("Authorization") or headers.get("authorization") or ""
    token = token.replace("Bearer ", "", 1).strip()

    parts = token.split(".")
    if len(parts) < 2:
        return None

    try:
        payload = parts[1]
        payload += "=" * (-len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload.encode("utf-8"))
        claims = json.loads(decoded.decode("utf-8"))
        return claims.get("sub")
    except Exception:
        return None


def get_subscription(event):
    user_id = get_user_id(event)

    if not user_id:
        return response(400, {"error": "userId is required"})

    user = normalize_subscription_user(user_id)

    return response(200, {
        "userId": user["userId"],
        "plan": user.get("plan", "FREE"),
        "dailyLimit": int(user.get("dailyLimit", PLAN_LIMITS["FREE"])),
        "used": int(user.get("dailyApplications", 0)),
        "resetAt": user.get("limitResetAt")
    })


def consume_application_quota(event):
    user_id = get_user_id(event)

    if not user_id:
        return response(400, {"error": "userId is required"})

    user = normalize_subscription_user(user_id)
    used = int(user.get("dailyApplications", 0))
    daily_limit = int(user.get("dailyLimit", PLAN_LIMITS["FREE"]))

    if used >= daily_limit:
        return response(429, {
            "error": "Daily application limit reached",
            "plan": user.get("plan", "FREE"),
            "dailyLimit": daily_limit,
            "used": used,
            "resetAt": user.get("limitResetAt")
        })

    now = datetime.now(timezone.utc).isoformat()
    updated = users_table.update_item(
        Key={"userId": user_id},
        UpdateExpression="""
            SET dailyApplications = if_not_exists(dailyApplications, :zero) + :one,
                updatedAt = :updatedAt
        """,
        ConditionExpression="attribute_not_exists(dailyApplications) OR dailyApplications < :dailyLimit",
        ExpressionAttributeValues={
            ":zero": 0,
            ":one": 1,
            ":dailyLimit": daily_limit,
            ":updatedAt": now
        },
        ReturnValues="ALL_NEW"
    )["Attributes"]

    return response(200, {
        "message": "Application quota consumed",
        "plan": updated.get("plan", "FREE"),
        "dailyLimit": int(updated.get("dailyLimit", daily_limit)),
        "used": int(updated.get("dailyApplications", used + 1)),
        "resetAt": updated.get("limitResetAt")
    })


def checkout_subscription(event):
    user_id = get_user_id(event)

    if not user_id:
        return response(400, {"error": "userId is required"})

    now = datetime.now(timezone.utc).isoformat()

    users_table.update_item(
        Key={"userId": user_id},
        UpdateExpression="""
            SET #plan = :plan,
                dailyLimit = :limit,
                updatedAt = :updatedAt
        """,
        ExpressionAttributeNames={
            "#plan": "plan"
        },
        ExpressionAttributeValues={
            ":plan": "PREMIUM",
            ":limit": 50,
            ":updatedAt": now
        }
    )

    return response(200, {
        "message": "Mock checkout completed successfully",
        "plan": "PREMIUM",
        "dailyLimit": 50
    })


def cancel_subscription(event):
    user_id = get_user_id(event)

    if not user_id:
        return response(400, {"error": "userId is required"})

    now = datetime.now(timezone.utc).isoformat()

    users_table.update_item(
        Key={"userId": user_id},
        UpdateExpression="""
            SET #plan = :plan,
                dailyLimit = :limit,
                updatedAt = :updatedAt
        """,
        ExpressionAttributeNames={
            "#plan": "plan"
        },
        ExpressionAttributeValues={
            ":plan": "FREE",
            ":limit": 5,
            ":updatedAt": now
        }
    )

    return response(200, {
        "message": "Subscription cancelled",
        "plan": "FREE",
        "dailyLimit": 5
    })


def lambda_handler(event, context):
    method = event.get("httpMethod", "GET")
    path = event.get("path", "")

    if method == "OPTIONS":
        return response(200, {"message": "CORS preflight OK"})

    try:
        if method == "GET":
            return get_subscription(event)

        if method == "POST" and path.endswith("/consume"):
            return consume_application_quota(event)

        if method == "POST":
            return checkout_subscription(event)

        if method == "DELETE":
            return cancel_subscription(event)

        return response(405, {"error": f"Method {method} not allowed"})

    except ClientError as e:
        return response(500, {
            "error": "AWS service error",
            "details": str(e)
        })

    except Exception as e:
        return response(500, {
            "error": "Internal server error",
            "details": str(e)
        })
