# =============================================================================
#  fix-rosepsy-roles.ps1 - Deploy SSO role mapping to Rosepsy (port 80) + verify
#  Problem: users entering Rosepsy via Rose Hub SSO had NO local role, so the
#           panel showed "Access denied." on /panel/dashboard (ports 8083 and
#           8085 were fine).
#  Fix:     special-spoon commit 489c319 - every rose-sso login now assigns
#           the equivalent local role (SUPER_ADMIN->SYSTEM_ADMIN,
#           UNIT_MANAGER->ORG_MANAGER, others->COUNSELOR).
#  This script:
#    1) runs the official Rosepsy native upgrade (git + build + migrate +
#       service restart) - a few minutes
#    2) runs an end-to-end SSO test from inside the server:
#       Rose Hub login -> SSO token -> Rosepsy rose-sso -> /auth/me roles
#  Usage:
#     powershell -ExecutionPolicy Bypass -File C:\fix-rosepsy-roles.ps1
#  Optional:
#     -SkipUpgrade            only run the SSO verification
#     -HubUser admin@rose.ir -HubPass rose1234
#  NOTE: pure ASCII on purpose (PowerShell 5.1 encoding safety).
# =============================================================================

#requires -Version 5.1

param(
    [string]$RosepsyDir = "C:\rosepsy",
    [int]$HubPort       = 8082,
    [string]$HubUser    = "admin@rose.ir",
    [string]$HubPass    = "rose1234",
    [switch]$SkipUpgrade
)

$ErrorActionPreference = "Continue"
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

function Write-Step($m) { Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Ok($m)   { Write-Host "  [OK] $m" -ForegroundColor Green }
function Write-Warn2($m){ Write-Host "  [!] $m" -ForegroundColor Yellow }
function Write-Err2($m) { Write-Host "  [X] $m" -ForegroundColor Red }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Err2 "Run this script in PowerShell 'Run as Administrator'."
    exit 1
}

# ---------- 1) deploy ----------
if (-not $SkipUpgrade) {
    Write-Step "Step 1/2 - Rosepsy native upgrade (git + build + migrate + restart)"
    $native = Join-Path $RosepsyDir "app\deploy\rosepsy-server-native.ps1"
    if (-not (Test-Path $native)) {
        Write-Err2 "Native script not found: $native"
        Write-Warn2 "If Rosepsy is installed elsewhere, pass -RosepsyDir"
        exit 1
    }
    Write-Host "  This takes a few minutes (site + panel builds)..."
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $native -Mode upgrade
    if ($LASTEXITCODE -eq 0) { Write-Ok "Rosepsy upgrade finished" }
    else { Write-Warn2 "Upgrade exit code: $LASTEXITCODE - verification will show the real state" }
} else {
    Write-Step "Step 1/2 - Skipped (-SkipUpgrade)"
}

# ---------- 2) end-to-end SSO verification ----------
Write-Step "Step 2/2 - End-to-end SSO test (Rose Hub -> Rosepsy roles)"

$hub = "http://127.0.0.1:$HubPort"
try {
    $login = Invoke-RestMethod -Method Post -Uri "$hub/api/auth/login" `
        -ContentType "application/json" `
        -Body (@{ email = $HubUser; password = $HubPass } | ConvertTo-Json) `
        -SessionVariable web -TimeoutSec 20
    Write-Ok "Rose Hub login: $($login.user.name)"
} catch {
    Write-Err2 "Rose Hub login failed: $($_.Exception.Message)"
    exit 1
}

try {
    $resp = Invoke-RestMethod -Method Get -Uri "$hub/api/systems" -WebSession $web -TimeoutSec 20
    $systems = $resp.systems
} catch {
    Write-Err2 "Cannot read systems list: $($_.Exception.Message)"
    exit 1
}
$psy = $systems | Where-Object { $_.url -match "^http://130\.185\.73\.157(:80)?/?$" } | Select-Object -First 1
if (-not $psy) {
    Write-Err2 "Rosepsy system (port 80) not found in Rose Hub systems list:"
    $systems | ForEach-Object { Write-Host "    - $($_.name) -> $($_.url)" }
    exit 1
}
Write-Ok "Target system: $($psy.name) -> $($psy.url)"

try {
    $sso = Invoke-RestMethod -Method Post -Uri "$hub/api/systems/$($psy.id)/sso" -WebSession $web -TimeoutSec 20
    Write-Ok "SSO token issued (expires $($sso.expiresAt))"
} catch {
    Write-Err2 "SSO token request failed: $($_.Exception.Message)"
    exit 1
}

try {
    $sess = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1/api/v1/auth/rose-sso" `
        -ContentType "application/json" `
        -Body (@{ token = $sso.token } | ConvertTo-Json) -TimeoutSec 20
    Write-Ok "Rosepsy accepted the token (session opened)"
} catch {
    $code = ""
    try { $code = [int]$_.Exception.Response.StatusCode } catch {}
    Write-Err2 "Rosepsy rejected the SSO token (HTTP $code): $($_.Exception.Message)"
    exit 1
}

try {
    $me = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1/api/v1/auth/me" `
        -Headers @{ Authorization = "Bearer $($sess.access_token)" } -TimeoutSec 20
} catch {
    Write-Err2 "Cannot read /auth/me: $($_.Exception.Message)"
    exit 1
}

Write-Host ""
Write-Host "  Rosepsy user : $($me.email)"
Write-Host "  Local roles  : $($me.roles -join ', ')"
if ($me.roles -and $me.roles.Count -gt 0) {
    Write-Ok "SUCCESS - SSO user now has local roles; /panel/dashboard will open"
    Write-Host ""
    Write-Host "  Browser test: open http://130.185.73.157:8082 , log in, click Rosepsy."
    Write-Host "  Press Ctrl+F5 on the panel page if the old error is cached."
} else {
    Write-Err2 "FAILED - SSO user still has no local roles. Is the Rosepsy API on the new code?"
    Write-Warn2 "Check: pm2/jlist equivalent - services rosepsy-* ; or re-run without -SkipUpgrade"
}
