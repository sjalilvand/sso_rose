# =====================================================================
#  رز هاب — اجرای سرور (این فایل توسط Task Scheduler اجرا می‌شود)
#  اجرای دستی:  powershell -NoProfile -ExecutionPolicy Bypass -File run-server.ps1
# =====================================================================

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "config.ps1")

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }

# --- چرخش لاگ اگر بزرگ‌تر از 10 مگابایت شود ---
if ((Test-Path $LogFile) -and ((Get-Item $LogFile).Length -gt 10MB)) {
    try { Move-Item $LogFile ($LogFile + "." + (Get-Date -Format "yyyyMMdd-HHmmss")) -Force } catch { }
}

if (-not (Test-Path (Join-Path $AppDir ".next\BUILD_ID"))) {
    Write-Log "خطا: نسخه build یافت نشد. ابتدا deploy.ps1 یا update.ps1 را اجرا کنید."
    exit 1
}

Ensure-NodeInPath
if (0 -eq (Get-NodeMajor)) {
    Write-Log "خطا: Node.js در این سیستم یافت نشد. ابتدا Node.js را نصب کنید."
    exit 1
}

# --- متغیرهای محیطی زمان اجرا ---
$env:NODE_ENV = "production"
$env:PORT     = [string]$BackendPort

# نکته مهم: موتور Prisma در حالت build شده Next.js مسیر نسبی دیتابیس را
# درست حل نمی‌کند؛ بنابراین مسیر مطلق فایل دیتابیس اینجا تنظیم می‌شود.
$dbPath = Join-Path $AppDir "db\custom.db"
if (-not (Test-Path $dbPath)) {
    Write-Log "خطا: فایل دیتابیس یافت نشد: $dbPath"
    exit 1
}
$env:DATABASE_URL = "file:" + ($dbPath -replace "\\", "/")

Set-Location $AppDir
Write-Log ("شروع رز هاب روی پورت {0} | DATABASE_URL={1}" -f $BackendPort, $env:DATABASE_URL)

# --- اجرای سرور Next.js به‌صورت foreground (تا وقتی این اسکریپت زنده است، سرور هم زنده است) ---
# نکته سازگاری: در PowerShell 5.1 با EAP=Stop، ریدایرکت stderr (2>&1) باگ
# NativeCommandError دارد؛ پس موقتاً EAP روی Continue می‌گذاریم و رکوردهای
# خطا را خودمان به رشتهٔ ساده تبدیل می‌کنیم.
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& node "node_modules\next\dist\bin\next" start -H 0.0.0.0 -p $BackendPort 2>&1 |
    ForEach-Object {
        if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { "$_" }
    } | Out-File $LogFile -Append -Encoding utf8
$ErrorActionPreference = $prevEAP

$exitCode = $LASTEXITCODE
Write-Log ("پروسه سرور با کد {0} خاتمه یافت." -f $exitCode)
exit $exitCode
