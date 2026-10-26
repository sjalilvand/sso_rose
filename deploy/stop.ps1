# =====================================================================
#  رز هاب — توقف برنامه
#  نحوه اجرا:  powershell -ExecutionPolicy Bypass -File stop.ps1
# =====================================================================

$ErrorActionPreference = "Continue"
. (Join-Path $PSScriptRoot "config.ps1")

Write-Host ""
Write-Host "===== توقف رز هاب =====" -ForegroundColor Magenta

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Write-Host ("سرویس «{0}» متوقف شد." -f $TaskName) -ForegroundColor Green
} else {
    Write-Host "سرویسی با این نام ثبت نشده است." -ForegroundColor Yellow
}

Start-Sleep -Seconds 2

# اطمینان: هر پروسه node که هنوز روی پورت بک‌اند گوش می‌دهد بسته شود
try {
    $conns = Get-NetTCPConnection -LocalPort $BackendPort -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
        if ($p -and $p.ProcessName -match "^node") {
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
            Write-Host ("پروسه node با شناسه {0} بسته شد." -f $p.Id) -ForegroundColor Gray
        }
    }
} catch {}

if (Test-RoseHealthy) {
    Write-Host "[هشدار] پورت بک‌اند هنوز پاسخ می‌دهد؛ ممکن است پروسه دیگری روی آن باشد." -ForegroundColor Yellow
} else {
    Write-Host "برنامه کاملاً متوقف شد." -ForegroundColor Green
}
