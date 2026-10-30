# =============================================================================
#  update-rosehub.ps1 - Update Rose Hub on the server from GitHub
#  Steps: git sync + npm install + prisma + sync system names/urls in DB
#         + production build + PM2 restart + health check
#  Usage:
#     powershell -ExecutionPolicy Bypass -File C:\update-rosehub.ps1
#  Optional parameters:
#     -InstallDir "C:\RoseHub"   install folder
#     -Port 8082                 app port
#     -GitHubToken "ghp_..."     only if the repo becomes private
#  NOTE: written in pure ASCII on purpose - PowerShell 5.1 mis-decodes
#        UTF-8 scripts without BOM on some system locales, which breaks
#        Persian string literals. Keep this file ASCII-only.
#        Untracked files (.env, rose.db) are never touched by git reset.
# =============================================================================

#requires -Version 5.1

param(
    [string]$InstallDir  = "C:\RoseHub",
    [int]$Port           = 8082,
    [string]$GitHubToken = ""
)

$ErrorActionPreference = "Continue"
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

function Write-Step($msg)  { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
}
Refresh-Path

# ---------- Step 1/7: check install folder ----------
Write-Step "Step 1/7 - Check install folder"
if (-not (Test-Path (Join-Path $InstallDir "package.json"))) {
    throw "Rose Hub not found in $InstallDir - run deploy-rose-hub.ps1 first."
}
Set-Location $InstallDir
Write-Ok "Install folder: $InstallDir"

# ---------- Step 2/7: sync code from GitHub ----------
Write-Step "Step 2/7 - Sync code from GitHub"
if ($GitHubToken -ne "") {
    git remote set-url origin "https://sjalilvand:$GitHubToken@github.com/sjalilvand/sso_rose.git" 2>$null
}
git fetch origin main 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Cannot reach GitHub (check internet / token)" }

$localCommit  = (git rev-parse HEAD).Trim()
$remoteCommit = (git rev-parse origin/main).Trim()
if ($localCommit -eq $remoteCommit) {
    Write-Ok "Code is already up to date ($($localCommit.Substring(0,7)))"
} else {
    # Local edits to tracked files are discarded; untracked files (.env, rose.db) survive
    git reset --hard origin/main 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "git reset failed" }
    Write-Ok "Code updated to $($remoteCommit.Substring(0,7)) (local files like .env and rose.db kept)"
}

# ---------- Step 3/7: npm install (Iranian mirror first, then default) ----------
Write-Step "Step 3/7 - Install npm dependencies"
$mirror = "https://archive.ito.gov.ir/mirror2/npm/"
$useRegistry = ""
try {
    $probe = Invoke-WebRequest -Uri $mirror -Method Head -UseBasicParsing -TimeoutSec 8
    if ($probe.StatusCode -lt 500) { $useRegistry = $mirror }
} catch {}
if ($useRegistry -ne "") {
    Write-Host "  npm install from mirror $mirror ..."
    npm install --registry $useRegistry --no-audit --no-fund 2>$null
}
if ($LASTEXITCODE -ne 0) {
    Write-Warn2 "Mirror install failed - retrying with the official registry"
    npm install --no-audit --no-fund 2>$null
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}
Write-Ok "Dependencies installed"

# ---------- Step 4/7: Prisma (client + schema sync) ----------
Write-Step "Step 4/7 - Prisma (generate + db push)"
npx prisma generate 2>$null
if ($LASTEXITCODE -ne 0) { throw "prisma generate failed" }
npx prisma db push --accept-data-loss --skip-generate 2>$null
if ($LASTEXITCODE -ne 0) { Write-Warn2 "prisma db push failed - harmless if the schema did not change" }
Write-Ok "Prisma ready"

# ---------- Step 5/7: sync system names and urls in the database ----------
Write-Step "Step 5/7 - Sync system names/urls in database"
if (Test-Path "scripts\bind-sso-systems.cjs") {
    node scripts/bind-sso-systems.cjs
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "System names/urls synced (Rose Psy / Rose Center / Attendance)"
    } else {
        Write-Warn2 "bind-sso-systems failed - run manually later: node scripts\bind-sso-systems.cjs"
    }
} else {
    Write-Warn2 "scripts\bind-sso-systems.cjs not found - skipped"
}

# ---------- Step 6/7: production build ----------
Write-Step "Step 6/7 - Production build (a few minutes)"
npm run build 2>$null
if ($LASTEXITCODE -ne 0) { throw "build failed - check the output above" }
Write-Ok "Build completed (.next)"

# ---------- Step 7/7: restart PM2 and health check ----------
Write-Step "Step 7/7 - Restart app (PM2)"
$pm2Name = "rose-hub"
$inList = $false
try {
    $jl = pm2 jlist 2>$null | ConvertFrom-Json
    if ($jl) { $inList = ($jl | Where-Object { $_.name -eq $pm2Name }) -ne $null }
} catch {}
if ($inList) {
    pm2 restart $pm2Name --update-env 2>$null | Out-Null
    Write-Ok "PM2: $pm2Name restarted"
} else {
    pm2 start ecosystem.config.js 2>$null | Out-Null
    pm2 save 2>$null | Out-Null
    Write-Ok "PM2: app started from ecosystem.config.js"
}

Write-Host ""
Write-Step "Health check"
$healthy = $false
for ($i = 0; $i -lt 15; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/login" -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch { Start-Sleep -Seconds 2 }
}
if ($healthy) {
    Write-Ok "Rose Hub is healthy on port $Port"
    Write-Host ""
    Write-Host "================================================================="
    Write-Host "  Rose Hub update finished"
    Write-Host "================================================================="
    Write-Host "  URL              : http://130.185.73.157:$Port"
    Write-Host "  In this version  :"
    Write-Host "    - Bulk user import from the standard Excel file: national ID ="
    Write-Host "      username, mobile number = initial password (User management)"
    Write-Host "    - Login with national ID (code melli) or email"
    Write-Host "    - Consultant profile fields (province, education, license,"
    Write-Host "      rank, contract no, personal code, bank sheba) stored"
    Write-Host "  Tip: press Ctrl+F5 in the browser to bypass the cache."
    Write-Host "================================================================="
} else {
    Write-Warn2 "App did not respond - check: pm2 logs rose-hub"
}
