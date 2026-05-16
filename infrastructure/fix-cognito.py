import boto3

client = boto3.client('cognito-idp', region_name='us-east-1')

client.update_user_pool_client(
    UserPoolId='us-east-1_HV7c5Aury',
    ClientId='kf95amiv34latrfq2pue7l8on',
    ExplicitAuthFlows=[
        'ALLOW_USER_PASSWORD_AUTH',
        'ALLOW_USER_SRP_AUTH',
        'ALLOW_REFRESH_TOKEN_AUTH'
    ]
)

print("תוקן בהצלחה!")