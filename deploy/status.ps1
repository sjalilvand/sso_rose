# =====================================================================
#  رز هاب — وضعیت سرویس و پورت‌ها
#  نحوه اجرا:  powershell -ExecutionPolicy Bypass -File status.ps1
# =====================================================================

$ErrorActionPreference = "Continue"
. (Join-Path $PSScriptRoot "config.ps1")

Write-Host ""
Write-Host "===== وضعیت رز هاب (Rose Hub) =====" -ForegroundColor Magenta
Write-Host ""

# --- سرویس ---
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
    $info = $task | Get-ScheduledTaskInfo -ErrorAction SilentlyContinue
    Write-Host ("سرویس            : {0}  [{1}]" -f $TaskName, $task.State) -ForegroundColor Cyan
    if ($info) {
        Write-Host ("آخرین اجرا        : {0}" -f $info.LastRunTime) -ForegroundColor Gray
        Write-Host ("نتیجه آخرین اجرا  : {0}" -f $info.LastTaskResult) -ForegroundColor Gray
    }
} else {
    Write-Host "سرویس             : ثبت نشده است (deploy.ps1 را اجرا کنید)" -ForegroundColor Yellow
}
Write-Host ("مسیر نصب          : {0}" -f $AppDir) -ForegroundColor Gray
if (Test-Path $LogFile) {
    $sizeMB = [math]::Round((Get-Item $LogFile).Length / 1MB, 2)
    Write-Host ("فایل لاگ          : {0}  ({1} MB)" -f $LogFile, $sizeMB) -ForegroundColor Gray
}

# --- پورت بک‌اند ---
Write-Host ""
if (Test-RoseHealthy) {
    Write-Host ("بک‌اند (پورت {0}) : پاسخ می‌دهد - سالم" -f $BackendPort) -ForegroundColor Green
} else {
    Write-Host ("بک‌اند (پورت {0}) : پاسخ نمی‌دهد" -f $BackendPort) -ForegroundColor Red
}

# --- پورت فرانت (portproxy) ---
try {
    $r = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/login" -f $FrontendPort) -UseBasicParsing -TimeoutSec 4
    Write-Host ("فرانت (پورت {0})  : پاسخ می‌دهد - سالم" -f $FrontendPort) -ForegroundColor Green
} catch {
    Write-Host ("فرانت (پورت {0})  : پاسخ نمی‌دهد" -f $FrontendPort) -ForegroundColor Red
}

# --- جدول portproxy ---
Write-Host ""
Write-Host "قوانین portproxy فعال:" -ForegroundColor Cyan
$pp = netsh interface portproxy show all 2>$null
if ($pp) { $pp | ForEach-Object { Write-Host ("   {0}" -f $_) -ForegroundColor Gray } }
else { Write-Host "   (بدون قانون - portproxy تنظیم نشده)" -ForegroundColor Yellow }

# --- آدرس‌ها ---
Show-RoseUrls
