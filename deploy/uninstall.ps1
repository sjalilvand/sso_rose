# =====================================================================
#  رز هاب — حذف سرویس و تنظیمات (فایل‌ها و دیتابیس حفظ می‌شوند)
#  نحوه اجرا:  powershell -ExecutionPolicy Bypass -File uninstall.ps1
#  پارامترها:  -DeleteFiles   (حذف کامل فایل‌ها همراه بک‌گیری خودکار دیتابیس)
# =====================================================================

param(
    [switch]$DeleteFiles
)

$ErrorActionPreference = "Continue"
. (Join-Path $PSScriptRoot "config.ps1")

Write-Host ""
Write-Host "===== حذف رز هاب (Rose Hub) =====" -ForegroundColor Magenta
Write-Host ""

# --- توقف و حذف سرویس ---
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host ("سرویس «{0}» حذف شد." -f $TaskName) -ForegroundColor Green
} else {
    Write-Host "سرویسی برای حذف پیدا نشد." -ForegroundColor Yellow
}

Start-Sleep -Seconds 2

# بستن پروسه باقی‌مانده node روی پورت بک‌اند
try {
    $conns = Get-NetTCPConnection -LocalPort $BackendPort -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
        if ($p -and $p.ProcessName -match "^node") { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
    }
} catch {}

# --- حذف portproxy ---
$null = cmd /c "netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$FrontendPort 2>nul"
if ($LASTEXITCODE -eq 0) { Write-Host ("portproxy پورت {0} حذف شد." -f $FrontendPort) -ForegroundColor Green }

# --- حذف قوانین فایروال ---
foreach ($rule in @("RoseHub-Frontend-8088", "RoseHub-Backend-3008")) {
    if (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue) {
        Remove-NetFirewallRule -DisplayName $rule -Confirm:$false
        Write-Host ("قانون فایروال «{0}» حذف شد." -f $rule) -ForegroundColor Green
    }
}

# --- فایل‌ها ---
if ($DeleteFiles) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $dbPath = Join-Path $AppDir "db\custom.db"
    if (Test-Path $dbPath) {
        $backup = Join-Path $BaseDir ("rose-hub-db-backup-{0}.db" -f $stamp)
        Copy-Item $dbPath $backup -Force
        Write-Host ("پشتیبان دیتابیس ذخیره شد: {0}" -f $backup) -ForegroundColor Green
    }
    Remove-Item $BaseDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host ("پوشه {0} حذف شد." -f $BaseDir) -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "فایل‌ها حذف نشدند (مسیر: $BaseDir)." -ForegroundColor Yellow
    Write-Host ("برای پشتیبان‌گیری دیتابیس، این فایل را نگه دارید: {0}" -f (Join-Path $AppDir "db\custom.db")) -ForegroundColor Yellow
    Write-Host "برای حذف کامل فایل‌ها:  powershell -File uninstall.ps1 -DeleteFiles" -ForegroundColor Yellow
}
