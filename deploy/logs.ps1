# =====================================================================
#  رز هاب — نمایش لاگ برنامه
#  نحوه اجرا:  powershell -ExecutionPolicy Bypass -File logs.ps1
#  پارامترها:  -Tail 200   (تعداد خطوط آخر)   -Follow   (زنده مانند tail -f)
# =====================================================================

param(
    [int]$Tail = 80,
    [switch]$Follow
)

$ErrorActionPreference = "Continue"
. (Join-Path $PSScriptRoot "config.ps1")

if (-not (Test-Path $LogFile)) {
    Write-Host ("[خطا] فایل لاگ یافت نشد: {0}" -f $LogFile) -ForegroundColor Red
    exit 1
}

Write-Host ("===== آخرین {0} خط از {1} =====" -f $Tail, $LogFile) -ForegroundColor Cyan
Write-Host ""

if ($Follow) {
    Get-Content $LogFile -Tail $Tail -Wait
} else {
    Get-Content $LogFile -Tail $Tail
}
