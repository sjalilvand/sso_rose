# =====================================================================
#  رز هاب — به‌روزرسانی از GitHub و ری‌استارت برنامه
#
#  نحوه اجرا:  powershell -ExecutionPolicy Bypass -File update.ps1
#  پارامترها:  -SkipBuild   (بدون build مجدد)
#
#  این اسکریپت:
#    1) کد را از GitHub همگام می‌کند (مطابق main)
#    2) پکیج‌های جدید را نصب می‌کند (در صورت تغییر)
#    3) Prisma Client را دوباره می‌سازد
#    4) build جدید می‌گیرد
#    5) سرویس را ری‌استارت می‌کند
#  توجه: دیتابیس زنده (db\custom.db) هرگز دست نمی‌خورد.
# =====================================================================

param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
. (Join-Path $PSScriptRoot "config.ps1")

Write-Host ""
Write-Host "===== به‌روزرسانی رز هاب (Rose Hub) =====" -ForegroundColor Magenta
Write-Host ""

if (-not (Test-Path (Join-Path $AppDir ".git"))) {
    Write-Host "[خطا] پروژه هنوز نصب نشده است. ابتدا deploy.ps1 را اجرا کنید." -ForegroundColor Red
    exit 1
}

# ---------- 1) همگام‌سازی کد ----------
Write-Host "[1/4] دریافت آخرین تغییرات از GitHub ..." -ForegroundColor Cyan
git -C $AppDir fetch origin --prune
if ($LASTEXITCODE -ne 0) {
    Write-Host "[خطا] git fetch ناموفق بود (اینترنت یا توکن را بررسی کنید)." -ForegroundColor Red
    Write-Host "      برای ثبت توکن جدید:  powershell -File set-token.ps1 -Token <TOKEN>" -ForegroundColor Yellow
    exit 1
}

$local  = git -C $AppDir rev-parse HEAD
$remote = git -C $AppDir rev-parse "origin/$Branch"
if ("$local" -eq "$remote") {
    Write-Host "      کد از قبل به‌روز است ($($local.Substring(0,7)))." -ForegroundColor Green
} else {
    Write-Host ("      به‌روزرسانی: {0} -> {1}" -f $local.Substring(0,7), $remote.Substring(0,7)) -ForegroundColor Yellow
    git -C $AppDir reset --hard "origin/$Branch"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[خطا] git reset ناموفق بود." -ForegroundColor Red
        exit 1
    }
}

# توکن در remote (برای pullهای بعدی)
$tok = Get-GitToken
if ($tok) {
    git -C $AppDir remote set-url origin ("https://{0}@github.com/{1}/{2}.git" -f $tok, $RepoOwner, $RepoName) | Out-Null
}

# ---------- توقف سرویس قبل از build ----------
$taskExists = $false
try { $taskExists = [bool](Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) } catch {}
if ($taskExists) {
    Write-Host "      توقف موقت سرویس (برای build امن)..." -ForegroundColor Gray
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# ---------- 2) پکیج‌ها و Prisma ----------
Set-Location $AppDir
Write-Host "[2/4] نصب/به‌روزرسانی پکیج‌ها (npm install)..." -ForegroundColor Cyan
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Write-Host "[خطا] npm install ناموفق بود." -ForegroundColor Red; exit 1 }

Write-Host "      ساخت Prisma Client..." -ForegroundColor Cyan
npx prisma generate
if ($LASTEXITCODE -ne 0) { Write-Host "[خطا] prisma generate ناموفق بود." -ForegroundColor Red; exit 1 }

# ---------- 3) build ----------
$buildIdPath = Join-Path $AppDir ".next\BUILD_ID"
if ($SkipBuild -and (Test-Path $buildIdPath)) {
    Write-Host "[3/4] build قبلی حفظ شد (-SkipBuild)." -ForegroundColor Yellow
} else {
    Write-Host "[3/4] build نسخه جدید (npm run build)..." -ForegroundColor Cyan
    $env:NODE_OPTIONS = "--max-old-space-size=4096"
    npm run build
    Remove-Item Env:\NODE_OPTIONS -ErrorAction SilentlyContinue
    if ($LASTEXITCODE -ne 0) { Write-Host "[خطا] npm run build ناموفق بود." -ForegroundColor Red; exit 1 }
}

# ---------- اطمینان از وجود دیتابیس و کلید امنیتی (برای نصب‌های ناقص) ----------
if (-not (Test-Path (Join-Path $AppDir "db\custom.db"))) {
    New-Item -ItemType Directory -Force -Path (Join-Path $AppDir "db") | Out-Null
    Copy-Item (Join-Path $AppDir "deploy\db-template\custom.db") (Join-Path $AppDir "db\custom.db")
    Write-Host "      دیتابیس از تمپلیت ساخته شد." -ForegroundColor Yellow
}
$envLocalPath = Join-Path $AppDir ".env.local"
if (-not (Test-Path $envLocalPath)) {
    $bytes  = New-Object byte[] 32
    $rng    = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $secret = [System.BitConverter]::ToString($bytes).Replace("-", "").ToLower()
    ("AUTH_SECRET=" + $secret) | Out-File -FilePath $envLocalPath -Encoding ascii
    Write-Host "      کلید AUTH_SECRET جدید ساخته شد (کاربران باید دوباره وارد شوند)." -ForegroundColor Yellow
}

# ---------- 4) ری‌استارت ----------
Write-Host "[4/4] اجرای مجدد برنامه..." -ForegroundColor Cyan
if ($taskExists) {
    Start-ScheduledTask -TaskName $TaskName
} else {
    Write-Host "      سرویس ثبت نشده است؛ اجرای دستی در پنجره جدید..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $AppDir "deploy\run-server.ps1")
}

Write-Host "      بررسی سلامت (حداکثر 90 ثانیه)..." -ForegroundColor Cyan
$healthy = Wait-RoseHealthy

Write-Host ""
if ($healthy) {
    Write-Host "===== به‌روزرسانی با موفقیت انجام شد =====" -ForegroundColor Green
    Show-RoseUrls
} else {
    Write-Host "[هشدار] سرور بعد از به‌روزرسانی پاسخ نمی‌دهد! آخرین لاگ‌ها:" -ForegroundColor Red
    if (Test-Path $LogFile) { Get-Content $LogFile -Tail 20 }
    Write-Host "برای بررسی: powershell -File status.ps1  یا  powershell -File logs.ps1" -ForegroundColor Yellow
}
