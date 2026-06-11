import boto3

apigw   = boto3.client('apigateway', region_name='us-east-1')
lam     = boto3.client('lambda',     region_name='us-east-1')
sts     = boto3.client('sts',        region_name='us-east-1')
APP     = 'joboss'
API_ID  = 'pi6i87ag1c'
REGION  = 'us-east-1'
ACCOUNT = sts.get_caller_identity()['Account']

# find /applications resource
resources = apigw.get_resources(restApiId=API_ID, limit=500)['items']
for r in resources:
    print(r.get('path', '?'), r['id'])

apps_res = next((r for r in resources if r.get('path') == '/applications'), None)
if not apps_res:
    print("ERROR: /applications not found")
    exit(1)

res_id = apps_res['id']
print(f"\n/applications id: {res_id}")

# Lambda URI
fn_name = f"{APP}-applications"
fn_arn  = lam.get_function(FunctionName=fn_name)['Configuration']['FunctionArn']
uri     = f"arn:aws:apigateway:{REGION}:lambda:path/2015-03-31/functions/{fn_arn}/invocations"

# Authorizer
auth_id = apigw.get_authorizers(restApiId=API_ID)['items'][0]['id']

# Add DELETE method
try:
    apigw.put_method(
        restApiId=API_ID, resourceId=res_id,
        httpMethod='DELETE', authorizationType='COGNITO_USER_POOLS',
        authorizerId=auth_id,
    )
    print("DELETE method created")
except apigw.exceptions.ConflictException:
    print("DELETE method already exists")

# Integration
apigw.put_integration(
    restApiId=API_ID, resourceId=res_id, httpMethod='DELETE',
    type='AWS_PROXY', integrationHttpMethod='POST', uri=uri,
)
print("Integration ok")

# Method response
try:
    apigw.put_method_response(
        restApiId=API_ID, resourceId=res_id, httpMethod='DELETE',
        statusCode='200', responseModels={'application/json': 'Empty'},
    )
    print("Method response ok")
except apigw.exceptions.ConflictException:
    print("Method response already exists")

# Lambda invoke permission
try:
    lam.add_permission(
        FunctionName=fn_name, StatementId='AllowApigwAppsDelete',
        Action='lambda:InvokeFunction', Principal='apigateway.amazonaws.com',
        SourceArn=f"arn:aws:execute-api:{REGION}:{ACCOUNT}:{API_ID}/*/DELETE/applications",
    )
    print("Lambda permission ok")
except lam.exceptions.ResourceConflictException:
    print("Lambda permission already exists")

# Update CORS OPTIONS integration response to include DELETE
try:
    apigw.put_integration_response(
        restApiId=API_ID, resourceId=res_id, httpMethod='OPTIONS', statusCode='200',
        responseParameters={
            'method.response.header.Access-Control-Allow-Headers': "'Content-Type,Authorization'",
            'method.response.header.Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'",
            'method.response.header.Access-Control-Allow-Origin':  "'*'",
        },
    )
    print("CORS updated")
except Exception as e:
    print(f"CORS note: {e}")

# Deploy
stages = apigw.get_stages(restApiId=API_ID)['item']
stage  = stages[0]['stageName']
apigw.create_deployment(restApiId=API_ID, stageName=stage)
print(f"Deployed to: {stage}")
print("Done!")
