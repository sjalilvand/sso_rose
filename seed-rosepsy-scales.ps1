# =============================================================================
#  seed-rosepsy-scales.ps1 - one-shot: seed psych test scales into Rosepsy DB
#  Why: on servers upgraded before deploy v1.0.25, the upgrade path ran
#       seed_psych_scales.py with the wrong working directory, so the scales
#       were never inserted (analytical multi-layer test reports fell back to
#       the bare gauge view). This helper runs the same idempotent seed with
#       the correct interpreter and working directory - no rebuild, no restart.
#  Usage:
#     powershell -NoProfile -ExecutionPolicy Bypass -File C:\seed-rosepsy-scales.ps1
#  No admin rights needed. Safe to re-run (idempotent).
#  NOTE: pure ASCII on purpose (PowerShell 5.1 encoding safety).
# =============================================================================
#requires -Version 5.1

param([string]$RosepsyDir = "C:\rosepsy")

$ErrorActionPreference = "Continue"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

function Write-Ok($m)   { Write-Host "  [OK] $m" -ForegroundColor Green }
function Write-Err2($m) { Write-Host "  [X] $m" -ForegroundColor Red }

$backend = Join-Path $RosepsyDir "app\backend"
$venvPy  = Join-Path $RosepsyDir "runtime\venv\Scripts\python.exe"
$seedPy  = Join-Path $backend "seed_psych_scales.py"

if (-not (Test-Path $venvPy)) { Write-Err2 "venv python not found: $venvPy"; exit 1 }
if (-not (Test-Path $seedPy)) { Write-Err2 "seed script not found: $seedPy"; exit 1 }
Write-Ok "venv python found"
Write-Ok "seed script found (backend\seed_psych_scales.py)"

# DATABASE_URL: same convention as rosepsy-server-native.ps1 (read backend\.env)
if (-not $env:DATABASE_URL) {
    $envFile = Join-Path $backend ".env"
    if (Test-Path $envFile) {
        foreach ($line in Get-Content $envFile) {
            if ($line -match '^\s*DATABASE_URL\s*=\s*(.+?)\s*$') {
                $env:DATABASE_URL = $Matches[1].Trim('"').Trim("'")
                break
            }
        }
    }
}
if (-not $env:DATABASE_URL) {
    Write-Err2 "DATABASE_URL not found in $backend\.env"
    exit 1
}
Write-Ok "DATABASE_URL loaded from backend\.env"

Write-Host ""
Write-Host "==> Seeding psych scales (idempotent, a few seconds) ..."
Push-Location $backend
try {
    & $venvPy ".\seed_psych_scales.py"
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Psych scales seeded - analytical multi-layer reports are now active"
    } else {
        Write-Err2 "Seed failed (exit code $LASTEXITCODE)"
        exit 1
    }
} finally { Pop-Location }
