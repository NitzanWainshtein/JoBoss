"""
Create joboss-subscriptions and joboss-usage tables in DynamoDB.
Run once: python deploy-subscriptions-tables.py
"""

import boto3

dynamodb = boto3.client("dynamodb", region_name="us-east-1")

tables = [
    {
        "TableName": "joboss-subscriptions",
        "KeySchema": [{"AttributeName": "userId", "KeyType": "HASH"}],
        "AttributeDefinitions": [{"AttributeName": "userId", "AttributeType": "S"}],
        "BillingMode": "PAY_PER_REQUEST",
    },
    {
        "TableName": "joboss-usage",
        "KeySchema": [
            {"AttributeName": "userId", "KeyType": "HASH"},
            {"AttributeName": "monthKey", "KeyType": "RANGE"},
        ],
        "AttributeDefinitions": [
            {"AttributeName": "userId", "AttributeType": "S"},
            {"AttributeName": "monthKey", "AttributeType": "S"},
        ],
        "BillingMode": "PAY_PER_REQUEST",
    },
]

for t in tables:
    try:
        dynamodb.create_table(**t)
        print(f"✓ Created: {t['TableName']}")
    except dynamodb.exceptions.ResourceInUseException:
        print(f"⚠️  Already exists: {t['TableName']}")

print("\nDone. Tables may take ~30s to become ACTIVE.")
print("\nNext steps:")
print("1. Add STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET to Lambda env vars")
print("2. Add STRIPE_PREMIUM_PRICE_ID, STRIPE_PREMIUM_PLUS_PRICE_ID to Lambda env vars")
print("3. Set SUBSCRIPTIONS_TABLE=joboss-subscriptions, USAGE_TABLE=joboss-usage")
print("4. Configure Stripe webhook to point at: POST /subscriptions/webhook")
print("5. Grant Lambda IAM role access to both new tables")
