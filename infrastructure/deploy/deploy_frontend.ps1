# JoBoss frontend deploy — builds and uploads to S3 with per-type cache headers,
# then invalidates CloudFront.
#
# Cache strategy:
#   index.html        -> no-cache (users always get the newest HTML)
#   assets/* (JS/CSS) -> 1 year, immutable (Vite content-hashes the filenames)
#   icons/* + images  -> 1 hour (updates propagate within the hour)
#
# IMPORTANT: never run a plain catch-all `aws s3 sync dist/ s3://...` after the
# typed uploads — a fresh build changes every file's mtime, so sync would
# re-upload everything WITHOUT Cache-Control and undo the headers below.

$ErrorActionPreference = "Stop"

$Bucket = "joboss-frontend-171109860478"
$DistributionId = "E1E8CVAQ0HQE8E"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Dist = Join-Path $RepoRoot "frontend\dist"

function Fail-IfError($step) {
    if ($LASTEXITCODE -ne 0) { Write-Error "FAILED: $step"; exit 1 }
}

# 1. Build
Write-Host "==> Building frontend..." -ForegroundColor Cyan
Push-Location (Join-Path $RepoRoot "frontend")
npx vite build
Fail-IfError "vite build"
Pop-Location

if (-not (Test-Path (Join-Path $Dist "index.html"))) {
    Write-Error "dist/index.html not found - build failed?"; exit 1
}

# 2. JS/CSS bundles — cache forever (filenames carry a content hash)
Write-Host "==> Uploading hashed assets (1y immutable)..." -ForegroundColor Cyan
aws s3 sync "$Dist\assets" "s3://$Bucket/assets" `
    --cache-control "public, max-age=31536000, immutable" --delete
Fail-IfError "sync assets"

# 3. Icons — short cache so updated icons reach users within an hour.
#    NOTE: `cp --recursive` (not sync) — vite preserves public/ file mtimes, so
#    sync skips "unchanged" files and they'd keep stale/missing cache headers.
if (Test-Path (Join-Path $Dist "icons")) {
    Write-Host "==> Uploading icons (1h cache)..." -ForegroundColor Cyan
    aws s3 cp "$Dist\icons" "s3://$Bucket/icons" --recursive `
        --cache-control "public, max-age=3600"
    Fail-IfError "upload icons"
    # Separate pass just to remove icons deleted locally (sync only for --delete).
    aws s3 sync "$Dist\icons" "s3://$Bucket/icons" --delete `
        --cache-control "public, max-age=3600"
    Fail-IfError "sync-delete icons"
}

# 4. Everything else at the root (app_logo.png, manifest.json, favicon...) — 1h.
#    Excludes the dirs/files already handled above so their headers survive.
Write-Host "==> Uploading remaining root files (1h cache)..." -ForegroundColor Cyan
aws s3 cp "$Dist" "s3://$Bucket" --recursive `
    --exclude "assets/*" --exclude "icons/*" --exclude "index.html" `
    --cache-control "public, max-age=3600"
Fail-IfError "upload root files"

# 5. index.html LAST (so it never references assets that aren't uploaded yet)
#    and never cached.
Write-Host "==> Uploading index.html (no-cache)..." -ForegroundColor Cyan
aws s3 cp "$Dist\index.html" "s3://$Bucket/index.html" `
    --cache-control "no-cache, no-store, must-revalidate" --content-type "text/html"
Fail-IfError "upload index.html"

# 6. Invalidate CloudFront so the new versions are served immediately
Write-Host "==> Creating CloudFront invalidation..." -ForegroundColor Cyan
aws cloudfront create-invalidation --distribution-id $DistributionId --paths "/*" --query "Invalidation.Id" --output text
Fail-IfError "cloudfront invalidation"

Write-Host "==> Deploy complete." -ForegroundColor Green
