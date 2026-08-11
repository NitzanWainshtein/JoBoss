import boto3, json

apigw = boto3.client('apigateway', region_name='us-east-1')
lmb = boto3.client('lambda', region_name='us-east-1')

API_ID = 'pi6i87ag1c'
STAGE = 'prod'
REGION = 'us-east-1'
ACCOUNT_ID = boto3.client('sts').get_caller_identity()['Account']
LAMBDA_ARN = f'arn:aws:lambda:{REGION}:{ACCOUNT_ID}:function:joboss-ai-tailor'
AUTHORIZER_ID = 'jko97e'

# Find or create /ai resource
resources = apigw.get_resources(restApiId=API_ID, limit=500)['items']
res_map = {r['path']: r for r in resources}

# Need /ai parent
ai_res = res_map.get('/ai')
if not ai_res:
    root = res_map['/']
    ai_res = apigw.create_resource(restApiId=API_ID, parentId=root['id'], pathPart='ai')
    print('Created /ai resource')
else:
    print(f'Found /ai: {ai_res["id"]}')

# Create /ai/analyze-cv
analyze_res = res_map.get('/ai/analyze-cv')
if not analyze_res:
    analyze_res = apigw.create_resource(restApiId=API_ID, parentId=ai_res['id'], pathPart='analyze-cv')
    print(f'Created /ai/analyze-cv: {analyze_res["id"]}')
else:
    print(f'Found /ai/analyze-cv: {analyze_res["id"]}')

res_id = analyze_res['id']

# Add POST method with Cognito auth
try:
    apigw.put_method(
        restApiId=API_ID, resourceId=res_id, httpMethod='POST',
        authorizationType='COGNITO_USER_POOLS', authorizerId=AUTHORIZER_ID,
        apiKeyRequired=False,
    )
    print('Created POST method')
except apigw.exceptions.ConflictException:
    print('POST method already exists')

# Integration
uri = f'arn:aws:apigateway:{REGION}:lambda:path/2015-03-31/functions/{LAMBDA_ARN}/invocations'
try:
    apigw.put_integration(
        restApiId=API_ID, resourceId=res_id, httpMethod='POST',
        type='AWS_PROXY', integrationHttpMethod='POST', uri=uri,
    )
    print('Set POST integration')
except apigw.exceptions.ConflictException:
    apigw.delete_integration(restApiId=API_ID, resourceId=res_id, httpMethod='POST')
    apigw.put_integration(restApiId=API_ID, resourceId=res_id, httpMethod='POST',
        type='AWS_PROXY', integrationHttpMethod='POST', uri=uri)
    print('Replaced POST integration')

# Method response
try:
    apigw.put_method_response(restApiId=API_ID, resourceId=res_id, httpMethod='POST', statusCode='200',
        responseParameters={'method.response.header.Access-Control-Allow-Origin': False})
except: pass

# OPTIONS for CORS
try:
    apigw.put_method(restApiId=API_ID, resourceId=res_id, httpMethod='OPTIONS',
        authorizationType='NONE', apiKeyRequired=False)
    print('Created OPTIONS method')
except apigw.exceptions.ConflictException:
    print('OPTIONS already exists')

try:
    apigw.put_integration(restApiId=API_ID, resourceId=res_id, httpMethod='OPTIONS',
        type='MOCK', requestTemplates={'application/json': '{"statusCode": 200}'})
    apigw.put_method_response(restApiId=API_ID, resourceId=res_id, httpMethod='OPTIONS', statusCode='200',
        responseParameters={
            'method.response.header.Access-Control-Allow-Headers': False,
            'method.response.header.Access-Control-Allow-Methods': False,
            'method.response.header.Access-Control-Allow-Origin': False,
        })
    apigw.put_integration_response(restApiId=API_ID, resourceId=res_id, httpMethod='OPTIONS', statusCode='200',
        responseParameters={
            'method.response.header.Access-Control-Allow-Headers': "'Content-Type,Authorization'",
            'method.response.header.Access-Control-Allow-Methods': "'POST,OPTIONS'",
            'method.response.header.Access-Control-Allow-Origin': "'*'",
        })
    print('OPTIONS CORS configured')
except Exception as e:
    print(f'OPTIONS setup note: {e}')

# Lambda permission
try:
    lmb.add_permission(
        FunctionName='joboss-ai-tailor',
        StatementId='AllowApiGatewayAnalyzeCV',
        Action='lambda:InvokeFunction',
        Principal='apigateway.amazonaws.com',
        SourceArn=f'arn:aws:execute-api:{REGION}:{ACCOUNT_ID}:{API_ID}/*/*/*',
    )
    print('Lambda permission added')
except lmb.exceptions.ResourceConflictException:
    print('Lambda permission already exists')

# Deploy
dep = apigw.create_deployment(restApiId=API_ID, stageName=STAGE)
print(f'Deployed: {dep["id"]}')
print('Done. POST /ai/analyze-cv is live.')
