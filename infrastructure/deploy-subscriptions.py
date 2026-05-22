import os
import time
import zipfile
from pathlib import Path

import boto3
from botocore.exceptions import ClientError


REGION = os.getenv("AWS_REGION", "us-east-1")
FUNCTION_NAME = os.getenv("SUBSCRIPTIONS_FUNCTION_NAME", "joboss-subscriptions")
USERS_TABLE = os.getenv("USERS_TABLE", "joboss-users")
API_NAME = os.getenv("API_NAME", "joboss-api")
API_ID = os.getenv("API_GATEWAY_ID", "")
API_STAGE = os.getenv("API_STAGE", "prod")
ROLE_ARN = os.getenv("LAMBDA_ROLE_ARN", "")
AUTHORIZER_ID = os.getenv("COGNITO_AUTHORIZER_ID", "")

ROOT_DIR = Path(__file__).resolve().parents[1]
HANDLER_PATH = ROOT_DIR / "backend" / "lambdas" / "subscriptions" / "handler.py"
BUILD_DIR = ROOT_DIR / ".tmp_lambda"
ZIP_PATH = BUILD_DIR / f"{FUNCTION_NAME}.zip"

lambda_client = boto3.client("lambda", region_name=REGION)
api_client = boto3.client("apigateway", region_name=REGION)
sts_client = boto3.client("sts", region_name=REGION)


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

    if API_ID:
        print(f"API Gateway '{API_ID}' was not found. Looking for '{API_NAME}' instead.")

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

        last_update_status = config.get("LastUpdateStatus")
        state = config.get("State")

        if last_update_status != "InProgress" and state != "Pending":
            return

        time.sleep(2)


def deploy_lambda():
    with ZIP_PATH.open("rb") as package:
        code_bytes = package.read()

    environment_variables = {
        "USERS_TABLE": USERS_TABLE,
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
            Timeout=15,
            MemorySize=128,
            Environment={
                "Variables": environment_variables
            },
        )
        wait_for_lambda_update()

        print(f"Updated Lambda: {FUNCTION_NAME}")
        return

    if not ROLE_ARN:
        raise ValueError(
            "LAMBDA_ROLE_ARN is required when creating the Lambda for the first time."
        )

    lambda_client.create_function(
        FunctionName=FUNCTION_NAME,
        Runtime="python3.12",
        Role=ROLE_ARN,
        Handler="handler.lambda_handler",
        Code={"ZipFile": code_bytes},
        Description="JoBoss subscriptions Lambda",
        Timeout=15,
        MemorySize=128,
        Publish=True,
        Environment={
            "Variables": environment_variables
        },
    )

    wait_for_lambda_update()
    print(f"Created Lambda: {FUNCTION_NAME}")


def get_account_id():
    return sts_client.get_caller_identity()["Account"]


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


def discover_authorizer_id():
    if AUTHORIZER_ID:
        return AUTHORIZER_ID

    authorizers = api_client.get_authorizers(restApiId=API_ID).get("items", [])

    cognito_authorizer = next(
        (
            authorizer
            for authorizer in authorizers
            if authorizer.get("type") == "COGNITO_USER_POOLS"
        ),
        None,
    )

    if cognito_authorizer:
        return cognito_authorizer["id"]

    if authorizers:
        return authorizers[0]["id"]

    return ""


def put_proxy_method(resource_id, http_method, authorizer_id):
    authorization_type = "COGNITO_USER_POOLS" if authorizer_id else "NONE"

    method_args = {
        "restApiId": API_ID,
        "resourceId": resource_id,
        "httpMethod": http_method,
        "authorizationType": authorization_type,
    }

    if authorizer_id:
        method_args["authorizerId"] = authorizer_id

    try:
        api_client.put_method(**method_args)
    except ClientError as error:
        if error.response["Error"]["Code"] != "ConflictException":
            raise

        patch_operations = [
            {
                "op": "replace",
                "path": "/authorizationType",
                "value": authorization_type
            }
        ]

        if authorizer_id:
            patch_operations.append(
                {
                    "op": "replace",
                    "path": "/authorizerId",
                    "value": authorizer_id
                }
            )

        api_client.update_method(
            restApiId=API_ID,
            resourceId=resource_id,
            httpMethod=http_method,
            patchOperations=patch_operations,
        )

    api_client.put_integration(
        restApiId=API_ID,
        resourceId=resource_id,
        httpMethod=http_method,
        type="AWS_PROXY",
        integrationHttpMethod="POST",
        uri=get_lambda_uri(),
    )


def put_or_update_method_response(resource_id, http_method):
    response_parameters = {
        "method.response.header.Access-Control-Allow-Headers": True,
        "method.response.header.Access-Control-Allow-Methods": True,
        "method.response.header.Access-Control-Allow-Origin": True,
    }

    try:
        api_client.put_method_response(
            restApiId=API_ID,
            resourceId=resource_id,
            httpMethod=http_method,
            statusCode="200",
            responseParameters=response_parameters,
        )
    except ClientError as error:
        if error.response["Error"]["Code"] != "ConflictException":
            raise


def put_or_update_integration_response(resource_id, http_method, allowed_methods):
    response_parameters = {
        "method.response.header.Access-Control-Allow-Headers": "'Content-Type,Authorization'",
        "method.response.header.Access-Control-Allow-Methods": f"'{allowed_methods},OPTIONS'",
        "method.response.header.Access-Control-Allow-Origin": "'*'",
    }

    try:
        api_client.put_integration_response(
            restApiId=API_ID,
            resourceId=resource_id,
            httpMethod=http_method,
            statusCode="200",
            responseParameters=response_parameters,
        )
    except ClientError as error:
        if error.response["Error"]["Code"] != "ConflictException":
            raise


def put_cors_options(resource_id, allowed_methods):
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

    put_or_update_method_response(resource_id, "OPTIONS")
    put_or_update_integration_response(resource_id, "OPTIONS", allowed_methods)


def allow_api_gateway_invoke():
    account_id = get_account_id()
    source_arn = f"arn:aws:execute-api:{REGION}:{account_id}:{API_ID}/*/*/subscriptions*"

    try:
        lambda_client.add_permission(
            FunctionName=FUNCTION_NAME,
            StatementId="AllowApiGatewaySubscriptions",
            Action="lambda:InvokeFunction",
            Principal="apigateway.amazonaws.com",
            SourceArn=source_arn,
        )
    except ClientError as error:
        if error.response["Error"]["Code"] != "ResourceConflictException":
            raise


def deploy_api_routes():
    root_id = get_root_resource_id()

    subscriptions_id = get_resource_id("subscriptions", root_id)
    me_id = get_resource_id("me", subscriptions_id)
    checkout_id = get_resource_id("checkout", subscriptions_id)
    consume_id = get_resource_id("consume", subscriptions_id)

    authorizer_id = discover_authorizer_id()

    if authorizer_id:
        print(f"Using API Gateway authorizer: {authorizer_id}")
    else:
        print("No API Gateway authorizer found. Routes will be created without auth.")

    put_proxy_method(me_id, "GET", authorizer_id)
    put_proxy_method(me_id, "DELETE", authorizer_id)
    put_proxy_method(checkout_id, "POST", authorizer_id)
    put_proxy_method(consume_id, "POST", authorizer_id)

    put_cors_options(me_id, "GET,DELETE")
    put_cors_options(checkout_id, "POST")
    put_cors_options(consume_id, "POST")

    allow_api_gateway_invoke()

    deployment = api_client.create_deployment(
        restApiId=API_ID,
        stageName=API_STAGE,
        description="Deploy JoBoss subscriptions routes",
    )

    print(f"Deployed API Gateway stage '{API_STAGE}': {deployment['id']}")


def main():
    global API_ID

    print(f"Deploying {FUNCTION_NAME} in {REGION}")

    API_ID = get_or_create_api_id()

    print(f"API Gateway: {API_ID}/{API_STAGE}")
    print(f"Lambda role: {ROLE_ARN}")

    build_zip()
    deploy_lambda()
    deploy_api_routes()

    print(f"API URL: https://{API_ID}.execute-api.{REGION}.amazonaws.com/{API_STAGE}")
    print("Done.")


if __name__ == "__main__":
    main()
