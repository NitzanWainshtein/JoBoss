# One-time backfill: create joboss-users records for Cognito users that have
# none (signed up but never completed a login/onboarding step that would have
# created one). Matches by sub (userId), so duplicate emails across
# email-password and Google identities are handled correctly.
#
# Usage:
#   python backend/scripts/backfill_cognito_users.py            # dry run
#   python backend/scripts/backfill_cognito_users.py --apply    # write records

import sys

import boto3

USER_POOL_ID = "us-east-1_a8enAwcyl"
USERS_TABLE = "joboss-users"
REGION = "us-east-1"


def list_cognito_users(cognito):
    users = []
    kwargs = {"UserPoolId": USER_POOL_ID}
    while True:
        resp = cognito.list_users(**kwargs)
        users.extend(resp.get("Users", []))
        token = resp.get("PaginationToken")
        if not token:
            return users
        kwargs["PaginationToken"] = token


def existing_user_ids(table):
    ids = set()
    kwargs = {"ProjectionExpression": "userId"}
    while True:
        resp = table.scan(**kwargs)
        ids.update(item["userId"] for item in resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            return ids
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


def main():
    apply = "--apply" in sys.argv
    cognito = boto3.client("cognito-idp", region_name=REGION)
    table = boto3.resource("dynamodb", region_name=REGION).Table(USERS_TABLE)

    known = existing_user_ids(table)
    missing = []
    for user in list_cognito_users(cognito):
        attrs = {a["Name"]: a["Value"] for a in user.get("Attributes", [])}
        sub = attrs.get("sub")
        if not sub or sub in known:
            continue
        created = user["UserCreateDate"].astimezone().isoformat()
        missing.append({
            "userId": sub,
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
            "createdAt": created,
            "updatedAt": created,
        })
        print(f"missing: {attrs.get('email', '?'):40s} sub={sub} "
              f"status={user.get('UserStatus')} created={created}")

    print(f"\n{len(missing)} Cognito user(s) without a joboss-users record.")
    if not apply:
        print("Dry run — pass --apply to create the records.")
        return

    for item in missing:
        table.put_item(Item=item, ConditionExpression="attribute_not_exists(userId)")
        print(f"created: {item['email']}")
    print("Done.")


if __name__ == "__main__":
    main()
