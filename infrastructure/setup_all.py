"""
JoBoss — Full installation script for a clean AWS account.

Usage:
    python infrastructure/setup_all.py

Optional env vars (for Stripe integration):
    STRIPE_SECRET_KEY
    STRIPE_WEBHOOK_SECRET
    STRIPE_PREMIUM_PRICE_ID
    STRIPE_PREMIUM_PLUS_PRICE_ID

Requirements:
    pip install boto3
    AWS credentials configured (aws configure)
"""

import json
import mimetypes
import os
import subprocess
import sys
import time
import zipfile
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

REGION = "us-east-1"
APP = "joboss"
ROOT = Path(__file__).resolve().parents[1]
BUILD_DIR = ROOT / ".tmp_lambda"

iam = boto3.client("iam", region_name=REGION)
cognito = boto3.client("cognito-idp", region_name=REGION)
dynamodb = boto3.client("dynamodb", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)
lmb = boto3.client("lambda", region_name=REGION)
apigw = boto3.client("apigateway", region_name=REGION)
cf = boto3.client("cloudfront", region_name=REGION)
sts = boto3.client("sts", region_name=REGION)


def account_id():
    return sts.get_caller_identity()["Account"]


def header(text):
    print(f"\n{'='*55}")
    print(f"  {text}")
    print(f"{'='*55}")


def ok(msg):
    print(f"  OK  {msg}")


def skip(msg):
    print(f"  --  {msg} (already exists)")


# ── Step 1: IAM Role ──────────────────────────────────────────────────────────

def step_1_iam():
    header("Step 1/9 — IAM Role")
    role_name = f"{APP}-lambda-role"

    try:
        role = iam.get_role(RoleName=role_name)
        skip(f"Role: {role_name}")
        return role["Role"]["Arn"]
    except iam.exceptions.NoSuchEntityException:
        pass

    trust = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "lambda.amazonaws.com"},
            "Action": "sts:AssumeRole"
        }]
    })

    role_arn = iam.create_role(
        RoleName=role_name,
        AssumeRolePolicyDocument=trust,
        Description="JoBoss Lambda execution role",
    )["Role"]["Arn"]

    for policy in [
        "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
        "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess",
        "arn:aws:iam::aws:policy/AmazonS3FullAccess",
        "arn:aws:iam::aws:policy/AmazonBedrockFullAccess",
    ]:
        iam.attach_role_policy(RoleName=role_name, PolicyArn=policy)

    ok(f"Created role: {role_arn}")
    print("  Waiting 15s for role to propagate...")
    time.sleep(15)
    return role_arn


# ── Step 2: Cognito ───────────────────────────────────────────────────────────

def step_2_cognito():
    header("Step 2/9 — Cognito User Pool")
    pool_name = f"{APP}-users"

    pools = cognito.list_user_pools(MaxResults=60).get("UserPools", [])
    existing = next((p for p in pools if p["Name"] == pool_name), None)

    if existing:
        pool_id = existing["Id"]
        skip(f"User Pool: {pool_id}")
    else:
        pool_id = cognito.create_user_pool(
            PoolName=pool_name,
            Policies={"PasswordPolicy": {
                "MinimumLength": 8,
                "RequireUppercase": True,
                "RequireLowercase": True,
                "RequireNumbers": True,
                "RequireSymbols": False,
            }},
            AutoVerifiedAttributes=["email"],
            UsernameAttributes=["email"],
        )["UserPool"]["Id"]
        ok(f"Created User Pool: {pool_id}")

    clients = cognito.list_user_pool_clients(
        UserPoolId=pool_id, MaxResults=60
    ).get("UserPoolClients", [])
    existing_client = next(
        (c for c in clients if c["ClientName"] == f"{APP}-web-client"), None
    )

    if existing_client:
        client_id = existing_client["ClientId"]
        skip(f"App Client: {client_id}")
    else:
        client_id = cognito.create_user_pool_client(
            UserPoolId=pool_id,
            ClientName=f"{APP}-web-client",
            ExplicitAuthFlows=[
                "ALLOW_USER_PASSWORD_AUTH",
                "ALLOW_USER_SRP_AUTH",
                "ALLOW_REFRESH_TOKEN_AUTH",
            ],
            GenerateSecret=False,
        )["UserPoolClient"]["ClientId"]
        ok(f"Created App Client: {client_id}")

    return pool_id, client_id


# ── Step 3: DynamoDB ──────────────────────────────────────────────────────────

def step_3_dynamo():
    header("Step 3/9 — DynamoDB Tables")
    tables = [
        {
            "TableName": f"{APP}-users",
            "KeySchema": [{"AttributeName": "userId", "KeyType": "HASH"}],
            "AttributeDefinitions": [{"AttributeName": "userId", "AttributeType": "S"}],
        },
        {
            "TableName": f"{APP}-jobs",
            "KeySchema": [{"AttributeName": "jobId", "KeyType": "HASH"}],
            "AttributeDefinitions": [{"AttributeName": "jobId", "AttributeType": "S"}],
        },
        {
            "TableName": f"{APP}-swipes",
            "KeySchema": [
                {"AttributeName": "userId", "KeyType": "HASH"},
                {"AttributeName": "jobId", "KeyType": "RANGE"},
            ],
            "AttributeDefinitions": [
                {"AttributeName": "userId", "AttributeType": "S"},
                {"AttributeName": "jobId", "AttributeType": "S"},
            ],
        },
        {
            "TableName": f"{APP}-applications",
            "KeySchema": [{"AttributeName": "applicationId", "KeyType": "HASH"}],
            "AttributeDefinitions": [
                {"AttributeName": "applicationId", "AttributeType": "S"}
            ],
        },
        {
            "TableName": f"{APP}-subscriptions",
            "KeySchema": [{"AttributeName": "userId", "KeyType": "HASH"}],
            "AttributeDefinitions": [{"AttributeName": "userId", "AttributeType": "S"}],
        },
        {
            "TableName": f"{APP}-usage",
            "KeySchema": [
                {"AttributeName": "userId", "KeyType": "HASH"},
                {"AttributeName": "monthKey", "KeyType": "RANGE"},
            ],
            "AttributeDefinitions": [
                {"AttributeName": "userId", "AttributeType": "S"},
                {"AttributeName": "monthKey", "AttributeType": "S"},
            ],
        },
    ]

    for t in tables:
        t["BillingMode"] = "PAY_PER_REQUEST"
        try:
            dynamodb.create_table(**t)
            ok(f"Created table: {t['TableName']}")
        except dynamodb.exceptions.ResourceInUseException:
            skip(t["TableName"])


# ── Step 4: S3 Resumes Bucket ─────────────────────────────────────────────────

def step_4_s3():
    header("Step 4/9 — S3 Resumes Bucket")
    bucket = f"{APP}-resumes-{account_id()}"

    try:
        s3.head_bucket(Bucket=bucket)
        skip(bucket)
        return bucket
    except ClientError:
        pass

    s3.create_bucket(Bucket=bucket)
    s3.put_public_access_block(
        Bucket=bucket,
        PublicAccessBlockConfiguration={
            "BlockPublicAcls": True,
            "IgnorePublicAcls": True,
            "BlockPublicPolicy": True,
            "RestrictPublicBuckets": True,
        },
    )
    ok(f"Created bucket: {bucket}")
    return bucket


# ── Step 5: API Gateway ───────────────────────────────────────────────────────

def step_5_api(pool_id):
    header("Step 5/9 — API Gateway")
    api_name = f"{APP}-api"

    apis = apigw.get_rest_apis(limit=500).get("items", [])
    existing = next((a for a in apis if a["name"] == api_name), None)

    if existing:
        api_id = existing["id"]
        skip(f"API: {api_id}")
    else:
        api_id = apigw.create_rest_api(
            name=api_name,
            description="JoBoss REST API",
            endpointConfiguration={"types": ["REGIONAL"]},
        )["id"]
        ok(f"Created API: {api_id}")

    authorizers = apigw.get_authorizers(restApiId=api_id).get("items", [])
    existing_auth = next(
        (a for a in authorizers if a["name"] == f"{APP}-cognito-auth"), None
    )

    if existing_auth:
        auth_id = existing_auth["id"]
        skip(f"Authorizer: {auth_id}")
    else:
        pool_arn = f"arn:aws:cognito-idp:{REGION}:{account_id()}:userpool/{pool_id}"
        auth_id = apigw.create_authorizer(
            restApiId=api_id,
            name=f"{APP}-cognito-auth",
            type="COGNITO_USER_POOLS",
            providerARNs=[pool_arn],
            identitySource="method.request.header.Authorization",
        )["id"]
        ok(f"Created authorizer: {auth_id}")

    return api_id, auth_id


# ── Step 6: Lambda Functions ──────────────────────────────────────────────────

def _build_zip(name, files):
    BUILD_DIR.mkdir(exist_ok=True)
    path = BUILD_DIR / f"{name}.zip"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        for local, arcname in files:
            zf.write(local, arcname)
    return path


def _lambda_exists(name):
    try:
        lmb.get_function(FunctionName=name)
        return True
    except lmb.exceptions.ResourceNotFoundException:
        return False


def _wait(name):
    for _ in range(40):
        cfg = lmb.get_function_configuration(FunctionName=name)
        if cfg.get("LastUpdateStatus") != "InProgress" and cfg.get("State") != "Pending":
            return
        time.sleep(3)


def _deploy(name, zip_path, role_arn, handler, env, description="", timeout=30, memory=256):
    code = zip_path.read_bytes()
    env_block = {"Variables": env}

    if _lambda_exists(name):
        lmb.update_function_code(FunctionName=name, ZipFile=code, Publish=True)
        _wait(name)
        lmb.update_function_configuration(
            FunctionName=name,
            Handler=handler,
            Runtime="python3.12",
            Timeout=timeout,
            MemorySize=memory,
            Environment=env_block,
        )
        _wait(name)
        skip(f"Lambda {name} (updated code)")
    else:
        lmb.create_function(
            FunctionName=name,
            Runtime="python3.12",
            Role=role_arn,
            Handler=handler,
            Code={"ZipFile": code},
            Description=description,
            Timeout=timeout,
            MemorySize=memory,
            Publish=True,
            Environment=env_block,
        )
        _wait(name)
        ok(f"Created Lambda: {name}")


def step_6_lambdas(role_arn, resume_bucket):
    header("Step 6/9 — Lambda Functions")
    L = ROOT / "backend" / "lambdas"

    definitions = [
        {
            "name": f"{APP}-users",
            "files": [(L / "users" / "handler.py", "handler.py")],
            "handler": "handler.lambda_handler",
            "env": {
                "USERS_TABLE_NAME": f"{APP}-users",
                "RESUME_BUCKET_NAME": resume_bucket,
            },
        },
        {
            "name": f"{APP}-jobs",
            "files": [(L / "jobs" / "handler.py", "handler.py")],
            "handler": "handler.lambda_handler",
            "env": {
                "JOBS_TABLE_NAME": f"{APP}-jobs",
                "USERS_TABLE_NAME": f"{APP}-users",
            },
        },
        {
            "name": f"{APP}-swipes",
            "files": [(L / "swipes" / "handler.py", "handler.py")],
            "handler": "handler.lambda_handler",
            "env": {
                "SWIPES_TABLE": f"{APP}-swipes",
                "APPLICATIONS_TABLE": f"{APP}-applications",
                "SUBSCRIPTIONS_TABLE": f"{APP}-subscriptions",
                "USERS_TABLE": f"{APP}-users",
                "JOBS_TABLE": f"{APP}-jobs",
            },
        },
        {
            "name": f"{APP}-applications",
            "files": [(L / "applications" / "handler.py", "handler.py")],
            "handler": "handler.lambda_handler",
            "env": {
                "APPLICATIONS_TABLE_NAME": f"{APP}-applications",
                "JOBS_TABLE_NAME": f"{APP}-jobs",
            },
        },
        {
            "name": f"{APP}-uploads",
            "files": [(L / "uploads" / "lambda_function.py", "lambda_function.py")],
            "handler": "lambda_function.lambda_handler",
            "env": {
                "BUCKET_NAME": resume_bucket,
                "USERS_TABLE_NAME": f"{APP}-users",
            },
        },
        {
            "name": f"{APP}-ai-tailor",
            "files": [(L / "ai" / "handler.py", "handler.py")],
            "handler": "handler.lambda_handler",
            "env": {
                "USERS_TABLE": f"{APP}-users",
                "JOBS_TABLE": f"{APP}-jobs",
                "RESUME_BUCKET_NAME": resume_bucket,
                "AI_MODE": "bedrock",
            },
            "timeout": 60,
            "memory": 512,
        },
        {
            "name": f"{APP}-profile-image",
            "files": [(L / "profile-image" / "handler.py", "handler.py")],
            "handler": "handler.handler",
            "env": {
                "BUCKET_NAME": resume_bucket,
                "USERS_TABLE_NAME": f"{APP}-users",
            },
        },
        {
            "name": f"{APP}-admin",
            "files": [(L / "admin" / "handler.py", "handler.py")],
            "handler": "handler.lambda_handler",
            "env": {
                "USERS_TABLE": f"{APP}-users",
                "APPS_TABLE": f"{APP}-applications",
                "SWIPES_TABLE": f"{APP}-swipes",
                "JOBS_TABLE": f"{APP}-jobs",
                "SUBS_TABLE": f"{APP}-subscriptions",
            },
        },
        {
            "name": f"{APP}-subscriptions",
            "files": [(L / "subscriptions" / "handler.py", "handler.py")],
            "handler": "handler.lambda_handler",
            "env": {
                "USERS_TABLE": f"{APP}-users",
                "SUBSCRIPTIONS_TABLE": f"{APP}-subscriptions",
                "USAGE_TABLE": f"{APP}-usage",
                "STRIPE_SECRET_KEY": os.getenv("STRIPE_SECRET_KEY", ""),
                "STRIPE_WEBHOOK_SECRET": os.getenv("STRIPE_WEBHOOK_SECRET", ""),
                "STRIPE_PREMIUM_PRICE_ID": os.getenv("STRIPE_PREMIUM_PRICE_ID", ""),
                "STRIPE_PREMIUM_PLUS_PRICE_ID": os.getenv("STRIPE_PREMIUM_PLUS_PRICE_ID", ""),
            },
        },
    ]

    for d in definitions:
        zip_path = _build_zip(d["name"], d["files"])
        _deploy(
            d["name"],
            zip_path,
            role_arn,
            d["handler"],
            d["env"],
            timeout=d.get("timeout", 30),
            memory=d.get("memory", 256),
        )


# ── Step 7: API Routes ────────────────────────────────────────────────────────

def _lambda_uri(name):
    arn = f"arn:aws:lambda:{REGION}:{account_id()}:function:{name}"
    return f"arn:aws:apigateway:{REGION}:lambda:path/2015-03-31/functions/{arn}/invocations"


def _root_id(api_id):
    items = apigw.get_resources(restApiId=api_id, limit=500)["items"]
    return next(r["id"] for r in items if r["path"] == "/")


def _resource(api_id, parent_id, part):
    items = apigw.get_resources(restApiId=api_id, limit=500)["items"]
    for r in items:
        if r.get("parentId") == parent_id and r.get("pathPart") == part:
            return r["id"]
    return apigw.create_resource(
        restApiId=api_id, parentId=parent_id, pathPart=part
    )["id"]


def _method(api_id, res_id, http_method, uri, auth_id=None):
    kwargs = {
        "restApiId": api_id,
        "resourceId": res_id,
        "httpMethod": http_method,
        "authorizationType": "COGNITO_USER_POOLS" if auth_id else "NONE",
    }
    if auth_id:
        kwargs["authorizerId"] = auth_id
    try:
        apigw.put_method(**kwargs)
    except ClientError as e:
        if e.response["Error"]["Code"] != "ConflictException":
            raise
    apigw.put_integration(
        restApiId=api_id, resourceId=res_id, httpMethod=http_method,
        type="AWS_PROXY", integrationHttpMethod="POST", uri=uri,
    )


def _cors(api_id, res_id, methods):
    try:
        apigw.put_method(
            restApiId=api_id, resourceId=res_id,
            httpMethod="OPTIONS", authorizationType="NONE",
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "ConflictException":
            raise
    apigw.put_integration(
        restApiId=api_id, resourceId=res_id, httpMethod="OPTIONS",
        type="MOCK", requestTemplates={"application/json": '{"statusCode":200}'},
    )
    params = {
        "method.response.header.Access-Control-Allow-Headers": True,
        "method.response.header.Access-Control-Allow-Methods": True,
        "method.response.header.Access-Control-Allow-Origin": True,
    }
    try:
        apigw.put_method_response(
            restApiId=api_id, resourceId=res_id, httpMethod="OPTIONS",
            statusCode="200", responseParameters=params,
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "ConflictException":
            raise
    try:
        apigw.put_integration_response(
            restApiId=api_id, resourceId=res_id, httpMethod="OPTIONS",
            statusCode="200",
            responseParameters={
                "method.response.header.Access-Control-Allow-Headers": "'Content-Type,Authorization'",
                "method.response.header.Access-Control-Allow-Methods": f"'{methods},OPTIONS'",
                "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "ConflictException":
            raise


def _allow_invoke(api_id, fn_name, path_pattern, sid):
    src = f"arn:aws:execute-api:{REGION}:{account_id()}:{api_id}/*/*{path_pattern}"
    try:
        lmb.add_permission(
            FunctionName=fn_name, StatementId=sid,
            Action="lambda:InvokeFunction",
            Principal="apigateway.amazonaws.com", SourceArn=src,
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceConflictException":
            raise


def step_7_routes(api_id, auth_id):
    header("Step 7/9 — API Routes")
    root = _root_id(api_id)

    # /jobs  /jobs/{jobId}
    jobs = _resource(api_id, root, "jobs")
    job_item = _resource(api_id, jobs, "{jobId}")
    _method(api_id, jobs, "GET", _lambda_uri(f"{APP}-jobs"), auth_id)
    _cors(api_id, jobs, "GET")
    _method(api_id, job_item, "GET", _lambda_uri(f"{APP}-jobs"), auth_id)
    _cors(api_id, job_item, "GET")
    _allow_invoke(api_id, f"{APP}-jobs", "/jobs*", "AllowApigwJobs")
    ok("/jobs")

    # /swipes  /swipes/me  /swipes/{jobId}  /swipes/quota
    swipes = _resource(api_id, root, "swipes")
    swipes_me = _resource(api_id, swipes, "me")
    swipes_item = _resource(api_id, swipes, "{jobId}")
    swipes_quota = _resource(api_id, swipes, "quota")
    _method(api_id, swipes, "POST", _lambda_uri(f"{APP}-swipes"), auth_id)
    _cors(api_id, swipes, "POST")
    _method(api_id, swipes_me, "GET", _lambda_uri(f"{APP}-swipes"), auth_id)
    _cors(api_id, swipes_me, "GET")
    _method(api_id, swipes_item, "DELETE", _lambda_uri(f"{APP}-swipes"), auth_id)
    _cors(api_id, swipes_item, "DELETE")
    _method(api_id, swipes_quota, "GET", _lambda_uri(f"{APP}-swipes"), auth_id)
    _cors(api_id, swipes_quota, "GET")
    _allow_invoke(api_id, f"{APP}-swipes", "/swipes*", "AllowApigwSwipes")
    ok("/swipes")

    # /applications
    apps = _resource(api_id, root, "applications")
    _method(api_id, apps, "GET", _lambda_uri(f"{APP}-applications"), auth_id)
    _method(api_id, apps, "POST", _lambda_uri(f"{APP}-applications"), auth_id)
    _method(api_id, apps, "PUT", _lambda_uri(f"{APP}-applications"), auth_id)
    _cors(api_id, apps, "GET,POST,PUT")
    _allow_invoke(api_id, f"{APP}-applications", "/applications*", "AllowApigwApps")
    ok("/applications")

    # /users/me
    users = _resource(api_id, root, "users")
    users_me = _resource(api_id, users, "me")
    _method(api_id, users_me, "GET", _lambda_uri(f"{APP}-users"), auth_id)
    _method(api_id, users_me, "POST", _lambda_uri(f"{APP}-users"), auth_id)
    _method(api_id, users_me, "PUT", _lambda_uri(f"{APP}-users"), auth_id)
    _cors(api_id, users_me, "GET,POST,PUT")
    _allow_invoke(api_id, f"{APP}-users", "/users*", "AllowApigwUsers")
    ok("/users/me")

    # /resumes/upload
    resumes = _resource(api_id, root, "resumes")
    upload = _resource(api_id, resumes, "upload")
    _method(api_id, upload, "POST", _lambda_uri(f"{APP}-uploads"), auth_id)
    _cors(api_id, upload, "POST")
    _allow_invoke(api_id, f"{APP}-uploads", "/resumes*", "AllowApigwUploads")
    ok("/resumes/upload")

    # /profile/image
    profile = _resource(api_id, root, "profile")
    image = _resource(api_id, profile, "image")
    _method(api_id, image, "POST", _lambda_uri(f"{APP}-profile-image"), auth_id)
    _cors(api_id, image, "POST")
    _allow_invoke(api_id, f"{APP}-profile-image", "/profile*", "AllowApigwProfileImage")
    ok("/profile/image")

    # /ai/tailor  (no auth — called with resume bytes)
    ai = _resource(api_id, root, "ai")
    tailor = _resource(api_id, ai, "tailor")
    _method(api_id, tailor, "POST", _lambda_uri(f"{APP}-ai-tailor"), auth_id)
    _cors(api_id, tailor, "POST")
    _allow_invoke(api_id, f"{APP}-ai-tailor", "/ai*", "AllowApigwAi")
    ok("/ai/tailor")

    # /subscriptions/me  /checkout  /consume
    subs = _resource(api_id, root, "subscriptions")
    subs_me = _resource(api_id, subs, "me")
    subs_checkout = _resource(api_id, subs, "checkout")
    subs_consume = _resource(api_id, subs, "consume")
    _method(api_id, subs_me, "GET", _lambda_uri(f"{APP}-subscriptions"), auth_id)
    _method(api_id, subs_me, "DELETE", _lambda_uri(f"{APP}-subscriptions"), auth_id)
    _cors(api_id, subs_me, "GET,DELETE")
    _method(api_id, subs_checkout, "POST", _lambda_uri(f"{APP}-subscriptions"), auth_id)
    _cors(api_id, subs_checkout, "POST")
    _method(api_id, subs_consume, "POST", _lambda_uri(f"{APP}-subscriptions"), auth_id)
    _cors(api_id, subs_consume, "POST")
    _allow_invoke(api_id, f"{APP}-subscriptions", "/subscriptions*", "AllowApigwSubs")
    ok("/subscriptions")

    # /admin/{proxy+}
    admin = _resource(api_id, root, "admin")
    admin_proxy = _resource(api_id, admin, "{proxy+}")
    _method(api_id, admin_proxy, "ANY", _lambda_uri(f"{APP}-admin"))
    _cors(api_id, admin_proxy, "GET,POST,PUT,DELETE")
    _allow_invoke(api_id, f"{APP}-admin", "/admin*", "AllowApigwAdmin")
    ok("/admin")

    apigw.create_deployment(
        restApiId=api_id, stageName="prod", description="JoBoss initial deployment"
    )
    url = f"https://{api_id}.execute-api.{REGION}.amazonaws.com/prod"
    ok(f"Deployed → {url}")
    return url


# ── Step 8: Frontend S3 Bucket ────────────────────────────────────────────────

def step_8_frontend_bucket():
    header("Step 8/9 — Frontend S3 + Build")
    bucket = f"{APP}-frontend-{account_id()}"

    try:
        s3.head_bucket(Bucket=bucket)
        skip(bucket)
    except ClientError:
        s3.create_bucket(Bucket=bucket)
        ok(f"Created bucket: {bucket}")

    s3.delete_public_access_block(Bucket=bucket)
    s3.put_bucket_website(
        Bucket=bucket,
        WebsiteConfiguration={
            "IndexDocument": {"Suffix": "index.html"},
            "ErrorDocument": {"Key": "index.html"},
        },
    )
    policy = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": f"arn:aws:s3:::{bucket}/*",
        }]
    })
    s3.put_bucket_policy(Bucket=bucket, Policy=policy)
    return bucket


def upload_frontend(bucket):
    dist = ROOT / "frontend" / "dist"
    if not dist.exists():
        print("  WARN  frontend/dist not found — skipping upload.")
        print("        Run: cd frontend && npm install && npm run build")
        return

    for root_dir, _, files in os.walk(dist):
        for file in files:
            local = Path(root_dir) / file
            key = local.relative_to(dist).as_posix()
            ctype, _ = mimetypes.guess_type(file)
            s3.upload_file(
                str(local), bucket, key,
                ExtraArgs={"ContentType": ctype or "application/octet-stream"},
            )
    ok(f"Uploaded frontend to s3://{bucket}")


# ── Step 9: CloudFront ────────────────────────────────────────────────────────

def step_9_cloudfront(bucket):
    header("Step 9/9 — CloudFront Distribution")
    origin_domain = f"{bucket}.s3-website-{REGION}.amazonaws.com"

    dists = cf.list_distributions().get("DistributionList", {}).get("Items", [])
    for d in dists:
        for o in d.get("Origins", {}).get("Items", []):
            if o.get("DomainName") == origin_domain:
                url = f"https://{d['DomainName']}"
                skip(f"CloudFront {url}")
                return url

    dist = cf.create_distribution(
        DistributionConfig={
            "CallerReference": f"{APP}-{int(time.time())}",
            "Origins": {
                "Quantity": 1,
                "Items": [{
                    "Id": "S3Origin",
                    "DomainName": origin_domain,
                    "CustomOriginConfig": {
                        "HTTPPort": 80, "HTTPSPort": 443,
                        "OriginProtocolPolicy": "http-only",
                    },
                }],
            },
            "DefaultCacheBehavior": {
                "TargetOriginId": "S3Origin",
                "ViewerProtocolPolicy": "redirect-to-https",
                "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
                "AllowedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]},
            },
            "DefaultRootObject": "index.html",
            "Enabled": True,
            "Comment": "JoBoss Frontend",
            "CustomErrorResponses": {
                "Quantity": 1,
                "Items": [{
                    "ErrorCode": 403, "ResponseCode": "200",
                    "ResponsePagePath": "/index.html",
                }],
            },
        }
    )
    url = f"https://{dist['Distribution']['DomainName']}"
    ok(f"Created CloudFront: {url}")
    print("  (takes ~10 min to deploy globally — app is usable before that)")
    return url


# ── Final: write .env and update Cognito callbacks ────────────────────────────

def finalize(pool_id, client_id, api_url, cloudfront_url):
    header("Finalizing")

    cognito.update_user_pool_client(
        UserPoolId=pool_id,
        ClientId=client_id,
        ExplicitAuthFlows=[
            "ALLOW_USER_PASSWORD_AUTH",
            "ALLOW_USER_SRP_AUTH",
            "ALLOW_REFRESH_TOKEN_AUTH",
        ],
        CallbackURLs=["http://localhost:5173", cloudfront_url],
        LogoutURLs=["http://localhost:5173", cloudfront_url],
    )
    ok("Updated Cognito callback URLs")

    env_path = ROOT / "frontend" / ".env"
    env_path.write_text(
        f"VITE_API_URL={api_url}\n"
        f"VITE_USER_POOL_ID={pool_id}\n"
        f"VITE_USER_POOL_CLIENT_ID={client_id}\n"
        f"VITE_CLOUDFRONT_URL={cloudfront_url}\n"
    )
    ok(f"Wrote frontend/.env")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("\n" + "="*55)
    print("  JoBoss — Full AWS Installation")
    print("="*55)

    role_arn = step_1_iam()
    pool_id, client_id = step_2_cognito()
    step_3_dynamo()
    resume_bucket = step_4_s3()
    api_id, auth_id = step_5_api(pool_id)
    step_6_lambdas(role_arn, resume_bucket)
    api_url = step_7_routes(api_id, auth_id)
    frontend_bucket = step_8_frontend_bucket()
    cloudfront_url = step_9_cloudfront(frontend_bucket)
    finalize(pool_id, client_id, api_url, cloudfront_url)

    print("\n" + "="*55)
    print("  INSTALLATION COMPLETE")
    print("="*55)
    print(f"\n  API URL:       {api_url}")
    print(f"  User Pool ID:  {pool_id}")
    print(f"  Client ID:     {client_id}")
    print(f"  CloudFront:    {cloudfront_url}")
    print(f"\n  frontend/.env written automatically.")
    print("\n  Next steps:")
    print("  1. cd frontend && npm install && npm run build")
    print("  2. python infrastructure/setup_all.py   (re-run to upload frontend)")
    print(f"  3. App: {cloudfront_url}")
    print()


if __name__ == "__main__":
    main()
