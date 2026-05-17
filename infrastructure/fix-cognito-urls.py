import boto3

client = boto3.client('cognito-idp', region_name='us-east-1')

client.update_user_pool_client(
    UserPoolId='us-east-1_a8enAwcyl',
    ClientId='5o1mg9dtkh7kjuvqu145oafv00',
    ExplicitAuthFlows=[
        'ALLOW_USER_PASSWORD_AUTH',
        'ALLOW_USER_SRP_AUTH',
        'ALLOW_REFRESH_TOKEN_AUTH'
    ],
    CallbackURLs=[
        'http://localhost:5173',
        'https://d231wno34rvped.cloudfront.net'
    ],
    LogoutURLs=[
        'http://localhost:5173',
        'https://d231wno34rvped.cloudfront.net'
    ]
)

print('✅ Cognito עודכן!')