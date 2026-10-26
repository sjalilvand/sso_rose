# =====================================================================
#  رز هاب — ری‌استارت برنامه
#  نحوه اجرا:  powershell -ExecutionPolicy Bypass -File restart.ps1
# =====================================================================

$ErrorActionPreference = "Continue"
. (Join-Path $PSScriptRoot "config.ps1")

Write-Host ""
Write-Host "===== ری‌استارت رز هاب =====" -ForegroundColor Magenta

& (Join-Path $PSScriptRoot "stop.ps1")
Start-Sleep -Seconds 2
& (Join-Path $PSScriptRoot "start.ps1")
