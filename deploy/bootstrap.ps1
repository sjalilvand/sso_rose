# =====================================================================
#  رز هاب — بوت‌استرپ (اولین اجرا روی سرور تازه)
#  این فایل فقط کافی است کد را بگیرد و deploy.ps1 اصلی را صدا بزند.
#
#  اجرای یک‌خطی در PowerShell با دسترسی Administrator:
#    [Net.ServicePointManager]::SecurityProtocol='Tls12';
#    irm https://raw.githubusercontent.com/sjalilvand/sso_rose/main/deploy/bootstrap.ps1 -OutFile "$env:TEMP\rose-hub-bootstrap.ps1";
#    powershell -ExecutionPolicy Bypass -File "$env:TEMP\rose-hub-bootstrap.ps1"
#
#  مسیر نصب دلخواه (اختیاری):
#    powershell -ExecutionPolicy Bypass -File "$env:TEMP\rose-hub-bootstrap.ps1" -BaseDir "C:\rose-hub"
# =====================================================================

param(
    [string]$BaseDir = ""
)

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
    Write-Host "      PowerShell را با «Run as Administrator» باز کنید و دوباره تلاش کنید." -ForegroundColor Yellow
    exit 1
}

# --- تابع تست قابل‌نوشتن بودن درایو (config.ps1 هنوز لود نشده؛ نسخه مستقل) ---
# توجه: وجود درایو کافی نیست! در سرورهای مجازی معمولاً D: یک درایو CD-ROM
# مجازی است یا قفل/بدون دسترسی — در این حالت باید به C: برگردیم.
function Test-DirWritable {
    param([string]$DriveRoot)
    try {
        $probe = Join-Path $DriveRoot ("rose-write-test-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
        New-Item -ItemType Directory -Path $probe -Force -ErrorAction Stop | Out-Null
        Remove-Item -Path $probe -Force -ErrorAction SilentlyContinue
        return $true
    } catch { return $false }
}

# --- انتخاب مسیر نصب ---
# 1) مقدار دستی از پارامتر -BaseDir
# 2) نصب موجود (app\.git) تا مسیر بین اجراها ثابت بماند
# 3) درایو D فقط اگر «واقعاً» قابل نوشتن باشد؛ وگرنه C
if (-not $BaseDir) {
    foreach ($c in @("D:\rose-hub", "C:\rose-hub")) {
        if (Test-Path (Join-Path $c "app\.git")) { $BaseDir = $c; break }
    }
}
if (-not $BaseDir) {
    foreach ($c in @("D:\rose-hub", "C:\rose-hub")) {
        $drive = (Split-Path -Path $c -Qualifier) + "\"
        if (-not (Test-Path $drive)) { continue }
        if (Test-DirWritable -DriveRoot $drive) { $BaseDir = $c; break }
        Write-Host ("[هشدار] درایو {0} قابل نوشتن نیست (احتمالاً CD-ROM مجازی یا بدون دسترسی است)؛ مسیر بعدی بررسی می‌شود..." -f $drive) -ForegroundColor Yellow
    }
}
if (-not $BaseDir) { $BaseDir = "C:\rose-hub" }

try {
    New-Item -ItemType Directory -Force -Path $BaseDir -ErrorAction Stop | Out-Null
} catch {
    Write-Host "[خطا] ساخت پوشه نصب در «$BaseDir» ممکن نشد: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "      راه‌حل: مسیر دلخواه را دستی بدهید:" -ForegroundColor Yellow
    Write-Host '      powershell -ExecutionPolicy Bypass -File "$env:TEMP\rose-hub-bootstrap.ps1" -BaseDir "C:\rose-hub"' -ForegroundColor Yellow
    exit 1
}
$AppDir = Join-Path $BaseDir "app"
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

# --- اجرای نصب اصلی (مسیر انتخابی صریحاً پاس داده می‌شود تا دوباره تشخیص داده نشود) ---
Write-Host "اجرای deploy.ps1 ..." -ForegroundColor Cyan
$deployArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $AppDir "deploy\deploy.ps1"), "-BaseDir", $BaseDir)
$deployArgs += @args
& powershell @deployArgs
exit $LASTEXITCODE
