"""
setup_support.py — provision the "Contact us" / support-tickets feature.

    python infrastructure/setup_support.py            # dry run: prints what it WOULD do
    python infrastructure/setup_support.py --apply    # actually creates / updates

Idempotent: safe to re-run. What --apply does:

  1. DynamoDB table  joboss-support-tickets   (PK userId, SK ticketId, on-demand)
  2. Lambda          joboss-support           (backend/lambdas/support/handler.py),
                     reusing the execution role of joboss-users
  3. IAM inline policy "joboss-support-access" on that role AND on joboss-admin's
     role: read/write the tickets table + ses:SendEmail
  4. API Gateway (JoBossApi pi6i87ag1c): /support  GET|POST|PUT (Cognito) + OPTIONS,
     lambda invoke permission, and a new deployment of stage `prod`
  5. Sets SUPPORT_TABLE on joboss-admin (keeps every other env var as-is)

After this, deploy the code with:
    python infrastructure/deploy/deploy_all.py admin support

Nothing here touches existing tables, routes or user data.
"""
import io
import json
import sys
import time
import zipfile
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

REGION = "us-east-1"
API_ID = "pi6i87ag1c"
AUTHORIZER_ID = "jko97e"
STAGE = "prod"
TABLE = "joboss-support-tickets"
FN = "joboss-support"
ROLE_SOURCE_FN = "joboss-users"
ADMIN_FN = "joboss-admin"
POLICY_NAME = "joboss-support-access"
ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "backend" / "lambdas" / "support" / "handler.py"

APPLY = "--apply" in sys.argv

ddb = boto3.client("dynamodb", region_name=REGION)
lam = boto3.client("lambda", region_name=REGION)
iam = boto3.client("iam", region_name=REGION)
apigw = boto3.client("apigateway", region_name=REGION)
sts = boto3.client("sts", region_name=REGION)


def step(msg):
    print(("  DO   " if APPLY else "  PLAN ") + msg)


def account():
    return sts.get_caller_identity()["Account"]


# 1 ── table ──────────────────────────────────────────────────────────────────
def ensure_table():
    try:
        ddb.describe_table(TableName=TABLE)
        print(f"  ok   table {TABLE} exists")
        return
    except ddb.exceptions.ResourceNotFoundException:
        pass
    step(f"create table {TABLE} (userId HASH, ticketId RANGE, PAY_PER_REQUEST)")
    if not APPLY:
        return
    ddb.create_table(
        TableName=TABLE,
        AttributeDefinitions=[{"AttributeName": "userId", "AttributeType": "S"},
                              {"AttributeName": "ticketId", "AttributeType": "S"}],
        KeySchema=[{"AttributeName": "userId", "KeyType": "HASH"},
                   {"AttributeName": "ticketId", "KeyType": "RANGE"}],
        BillingMode="PAY_PER_REQUEST",
        Tags=[{"Key": "app", "Value": "joboss"}],
    )
    ddb.get_waiter("table_exists").wait(TableName=TABLE)


# 2+3 ── role, policy, lambda ─────────────────────────────────────────────────
def role_name_of(fn):
    return lam.get_function_configuration(FunctionName=fn)["Role"].split("/")[-1]


def ensure_policy(role_name):
    doc = {
        "Version": "2012-10-17",
        "Statement": [
            {"Effect": "Allow",
             "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
                        "dynamodb:Query", "dynamodb:Scan"],
             "Resource": f"arn:aws:dynamodb:{REGION}:{account()}:table/{TABLE}"},
            {"Effect": "Allow", "Action": ["ses:SendEmail", "ses:SendRawEmail"], "Resource": "*"},
        ],
    }
    step(f"put inline policy {POLICY_NAME} on role {role_name}")
    if APPLY:
        iam.put_role_policy(RoleName=role_name, PolicyName=POLICY_NAME, PolicyDocument=json.dumps(doc))


def wait_fn(name):
    for _ in range(40):
        cfg = lam.get_function_configuration(FunctionName=name)
        if cfg.get("State") != "Pending" and cfg.get("LastUpdateStatus") != "InProgress":
            return
        time.sleep(3)


def ensure_lambda(role_arn):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(SRC, "handler.py")
    try:
        lam.get_function(FunctionName=FN)
        print(f"  ok   lambda {FN} exists (code is deployed by deploy_all.py)")
        return
    except lam.exceptions.ResourceNotFoundException:
        pass
    step(f"create lambda {FN} (python3.12, role {role_arn.split('/')[-1]})")
    if not APPLY:
        return
    for attempt in range(6):  # a freshly-updated role can take a few seconds to propagate
        try:
            lam.create_function(
                FunctionName=FN, Runtime="python3.12", Role=role_arn,
                Handler="handler.lambda_handler", Code={"ZipFile": buf.getvalue()},
                Description="JoBoss contact-us / support tickets (user side)",
                Timeout=15, MemorySize=256, Publish=True,
                Environment={"Variables": {"SUPPORT_TABLE": TABLE}},
            )
            break
        except ClientError as e:
            if e.response["Error"]["Code"] != "InvalidParameterValueException" or attempt == 5:
                raise
            time.sleep(5)
    wait_fn(FN)


def ensure_admin_env():
    cfg = lam.get_function_configuration(FunctionName=ADMIN_FN)
    env = (cfg.get("Environment") or {}).get("Variables", {})
    if env.get("SUPPORT_TABLE") == TABLE:
        print(f"  ok   {ADMIN_FN} SUPPORT_TABLE already set")
        return
    step(f"set SUPPORT_TABLE={TABLE} on {ADMIN_FN} (other env vars kept)")
    if APPLY:
        env["SUPPORT_TABLE"] = TABLE
        lam.update_function_configuration(FunctionName=ADMIN_FN, Environment={"Variables": env})
        wait_fn(ADMIN_FN)


# 4 ── API Gateway ────────────────────────────────────────────────────────────
def ensure_route():
    items = apigw.get_resources(restApiId=API_ID, limit=500)["items"]
    root = next(r["id"] for r in items if r["path"] == "/")
    res = next((r for r in items if r["path"] == "/support"), None)
    if res is None:
        step("create resource /support")
        if not APPLY:
            print("  PLAN methods GET|POST|PUT (Cognito) + OPTIONS mock, invoke permission, deploy stage prod")
            return
        res = apigw.create_resource(restApiId=API_ID, parentId=root, pathPart="support")
    res_id = res["id"]
    existing = set((res.get("resourceMethods") or {}).keys())

    fn_arn = f"arn:aws:lambda:{REGION}:{account()}:function:{FN}"
    uri = f"arn:aws:apigateway:{REGION}:lambda:path/2015-03-31/functions/{fn_arn}/invocations"
    for m in ("GET", "POST", "PUT"):
        if m in existing:
            print(f"  ok   /support {m} exists")
            continue
        step(f"/support {m} -> {FN} (Cognito authorizer {AUTHORIZER_ID})")
        if APPLY:
            apigw.put_method(restApiId=API_ID, resourceId=res_id, httpMethod=m,
                             authorizationType="COGNITO_USER_POOLS", authorizerId=AUTHORIZER_ID)
            apigw.put_integration(restApiId=API_ID, resourceId=res_id, httpMethod=m,
                                  type="AWS_PROXY", integrationHttpMethod="POST", uri=uri)

    if "OPTIONS" not in existing:
        step("/support OPTIONS (CORS mock)")
        if APPLY:
            apigw.put_method(restApiId=API_ID, resourceId=res_id, httpMethod="OPTIONS", authorizationType="NONE")
            apigw.put_integration(restApiId=API_ID, resourceId=res_id, httpMethod="OPTIONS",
                                  type="MOCK", requestTemplates={"application/json": '{"statusCode":200}'})
            params = {f"method.response.header.Access-Control-Allow-{h}": True for h in ("Headers", "Methods", "Origin")}
            apigw.put_method_response(restApiId=API_ID, resourceId=res_id, httpMethod="OPTIONS",
                                      statusCode="200", responseParameters=params)
            apigw.put_integration_response(
                restApiId=API_ID, resourceId=res_id, httpMethod="OPTIONS", statusCode="200",
                responseParameters={
                    "method.response.header.Access-Control-Allow-Headers": "'Content-Type,Authorization'",
                    "method.response.header.Access-Control-Allow-Methods": "'GET,POST,PUT,OPTIONS'",
                    "method.response.header.Access-Control-Allow-Origin": "'*'",
                })

    step(f"allow API {API_ID} to invoke {FN}")
    if APPLY:
        try:
            lam.add_permission(
                FunctionName=FN, StatementId="apigw-support",
                Action="lambda:InvokeFunction", Principal="apigateway.amazonaws.com",
                SourceArn=f"arn:aws:execute-api:{REGION}:{account()}:{API_ID}/*/*/support",
            )
        except ClientError as e:
            if e.response["Error"]["Code"] != "ResourceConflictException":
                raise

    step(f"create deployment of stage {STAGE}")
    if APPLY:
        apigw.create_deployment(restApiId=API_ID, stageName=STAGE, description="add /support (contact us)")


def main():
    print(f"\nJoBoss support tickets — {'APPLY' if APPLY else 'DRY RUN (pass --apply to execute)'}\n")
    ensure_table()
    user_role = role_name_of(ROLE_SOURCE_FN)
    admin_role = role_name_of(ADMIN_FN)
    ensure_policy(user_role)
    if admin_role != user_role:
        ensure_policy(admin_role)
    ensure_lambda(lam.get_function_configuration(FunctionName=ROLE_SOURCE_FN)["Role"])
    ensure_admin_env()
    ensure_route()
    print("\nNext: python infrastructure/deploy/deploy_all.py admin support\n")


if __name__ == "__main__":
    main()
