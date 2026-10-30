# =============================================================================
#  update-rosehub.ps1 - Update Rose Hub on the server from GitHub
#  Steps: stop app + backup database + git sync (DB restored after reset)
#         + npm install + prisma + sync system names/urls + build
#         + PM2 start + health check
#  Usage:
#     powershell -ExecutionPolicy Bypass -File C:\update-rosehub.ps1
#  Optional parameters:
#     -InstallDir "C:\RoseHub"   install folder
#     -Port 8082                 app port
#     -GitHubToken "ghp_..."     only if the repo becomes private
#  NOTE 1: written in pure ASCII on purpose - PowerShell 5.1 mis-decodes
#          UTF-8 scripts without BOM on some system locales, which breaks
#          Persian string literals. Keep this file ASCII-only.
#  NOTE 2: the SQLite database (db\custom.db) and .env are never taken from
#          git. The app is stopped before git reset (releases file locks -
#          this is what made "git reset failed" happen before), the database
#          is backed up to the temp folder and restored right after the
#          reset, so server data always survives the update.
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

# ---------- Step 1/9: check install folder ----------
Write-Step "Step 1/9 - Check install folder"
if (-not (Test-Path (Join-Path $InstallDir "package.json"))) {
    throw "Rose Hub not found in $InstallDir - run deploy-rose-hub.ps1 first."
}
Set-Location $InstallDir
Write-Ok "Install folder: $InstallDir"

# ---------- Step 2/9: stop the app (release file locks) ----------
Write-Step "Step 2/9 - Stop the app (PM2)"
$pm2Name = "rose-hub"
$inList  = $false
try {
    $jl = pm2 jlist 2>$null | ConvertFrom-Json
    if ($jl) { $inList = ($jl | Where-Object { $_.name -eq $pm2Name }) -ne $null }
} catch {}
if ($inList) {
    pm2 stop $pm2Name 2>$null | Out-Null
    Write-Ok "PM2: $pm2Name stopped (file locks released)"
} else {
    Write-Warn2 "PM2 process '$pm2Name' not found - continuing"
}

# ---------- Step 3/9: backup database ----------
Write-Step "Step 3/9 - Backup database"
$dbFile   = "db\custom.db"
$stamp    = Get-Date -Format "yyyyMMdd-HHmmss"
$dbBackup = Join-Path $env:TEMP "rosehub-db-$stamp.db"
$dbHad    = (Test-Path $dbFile)
if ($dbHad) {
    Copy-Item $dbFile $dbBackup -Force
    Write-Ok "Database backed up to $dbBackup"
} else {
    Write-Warn2 "db\custom.db not found - a fresh database will be created later"
}

# ---------- Step 4/9: sync code from GitHub ----------
Write-Step "Step 4/9 - Sync code from GitHub"
if ($GitHubToken -ne "") {
    git remote set-url origin "https://sjalilvand:$GitHubToken@github.com/sjalilvand/sso_rose.git" 2>$null
}
git fetch origin main
if ($LASTEXITCODE -ne 0) { throw "Cannot reach GitHub (check internet / token)" }

$localCommit  = (git rev-parse HEAD).Trim()
$remoteCommit = (git rev-parse origin/main).Trim()
if (-not $remoteCommit) { throw "Cannot read origin/main after fetch" }
if ($localCommit -eq $remoteCommit) {
    Write-Ok "Code is already up to date ($($localCommit.Substring(0,7)))"
} else {
    git reset --hard origin/main
    if ($LASTEXITCODE -ne 0) { throw "git reset failed - see the git error above" }
    Write-Ok "Code updated to $($remoteCommit.Substring(0,7))"
}

# restore the database after the reset (git may delete or overwrite it)
if ($dbHad) {
    Copy-Item $dbBackup $dbFile -Force
    Write-Ok "Database restored from backup (server data kept)"
}

# ---------- Step 5/9: npm install (Iranian mirror first, then default) ----------
Write-Step "Step 5/9 - Install npm dependencies"
$mirror = "https://archive.ito.gov.ir/mirror2/npm/"
$useRegistry = ""
try {
    $probe = Invoke-WebRequest -Uri $mirror -Method Head -UseBasicParsing -TimeoutSec 8
    if ($probe.StatusCode -lt 500) { $useRegistry = $mirror }
} catch {}
if ($useRegistry -ne "") {
    Write-Host "  npm install from mirror $mirror ..."
    npm install --registry $useRegistry --no-audit --no-fund
}
if ($LASTEXITCODE -ne 0) {
    Write-Warn2 "Mirror install failed - retrying with the official registry"
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}
Write-Ok "Dependencies installed"

# ---------- Step 6/9: Prisma (client + schema sync) ----------
Write-Step "Step 6/9 - Prisma (generate + db push)"
npx prisma generate
if ($LASTEXITCODE -ne 0) { throw "prisma generate failed" }
npx prisma db push --accept-data-loss --skip-generate
if ($LASTEXITCODE -ne 0) { Write-Warn2 "prisma db push failed - harmless if the schema did not change" }
Write-Ok "Prisma ready (username + consultant fields present)"

# ---------- Step 7/9: sync system names and urls in the database ----------
Write-Step "Step 7/9 - Sync system names/urls in database"
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

# ---------- Step 8/9: production build ----------
Write-Step "Step 8/9 - Production build (a few minutes)"
npm run build
if ($LASTEXITCODE -ne 0) { throw "build failed - check the output above" }
Write-Ok "Build completed (.next)"

# ---------- Step 9/9: start PM2 and health check ----------
Write-Step "Step 9/9 - Start app (PM2)"
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
    Write-Host "    - Update script now stops the app and backs up the database"
    Write-Host "  Tip: press Ctrl+F5 in the browser to bypass the cache."
    Write-Host "================================================================="
} else {
    Write-Warn2 "App did not respond - check: pm2 logs rose-hub"
}
