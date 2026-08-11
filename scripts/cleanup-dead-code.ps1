# One-off cleanup of dead files and directories found in the 2026-08-12 audit.
#
# Everything here was verified unreferenced before being listed. Anything that
# turned out to still be in use was rescued first and is NOT in this script:
#   .tmp_lambda/stripe_pkg      -> backend/lambdas/subscriptions/vendor  (live deploy dep)
#   .tmp_lambda/setup_sqs.py    -> infrastructure/auto-apply/            (only copy)
#   .tmp_lambda/setup_fargate.py, build_and_push.sh, deploy_auto_apply.py -> same
#   .tmp_lambda/fix_waf_body_size.py, add_analyze_cv_route.py -> infrastructure/
#   .tmp_lambda/backfill_descriptions.py -> backend/scripts/
#
# Run from the repo root:
#   powershell -ExecutionPolicy Bypass -File scripts/cleanup-dead-code.ps1 -WhatIf
#   powershell -ExecutionPolicy Bypass -File scripts/cleanup-dead-code.ps1
#
# -WhatIf prints what would happen without touching anything. Run that first.

[CmdletBinding(SupportsShouldProcess = $true)]
param()

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# ── Directories ───────────────────────────────────────────────────────────────
# .tmp_lambda      100+ ad-hoc probe/smoke/deploy scripts, 10 zips, extracted_*.jsx
#                  copies of pages. Newest file predates the audit by 6+ weeks.
#                  Everything still needed was moved out first (see header).
# integration      Design-migration staging folder, already applied and since
#                  diverged (SubscriptionPage differs by 390 lines from the real
#                  one). Stale duplicates of live pages invite editing the wrong file.
# lambda-upload-resume  Completely empty.
# .pytest_cache    Regenerated on every test run; should never have been on disk here.
$deadDirs = @(
    ".tmp_lambda",
    "integration",
    "lambda-upload-resume",
    ".pytest_cache"
)

# ── Files ─────────────────────────────────────────────────────────────────────
$deadFiles = @(
    # Zero references anywhere in src/
    "frontend\src\data\mockjobs.js",
    "frontend\src\utils\locationUtils.js",
    "frontend\src\utils\pdfText.js",
    "frontend\src\assets\hero.png",
    "frontend\src\assets\react.svg",
    "frontend\src\assets\vite.svg",
    # Not referenced by any component, manifest or stylesheet
    "frontend\public\icons\settings_icon.png",
    "frontend\public\icons\undo_icon.png",
    "frontend\public\icons\swipes_icons\Refresh_bar.png",
    # One-off scripts left in the tree
    "frontend\screenshot_test.cjs",
    "frontend\screenshot_test.mjs",
    # The '_new' that stopped being new; deploy packages are built from source
    "backend\lambdas\swipes\handler_new.zip"
)

function Remove-Target($relative, $isDir) {
    $full = Join-Path $root $relative
    if (-not (Test-Path $full)) {
        Write-Host "  (already gone) $relative" -ForegroundColor DarkGray
        return
    }
    if ($PSCmdlet.ShouldProcess($relative, "Remove")) {
        if ($isDir) { Remove-Item -Recurse -Force $full } else { Remove-Item -Force $full }
        Write-Host "  removed $relative" -ForegroundColor Green
    }
}

Write-Host "`n== Directories ==" -ForegroundColor Cyan
foreach ($d in $deadDirs) { Remove-Target $d $true }

Write-Host "`n== Files ==" -ForegroundColor Cyan
foreach ($f in $deadFiles) { Remove-Target $f $false }

# frontend/src/context/ is an empty leftover directory — only remove it if it is
# genuinely empty, so this never eats a file someone added in the meantime.
$ctx = Join-Path $root "frontend\src\context"
if ((Test-Path $ctx) -and -not (Get-ChildItem $ctx -Force)) {
    Remove-Target "frontend\src\context" $true
}

Write-Host "`nDone. Next:" -ForegroundColor Cyan
Write-Host "  git status                       # integration/ shows as deleted (it was tracked)"
Write-Host "  cd frontend; npm run build       # confirm nothing referenced what went"
Write-Host "  python -m pytest backend/tests -q"
