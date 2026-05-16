import boto3

client = boto3.client('cognito-idp', region_name='us-east-1')

# יצירת User Pool
pool = client.create_user_pool(
    PoolName='joboss-users',
    Policies={
        'PasswordPolicy': {
            'MinimumLength': 8,
            'RequireUppercase': True,
            'RequireLowercase': True,
            'RequireNumbers': True,
            'RequireSymbols': False
        }
    },
    AutoVerifiedAttributes=['email'],
    UsernameAttributes=['email']
)

pool_id = pool['UserPool']['Id']
print(f"User Pool ID: {pool_id}")

# יצירת App Client
app_client = client.create_user_pool_client(
    UserPoolId=pool_id,
    ClientName='joboss-web-client',
    ExplicitAuthFlows=[
        'ALLOW_USER_PASSWORD_AUTH',
        'ALLOW_REFRESH_TOKEN_AUTH'
    ],
    GenerateSecret=False
)

client_id = app_client['UserPoolClient']['ClientId']
print(f"App Client ID: {client_id}")
print("\nשמרו את שני הערכים האלה!")