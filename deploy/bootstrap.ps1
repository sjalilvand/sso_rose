# =====================================================================
#  رز هاب — بوت‌استرپ (اولین اجرا روی سرور تازه)
#  این فایل فقط کافی است کد را بگیرد و install.ps1 اصلی را صدا بزند.
#
#  اجرای یک‌خطی در PowerShell با دسترسی Administrator:
#    [Net.ServicePointManager]::SecurityProtocol='Tls12';
#    irm https://raw.githubusercontent.com/sjalilvand/sso_rose/main/deploy/bootstrap.ps1 -OutFile "$env:TEMP\rose-hub-bootstrap.ps1";
#    powershell -ExecutionPolicy Bypass -File "$env:TEMP\rose-hub-bootstrap.ps1"
# =====================================================================

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host ""
Write-Host "===== بوت‌استرپ رز هاب (Rose Hub) =====" -ForegroundColor Magenta
Write-Host ""

# --- دسترسی Administrator ---
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$pr = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "[خطا] این اسکریپت باید با دسترسی Administrator اجرا شود." -ForegroundColor Red
    exit 1
}

# --- مسیر نصب (همان منطق config.ps1) ---
if (Test-Path "D:\") { $BaseDir = "D:\rose-hub" } else { $BaseDir = "C:\rose-hub" }
$AppDir = Join-Path $BaseDir "app"
New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null
Write-Host ("مسیر نصب: {0}" -f $BaseDir) -ForegroundColor Cyan

# --- گیت ---
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[خطا] Git نصب نیست! ابتدا از https://git-scm.com/download/win نصبش کنید." -ForegroundColor Red
    exit 1
}

# --- کلون اولیه (بدون توکن؛ اگر ریپو خصوصی شود، deploy.ps1 با توکن همگام می‌کند) ---
if (-not (Test-Path (Join-Path $AppDir ".git"))) {
    Write-Host "کلون پروژه از GitHub..." -ForegroundColor Cyan
    git clone https://github.com/sjalilvand/sso_rose.git $AppDir
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[خطا] کلون ناموفق بود." -ForegroundColor Red
        exit 1
    }
}

# --- اجرای نصب اصلی ---
Write-Host "اجرای deploy.ps1 ..." -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $AppDir "deploy\deploy.ps1") @args
exit $LASTEXITCODE
