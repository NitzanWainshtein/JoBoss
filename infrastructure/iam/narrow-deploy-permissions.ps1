# Replaces joboss-deploy's AdministratorAccess with a policy scoped to exactly
# what infrastructure/deploy/deploy_all.py, audit_lambdas.py, and the
# deploy_frontend.ps1 break-glass path actually call. AdministratorAccess can do
# anything in the account; a "deploy" credential should not be able to.
#
# Order of operations matters and is the whole point of this script. The identity
# running this IS joboss-deploy (aws configure was pointed at it), so detaching
# AdministratorAccess before confirming the narrow policy is sufficient would risk
# this exact session losing the ability to fix its own mistake — including losing
# the ability to re-attach AdministratorAccess, since that action itself would no
# longer be permitted.
#
# So: simulate the new policy FIRST (proves it grants what's needed, touches
# nothing live) -> attach it for real (additive, safe on its own) -> confirm it
# stuck -> ask for explicit confirmation -> only then detach AdministratorAccess ->
# smoke-test with a real, harmless, read-only call.
#
# If step 6 ever fails: log into the AWS Console as root or another admin
# principal (NOT joboss-deploy, which may no longer be able to) and run:
#   aws iam attach-user-policy --user-name joboss-deploy `
#     --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
#
#   powershell -ExecutionPolicy Bypass -File infrastructure\iam\narrow-deploy-permissions.ps1

$ErrorActionPreference = "Stop"

$UserName   = "joboss-deploy"
$PolicyName = "joboss-deploy-scoped"
$AdminArn   = "arn:aws:iam::aws:policy/AdministratorAccess"
$Dir        = $PSScriptRoot
$PolicyFile = Join-Path $Dir "joboss-deploy-policy.json"

function Fail($msg) { Write-Error $msg; exit 1 }

Write-Host "==> Confirming current identity..." -ForegroundColor Cyan
$identity = aws sts get-caller-identity --query "Arn" --output text
Write-Host "    $identity"
if ($identity -notlike "*user/$UserName") {
    Fail "This must be run authenticated AS $UserName (current: $identity) — the safety ordering below depends on it."
}

# ── 1. Simulate BEFORE touching anything live ────────────────────────────────
Write-Host "`n==> Simulating the new policy (nothing is changed yet)..." -ForegroundColor Cyan

$actions = @(
    "lambda:GetFunction", "lambda:GetFunctionConfiguration", "lambda:UpdateFunctionCode"
)
$resources = @(
    "arn:aws:lambda:us-east-1:171109860478:function:joboss-jobs",
    "arn:aws:lambda:us-east-1:171109860478:function:joboss-swipes",
    "arn:aws:lambda:us-east-1:171109860478:function:joboss-users"
)

$sim = aws iam simulate-custom-policy `
    --policy-input-list "file://$PolicyFile" `
    --action-names $actions `
    --resource-arns $resources `
    --output json | ConvertFrom-Json

$denied = $sim.EvaluationResults | Where-Object { $_.EvalDecision -ne "allowed" }
if ($denied) {
    Write-Host "    Simulation found denials:" -ForegroundColor Red
    $denied | ForEach-Object { Write-Host "      $($_.EvalActionName) on $($_.EvalResourceName): $($_.EvalDecision)" }
    Fail "The policy document does not grant what deploy_all.py needs. Fix joboss-deploy-policy.json and re-run — nothing was changed."
}
Write-Host "    All $($actions.Count * $resources.Count) sampled action/resource pairs: allowed" -ForegroundColor Green

# ── 2. Attach the narrow policy (additive — safe even if something's still wrong) ──
Write-Host "`n==> Attaching the scoped inline policy..." -ForegroundColor Cyan
aws iam put-user-policy --user-name $UserName --policy-name $PolicyName `
    --policy-document "file://$PolicyFile"
if ($LASTEXITCODE -ne 0) { Fail "put-user-policy failed — AdministratorAccess is untouched, nothing to roll back." }

$check = aws iam get-user-policy --user-name $UserName --policy-name $PolicyName --query "PolicyName" --output text
if ($check -ne $PolicyName) { Fail "Policy did not attach as expected — AdministratorAccess is untouched." }
Write-Host "    Attached and confirmed." -ForegroundColor Green

# ── 3. The irreversible-from-this-session step ───────────────────────────────
Write-Host "`n==> About to detach AdministratorAccess from $UserName." -ForegroundColor Yellow
Write-Host "    From this point, this identity can ONLY do what joboss-deploy-scoped allows."
Write-Host "    Recovery if something is wrong requires a DIFFERENT admin identity (see this file's header)."
$confirm = Read-Host "    Type 'yes' to proceed"
if ($confirm -ne "yes") {
    Write-Host "Aborted. The scoped policy is attached, but AdministratorAccess is still there too — nothing is narrower yet." -ForegroundColor Yellow
    exit 0
}

aws iam detach-user-policy --user-name $UserName --policy-arn $AdminArn
if ($LASTEXITCODE -ne 0) { Fail "detach-user-policy failed. AdministratorAccess may still be attached — check with: aws iam list-attached-user-policies --user-name $UserName" }
Write-Host "    Detached." -ForegroundColor Green

# ── 4. Prove it actually works now, for real ──────────────────────────────────
Write-Host "`n==> Smoke test: a real, read-only call under the new (and only) policy..." -ForegroundColor Cyan
$fn = aws lambda get-function --function-name joboss-jobs --query "Configuration.FunctionName" --output text 2>&1
if ($LASTEXITCODE -ne 0 -or $fn -ne "joboss-jobs") {
    Write-Host "    FAILED: $fn" -ForegroundColor Red
    Write-Host "    joboss-deploy can no longer call AWS as expected. Recover via a DIFFERENT admin identity:" -ForegroundColor Red
    Write-Host "      aws iam attach-user-policy --user-name $UserName --policy-arn $AdminArn"
    exit 1
}
Write-Host "    OK — read joboss-jobs successfully." -ForegroundColor Green

Write-Host "`nDone. joboss-deploy now holds only:" -ForegroundColor Green
Write-Host "  - update the 11 named Lambdas (get + update-function-code)"
Write-Host "  - list Lambdas (for audit_lambdas.py)"
Write-Host "  - write the frontend S3 bucket + invalidate its CloudFront distribution (break-glass only)"
Write-Host "`nNo longer possible with this credential: anything outside those, including modifying its own IAM permissions."
Write-Host "Adding a 12th Lambda later means editing infrastructure/iam/joboss-deploy-policy.json and re-running"
Write-Host "'aws iam put-user-policy' with an admin identity — joboss-deploy cannot grant itself more."
