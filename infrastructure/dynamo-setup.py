import boto3

dynamodb = boto3.client('dynamodb', region_name='us-east-1')

tables = [
    {
        'TableName': 'joboss-users',
        'KeySchema': [{'AttributeName': 'userId', 'KeyType': 'HASH'}],
        'AttributeDefinitions': [{'AttributeName': 'userId', 'AttributeType': 'S'}],
    },
    {
        'TableName': 'joboss-jobs',
        'KeySchema': [{'AttributeName': 'jobId', 'KeyType': 'HASH'}],
        'AttributeDefinitions': [{'AttributeName': 'jobId', 'AttributeType': 'S'}],
    },
    {
        'TableName': 'joboss-swipes',
        'KeySchema': [
            {'AttributeName': 'userId', 'KeyType': 'HASH'},
            {'AttributeName': 'jobId', 'KeyType': 'RANGE'}
        ],
        'AttributeDefinitions': [
            {'AttributeName': 'userId', 'AttributeType': 'S'},
            {'AttributeName': 'jobId', 'AttributeType': 'S'}
        ],
    },
    {
        'TableName': 'joboss-applications',
        'KeySchema': [{'AttributeName': 'applicationId', 'KeyType': 'HASH'}],
        'AttributeDefinitions': [{'AttributeName': 'applicationId', 'AttributeType': 'S'}],
    }
]

for table in tables:
    table['BillingMode'] = 'PAY_PER_REQUEST'
    dynamodb.create_table(**table)
    print(f"נוצרה טבלה: {table['TableName']}")

print("\nכל הטבלאות נוצרו בהצלחה!")