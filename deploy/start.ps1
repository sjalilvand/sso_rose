# =====================================================================
#  رز هاب — شروع برنامه (سرویس ویندوزی)
#  نحوه اجرا:  powershell -ExecutionPolicy Bypass -File start.ps1
# =====================================================================

$ErrorActionPreference = "Continue"
. (Join-Path $PSScriptRoot "config.ps1")

Write-Host ""
Write-Host "===== شروع رز هاب =====" -ForegroundColor Magenta

if (-not (Test-Path (Join-Path $AppDir ".next\BUILD_ID"))) {
    Write-Host "[خطا] برنامه هنوز نصب/build نشده است. ابتدا deploy.ps1 را اجرا کنید." -ForegroundColor Red
    exit 1
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
    Start-ScheduledTask -TaskName $TaskName
    Write-Host ("سرویس «{0}» اجرا شد؛ در حال بررسی سلامت..." -f $TaskName) -ForegroundColor Cyan
} else {
    Write-Host "سرویس ثبت نشده است؛ اجرای دستی در پنجره جدید..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $AppDir "deploy\run-server.ps1")
}

if (Wait-RoseHealthy) {
    Write-Host "برنامه بالا آمد." -ForegroundColor Green
    Show-RoseUrls
} else {
    Write-Host "[هشدار] سرور هنوز پاسخ نمی‌دهد؛ لاگ‌ها را بررسی کنید:" -ForegroundColor Red
    Write-Host ("         powershell -File logs.ps1") -ForegroundColor Yellow
}
