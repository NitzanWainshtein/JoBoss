import os
import time
import zipfile
from pathlib import Path

import boto3
from botocore.exceptions import ClientError


REGION = os.getenv("AWS_REGION", "us-east-1")
FUNCTION_NAME = os.getenv("AI_FUNCTION_NAME", "joboss-ai-tailor")
API_NAME = os.getenv("API_NAME", "joboss-api")
API_ID = os.getenv("API_GATEWAY_ID", "")
API_STAGE = os.getenv("API_STAGE", "prod")
ROLE_ARN = os.getenv("LAMBDA_ROLE_ARN", "")
USERS_TABLE = os.getenv("USERS_TABLE", "joboss-users")
JOBS_TABLE = os.getenv("JOBS_TABLE", "joboss-jobs")
AI_MODE = os.getenv("AI_MODE", "bedrock")

ROOT_DIR = Path(__file__).resolve().parents[1]
HANDLER_PATH = ROOT_DIR / "backend" / "lambdas" / "ai" / "handler.py"
BUILD_DIR = ROOT_DIR / ".tmp_lambda"
ZIP_PATH = BUILD_DIR / f"{FUNCTION_NAME}.zip"

lambda_client = boto3.client("lambda", region_name=REGION)
api_client = boto3.client("apigateway", region_name=REGION)
s3_client = boto3.client("s3", region_name=REGION)
sts_client = boto3.client("sts", region_name=REGION)


def get_account_id():
    return sts_client.get_caller_identity()["Account"]


def get_resume_bucket_name():
    return os.getenv("RESUME_BUCKET_NAME", f"joboss-resumes-{get_account_id()}")


def ensure_resume_bucket():
    bucket_name = get_resume_bucket_name()

    try:
        s3_client.head_bucket(Bucket=bucket_name)
        print(f"Using existing resume bucket: {bucket_name}")
        return bucket_name
    except ClientError:
        pass

    s3_client.create_bucket(Bucket=bucket_name)
    s3_client.put_public_access_block(
        Bucket=bucket_name,
        PublicAccessBlockConfiguration={
            "BlockPublicAcls": True,
            "IgnorePublicAcls": True,
            "BlockPublicPolicy": True,
            "RestrictPublicBuckets": True,
        },
    )
    print(f"Created resume bucket: {bucket_name}")
    return bucket_name


def api_exists(api_id):
    if not api_id:
        return False

    try:
        api_client.get_rest_api(restApiId=api_id)
        return True
    except ClientError as error:
        if error.response["Error"]["Code"] == "NotFoundException":
            return False
        raise


def get_or_create_api_id():
    global API_ID

    if api_exists(API_ID):
        return API_ID

    apis = api_client.get_rest_apis(limit=500).get("items", [])
    existing_api = next((api for api in apis if api.get("name") == API_NAME), None)

    if existing_api:
        API_ID = existing_api["id"]
        print(f"Using existing API Gateway '{API_NAME}': {API_ID}")
        return API_ID

    api = api_client.create_rest_api(
        name=API_NAME,
        description="JoBoss serverless API",
        endpointConfiguration={"types": ["REGIONAL"]},
    )
    API_ID = api["id"]
    print(f"Created API Gateway '{API_NAME}': {API_ID}")
    return API_ID


def build_zip():
    if not HANDLER_PATH.exists():
        raise FileNotFoundError(f"Missing handler file: {HANDLER_PATH}")

    BUILD_DIR.mkdir(exist_ok=True)

    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as package:
        package.write(HANDLER_PATH, "handler.py")

    print(f"Built package: {ZIP_PATH}")


def lambda_exists():
    try:
        lambda_client.get_function(FunctionName=FUNCTION_NAME)
        return True
    except lambda_client.exceptions.ResourceNotFoundException:
        return False


def wait_for_lambda_update():
    for _ in range(30):
        config = lambda_client.get_function_configuration(FunctionName=FUNCTION_NAME)
        if config.get("LastUpdateStatus") != "InProgress":
            return
        time.sleep(2)


def deploy_lambda(resume_bucket):
    with ZIP_PATH.open("rb") as package:
        code_bytes = package.read()

    environment = {
        "Variables": {
            "USERS_TABLE": USERS_TABLE,
            "JOBS_TABLE": JOBS_TABLE,
            "RESUME_BUCKET_NAME": resume_bucket,
            "AI_MODE": AI_MODE,
        }
    }

    if lambda_exists():
        lambda_client.update_function_code(
            FunctionName=FUNCTION_NAME,
            ZipFile=code_bytes,
            Publish=True,
        )
        wait_for_lambda_update()
        lambda_client.update_function_configuration(
            FunctionName=FUNCTION_NAME,
            Handler="handler.lambda_handler",
            Runtime="python3.12",
            Timeout=30,
            MemorySize=256,
            Environment=environment,
        )
        wait_for_lambda_update()
        print(f"Updated Lambda: {FUNCTION_NAME}")
        return

    if not ROLE_ARN:
        raise ValueError("LAMBDA_ROLE_ARN is required when creating the Lambda.")

    lambda_client.create_function(
        FunctionName=FUNCTION_NAME,
        Runtime="python3.12",
        Role=ROLE_ARN,
        Handler="handler.lambda_handler",
        Code={"ZipFile": code_bytes},
        Description="JoBoss AI resume tailoring Lambda",
        Timeout=30,
        MemorySize=256,
        Publish=True,
        Environment=environment,
    )
    wait_for_lambda_update()
    print(f"Created Lambda: {FUNCTION_NAME}")


def get_lambda_uri():
    account_id = get_account_id()
    function_arn = f"arn:aws:lambda:{REGION}:{account_id}:function:{FUNCTION_NAME}"
    return (
        f"arn:aws:apigateway:{REGION}:lambda:path/2015-03-31/"
        f"functions/{function_arn}/invocations"
    )


def get_root_resource_id():
    resources = api_client.get_resources(restApiId=API_ID, limit=500)["items"]
    root = next(resource for resource in resources if resource["path"] == "/")
    return root["id"]


def get_resource_id(path_part, parent_id):
    resources = api_client.get_resources(restApiId=API_ID, limit=500)["items"]

    for resource in resources:
        if resource.get("parentId") == parent_id and resource.get("pathPart") == path_part:
            return resource["id"]

    resource = api_client.create_resource(
        restApiId=API_ID,
        parentId=parent_id,
        pathPart=path_part,
    )
    return resource["id"]


def put_proxy_method(resource_id, http_method):
    try:
        api_client.put_method(
            restApiId=API_ID,
            resourceId=resource_id,
            httpMethod=http_method,
            authorizationType="NONE",
        )
    except ClientError as error:
        if error.response["Error"]["Code"] != "ConflictException":
            raise

    api_client.put_integration(
        restApiId=API_ID,
        resourceId=resource_id,
        httpMethod=http_method,
        type="AWS_PROXY",
        integrationHttpMethod="POST",
        uri=get_lambda_uri(),
    )


def put_cors_options(resource_id):
    try:
        api_client.put_method(
            restApiId=API_ID,
            resourceId=resource_id,
            httpMethod="OPTIONS",
            authorizationType="NONE",
        )
    except ClientError as error:
        if error.response["Error"]["Code"] != "ConflictException":
            raise

    api_client.put_integration(
        restApiId=API_ID,
        resourceId=resource_id,
        httpMethod="OPTIONS",
        type="MOCK",
        requestTemplates={"application/json": '{"statusCode": 200}'},
    )

    try:
        api_client.put_method_response(
            restApiId=API_ID,
            resourceId=resource_id,
            httpMethod="OPTIONS",
            statusCode="200",
            responseParameters={
                "method.response.header.Access-Control-Allow-Headers": True,
                "method.response.header.Access-Control-Allow-Methods": True,
                "method.response.header.Access-Control-Allow-Origin": True,
            },
        )
    except ClientError as error:
        if error.response["Error"]["Code"] != "ConflictException":
            raise

    try:
        api_client.put_integration_response(
            restApiId=API_ID,
            resourceId=resource_id,
            httpMethod="OPTIONS",
            statusCode="200",
            responseParameters={
                "method.response.header.Access-Control-Allow-Headers": "'Content-Type,Authorization'",
                "method.response.header.Access-Control-Allow-Methods": "'POST,OPTIONS'",
                "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
        )
    except ClientError as error:
        if error.response["Error"]["Code"] != "ConflictException":
            raise


def allow_api_gateway_invoke():
    account_id = get_account_id()
    source_arn = f"arn:aws:execute-api:{REGION}:{account_id}:{API_ID}/*/*/ai/*"

    try:
        lambda_client.add_permission(
            FunctionName=FUNCTION_NAME,
            StatementId="AllowApiGatewayAiTailor",
            Action="lambda:InvokeFunction",
            Principal="apigateway.amazonaws.com",
            SourceArn=source_arn,
        )
    except ClientError as error:
        if error.response["Error"]["Code"] != "ResourceConflictException":
            raise


def deploy_api_route():
    root_id = get_root_resource_id()
    ai_id = get_resource_id("ai", root_id)
    tailor_id = get_resource_id("tailor", ai_id)

    put_proxy_method(tailor_id, "POST")
    put_cors_options(tailor_id)
    allow_api_gateway_invoke()

    deployment = api_client.create_deployment(
        restApiId=API_ID,
        stageName=API_STAGE,
        description="Deploy JoBoss AI tailoring route",
    )
    print(f"Deployed API Gateway stage '{API_STAGE}': {deployment['id']}")


def main():
    print(f"Deploying {FUNCTION_NAME} in {REGION}")
    get_or_create_api_id()
    print(f"API Gateway: {API_ID}/{API_STAGE}")
    resume_bucket = ensure_resume_bucket()
    build_zip()
    deploy_lambda(resume_bucket)
    deploy_api_route()
    print(f"API URL: https://{API_ID}.execute-api.{REGION}.amazonaws.com/{API_STAGE}")
    print("Done.")


if __name__ == "__main__":
    main()
