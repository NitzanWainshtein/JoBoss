# JoBoss feature:
# - F-01: User Registration & Authentication
#
# Cognito Post Confirmation trigger — creates the DynamoDB user record the
# moment a user is confirmed (email signup) or created via a federated
# provider (Google first sign-in). Without this, a user only appeared in
# joboss-users after logging in through LoginPage or saving an onboarding
# step, so Google signups that abandoned onboarding were invisible to the
# admin dashboard.

import os
from datetime import datetime, timezone

import boto3

USERS_TABLE = os.getenv("USERS_TABLE", "joboss-users")

dynamodb = boto3.resource("dynamodb")
users_table = dynamodb.Table(USERS_TABLE)


def handler(event, context):
    # This trigger also fires on PostConfirmation_ConfirmForgotPassword —
    # the conditional put below makes that (and any retry) a no-op.
    try:
        attrs = event.get("request", {}).get("userAttributes", {})
        user_id = attrs.get("sub")
        if not user_id:
            return event

        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        users_table.put_item(
            Item={
                "userId": user_id,
                "fullName": (attrs.get("name") or attrs.get("given_name") or "").strip(),
                "email": (attrs.get("email") or "").lower(),
                "preferredLocation": "",
                "searchRadius": 20,
                "desiredRole": "",
                "experienceLevel": "",
                "plan": "FREE",
                "role": "USER",
                "autoApply": False,
                "resumes": [],
                "onboardingCompleted": False,
                "createdAt": now,
                "updatedAt": now,
            },
            ConditionExpression="attribute_not_exists(userId)",
        )
    except users_table.meta.client.exceptions.ConditionalCheckFailedException:
        pass  # record already exists (forgot-password confirm, retry, etc.)
    except Exception as e:
        # Never fail the signup because of a bookkeeping error.
        print(f"POST_CONFIRMATION ERROR: {type(e).__name__}: {e}")

    # Cognito requires the event returned unchanged.
    return event
