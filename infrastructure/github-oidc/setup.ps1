# One-time setup: let GitHub Actions deploy without any stored AWS credentials.
#
# Creates two things:
#   1. An OIDC identity provider trusting token.actions.githubusercontent.com.
#      GitHub signs a short-lived token for each workflow run; AWS verifies it.
#   2. The joboss-github-deploy role, assumable ONLY by this repo's main branch,
#      holding only the permissions a frontend deploy needs (write the frontend
#      bucket, invalidate that one distribution). Nothing else.
#
# Why bother: deploys currently run from a laptop using the joboss-deploy IAM user,
# which holds AdministratorAccess via a long-lived access key. That key can do
# anything in the account, never expires, and lives on a development machine. After
# this, CI needs no key at all and can only touch the frontend.
#
# Idempotent — safe to re-run. Requires credentials that can write IAM.
#
#   powershell -ExecutionPolicy Bypass -File infrastructure\github-oidc\setup.ps1

$ErrorActionPreference = "Stop"

$Account   = "171109860478"
$RoleName  = "joboss-github-deploy"
$PolicyName = "joboss-frontend-deploy"
$Dir       = $PSScriptRoot
$ProviderArn = "arn:aws:iam::${Account}:oidc-provider/token.actions.githubusercontent.com"

function Test-AwsOk($step) {
    if ($LASTEXITCODE -ne 0) { Write-Error "FAILED: $step"; exit 1 }
}

# ── 1. OIDC provider ─────────────────────────────────────────────────────────
Write-Host "==> OIDC provider..." -ForegroundColor Cyan
$existing = aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[].Arn" --output text
if ($existing -like "*token.actions.githubusercontent.com*") {
    Write-Host "    already exists - skipping" -ForegroundColor DarkGray
} else {
    # The thumbprint is required by the API but no longer used for validation on
    # well-known providers; AWS pins GitHub's certificate chain itself.
    aws iam create-open-id-connect-provider `
        --url "https://token.actions.githubusercontent.com" `
        --client-id-list "sts.amazonaws.com" `
        --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1" `
        --query "OpenIDConnectProviderArn" --output text
    Test-AwsOk "create-open-id-connect-provider"
    Write-Host "    created" -ForegroundColor Green
}

# ── 2. Role ──────────────────────────────────────────────────────────────────
Write-Host "==> Role $RoleName..." -ForegroundColor Cyan
$roleExists = $true
try { aws iam get-role --role-name $RoleName --output json 2>$null | Out-Null } catch { $roleExists = $false }
if ($LASTEXITCODE -ne 0) { $roleExists = $false }

if ($roleExists) {
    Write-Host "    exists - updating trust policy" -ForegroundColor DarkGray
    aws iam update-assume-role-policy --role-name $RoleName `
        --policy-document "file://$Dir/trust-policy.json"
    Test-AwsOk "update-assume-role-policy"
} else {
    aws iam create-role --role-name $RoleName `
        --description "Deploys the JoBoss frontend from GitHub Actions on main. No long-lived keys." `
        --assume-role-policy-document "file://$Dir/trust-policy.json" `
        --max-session-duration 3600 `
        --query "Role.Arn" --output text
    Test-AwsOk "create-role"
    Write-Host "    created" -ForegroundColor Green
}

# ── 3. Permissions ───────────────────────────────────────────────────────────
Write-Host "==> Inline policy $PolicyName..." -ForegroundColor Cyan
aws iam put-role-policy --role-name $RoleName `
    --policy-name $PolicyName `
    --policy-document "file://$Dir/deploy-policy.json"
Test-AwsOk "put-role-policy"
Write-Host "    applied" -ForegroundColor Green

# ── 4. Report ────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Role ARN (already referenced by .github/workflows/deploy.yml):" -ForegroundColor Cyan
Write-Host "  arn:aws:iam::${Account}:role/${RoleName}"
Write-Host ""
Write-Host "Trusted subject - nothing else can assume this role:" -ForegroundColor Cyan
aws iam get-role --role-name $RoleName `
    --query "Role.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals" --output json
Write-Host ""
Write-Host "Next: push to main (or run the 'Deploy frontend' workflow manually)." -ForegroundColor Green
Write-Host "Then, once a CI deploy has succeeded, delete the laptop's admin key:" -ForegroundColor Yellow
Write-Host "  aws iam list-access-keys --user-name joboss-deploy"
Write-Host "  aws iam delete-access-key --user-name joboss-deploy --access-key-id <id>"
