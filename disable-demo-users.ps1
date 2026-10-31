# =============================================================================
#  disable-demo-users.ps1 - soft-disable the template demo accounts on Rose Hub
#  Why: the login page used to advertise demo accounts (password rose1234)
#       publicly, and those accounts exist in the production database.
#       This script soft-disables them: status=INACTIVE + all sessions revoked;
#       records stay in the database (nothing is deleted).
#       admin@rose.ir is NOT touched.
#  Usage:
#     powershell -NoProfile -ExecutionPolicy Bypass -File C:\disable-demo-users.ps1
#  Optional:
#     -HubUser admin@rose.ir -HubPass <current-admin-password> [-HubPort 8082]
#  NOTE: pure ASCII on purpose (PowerShell 5.1 encoding safety).
# =============================================================================
#requires -Version 5.1

param(
    [int]$HubPort = 8082,
    [string]$HubUser = "admin@rose.ir",
    [string]$HubPass = "rose1234"
)

$ErrorActionPreference = "Stop"
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

function Write-Ok($m)   { Write-Host "  [OK] $m" -ForegroundColor Green }
function Write-Info($m) { Write-Host "  [i] $m" -ForegroundColor Gray }
function Write-Err2($m) { Write-Host "  [X] $m" -ForegroundColor Red }

$demoEmails = @(
    "manager@rose.ir",
    "therapist@rose.ir",
    "h.ahmadi@rose.ir",
    "staff@rose.ir",
    "teacher@rose.ir",
    "it@rose.ir"
)

$hub = "http://127.0.0.1:$HubPort"

# ---------- 1) login ----------
try {
    Invoke-RestMethod -Method Post -Uri "$hub/api/auth/login" `
        -ContentType "application/json" `
        -Body (@{ email = $HubUser; password = $HubPass } | ConvertTo-Json) `
        -SessionVariable web -TimeoutSec 20 | Out-Null
    Write-Ok "Logged in to Rose Hub as $HubUser"
} catch {
    Write-Err2 "Login failed: $($_.Exception.Message)"
    Write-Info "If you already changed the admin password, pass it: -HubPass <new-password>"
    exit 1
}

# ---------- 2) list users ----------
try {
    $users = (Invoke-RestMethod -Method Get -Uri "$hub/api/users" -WebSession $web -TimeoutSec 30).users
} catch {
    Write-Err2 "Cannot list users: $($_.Exception.Message)"
    exit 1
}
Write-Ok "Total users in database: $($users.Count)"

# ---------- 3) soft-disable each demo account ----------
$disabled = 0
$already  = 0
foreach ($email in $demoEmails) {
    $u = $users | Where-Object { $_.email -eq $email } | Select-Object -First 1
    if (-not $u) { Write-Info "$email -> not found (skip)"; continue }
    if ($u.status -ne "ACTIVE") { Write-Info "$email -> already inactive (skip)"; $already++; continue }
    try {
        Invoke-RestMethod -Method Delete -Uri "$hub/api/users/$($u.id)" -WebSession $web -TimeoutSec 30 | Out-Null
        Write-Ok "$email -> disabled (INACTIVE, sessions revoked)"
        $disabled++
    } catch {
        Write-Err2 "$email -> failed: $($_.Exception.Message)"
    }
}

Write-Host ""
Write-Ok "Done. Disabled now: $disabled | already inactive: $already"
Write-Host ""
Write-Host "  IMPORTANT: also change the admin password (rose1234 was shown publicly):" -ForegroundColor Yellow
Write-Host "  Rose Hub -> profile icon -> profile page -> change password." -ForegroundColor Yellow
