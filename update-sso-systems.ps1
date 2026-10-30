#requires -Version 5.1
<#
.SYNOPSIS
  به‌روزرسانی سه سامانه متصل به رز هاب روی سرور 130.185.73.157 — فعال‌سازی ورود یکپارچه (SSO).

.DESCRIPTION
  هر سه سامانه کد SSO را روی گیت‌هاب دارند اما نمونه‌های روی سرور قدیمی‌اند.
  این اسکریپت هر سه را از گیت‌هاب به‌روز می‌کند و سرویس‌ها را ری‌استارت می‌کند:

    ۱) رز سای       (special-spoon)     -> پورت 80    -> ارتقا با اسکریپت native خودش
    ۲) رز سنتر      (rosecenter)        -> پورت 8083  -> گیت + pip + اجرای دوباره
    ۳) حضور و غیاب       (rose-attendance)   -> پورت 8085  -> گیت + ری‌استارت سرویس‌های ویندوزی

  پس از اجرا، کاربرِ واردشده در رز هاب (http://130.185.73.157:8082) با کلیک روی
  هر سامانه بدون تکرار یوزر/پسورد وارد می‌شود؛ دکمه «ورود یکپارچه با رز هاب»
  هم به صفحه ورود هر سه سامانه اضافه می‌شود.

  دستور اجرا (PowerShell مدیر):
    powershell -ExecutionPolicy Bypass -File C:\update-sso-systems.ps1

  اجرای گزینشی:
    powershell -ExecutionPolicy Bypass -File C:\update-sso-systems.ps1 -SkipRosepsy
#>

param(
  [string]$RosepsyDir = "C:\rosepsy",
  [string]$RosecenterDir = "C:\rosecenter-deploy",
  [string]$AttendanceDir = "C:\rose-attendance",
  [int]$RosecenterPort = 8083,
  [switch]$SkipRosepsy,
  [switch]$SkipRosecenter,
  [switch]$SkipAttendance
)

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$ok = [char]0x2713
function Write-Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok($m)   { Write-Host "  [$ok] $m" -ForegroundColor Green }
function Write-Warn2($m){ Write-Host "  [!] $m" -ForegroundColor Yellow }
function Write-Err2($m) { Write-Host "  [X] $m" -ForegroundColor Red }

# ---------- بررسی دسترسی مدیر ----------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Err2 'این اسکریپت باید در PowerShell «Run as Administrator» اجرا شود.'
  exit 1
}

$summary = @()

# ================================================================
# ۱) رز سای (special-spoon) — پورت 80
# ================================================================
if (-not $SkipRosepsy) {
  Write-Step '۱/۳ رز سای — ارتقا با اسکریپت native (گیت + npm build + مایگریشن + ری‌استارت سرویس‌ها)'
  $native = Join-Path $RosepsyDir 'app\deploy\rosepsy-server-native.ps1'
  if (Test-Path $native) {
    Write-Host '  این مرحله چند دقیقه طول می‌کشد (ساخت site و panel)...'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $native -Mode upgrade
    if ($LASTEXITCODE -eq 0 -or $?) { Write-Ok 'ارتقای رز سای اجرا شد' }
    else { Write-Warn2 'خروجی اسکریپت native را برای خطا بررسی کنید' }
    $summary += @{ N = 'رز سای (80)'; D = $RosepsyDir }
  } else {
    Write-Warn2 "اسکریپت native یافت نشد: $native — اگر رز سای در مسیر دیگری نصب است، پارامتر -RosepsyDir را بدهید"
  }
} else { Write-Step '۱/۳ رز سای — رد شد (SkipRosepsy)' }

# ================================================================
# ۲) رز سنتر (rosecenter) — پورت 8083
# ================================================================
if (-not $SkipRosecenter) {
  Write-Step '۲/۳ رز سنتر — همگام‌سازی کد از گیت‌هاب'

  if (-not (Test-Path $RosecenterDir)) { New-Item -ItemType Directory -Force -Path $RosecenterDir | Out-Null }
  Push-Location $RosecenterDir
  try {
    if (-not (Test-Path '.git')) {
      Write-Host '  این پوشه گیت نیست — به مخزن متصل می‌شود (rose.db و فایل‌های محلی حفظ می‌شوند)'
      & git init | Out-Null
      & git remote add origin https://github.com/sjalilvand/rosecenter.git 2>$null
      if (-not (git remote | Select-String origin)) { & git remote add origin https://github.com/sjalilvand/rosecenter.git }
    }
    & git fetch origin main
    if ($LASTEXITCODE -ne 0) { throw 'git fetch ناموفق بود — اتصال اینترنت/گیت‌هاب را بررسی کنید' }
    & git reset --hard origin/main
    if ($LASTEXITCODE -ne 0) { throw 'git reset ناموفق بود' }
    & git branch -M main 2>$null
    & git branch --set-upstream-to=origin/main main 2>$null
    Write-Ok 'کد رز سنتر به آخرین نسخه main به‌روز شد (rose.db دست‌نخورده ماند)'

    Write-Step '۲/۳ رز سنتر — نصب وابستگی‌ها'
    & python -m pip install -r requirements.txt --quiet --disable-pip-version-check
    if ($LASTEXITCODE -eq 0) { Write-Ok 'وابستگی‌ها نصب شد (شامل PyJWT برای SSO)' }
    else { Write-Warn2 'pip هشدار/خطا داد — ادامه می‌دهیم (اگر وابستگی‌ها قبلاً نصب باشند مشکلی نیست)' }

    Write-Step '۲/۳ رز سنتر — ری‌استارت برنامه روی پورت 8083'
    $conns = Get-NetTCPConnection -LocalPort $RosecenterPort -State Listen -ErrorAction SilentlyContinue
    $killed = $false
    foreach ($c in $conns) {
      $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
      if ($p -and $p.ProcessName -match 'python') {
        Stop-Process -Id $p.Id -Force
        $killed = $true
        Write-Host "  پروسه قبلی (python، PID $($p.Id)) متوقف شد"
      }
    }
    if (-not $killed -and $conns) { Write-Warn2 'پورت 8083 توسط پروسه غیرپایتونی اشغال است — بررسی دستی لازم' }
    Start-Sleep -Seconds 2

    $env:PORT = "$RosecenterPort"
    $outLog = Join-Path $RosecenterDir 'rosecenter.out.log'
    $errLog = Join-Path $RosecenterDir 'rosecenter.err.log'
    Start-Process -FilePath "python" -ArgumentList "app.py" -WorkingDirectory $RosecenterDir `
      -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    Write-Ok "برنامه دوباره اجرا شد (PORT=$RosecenterPort) — لاگ: rosecenter.out.log / rosecenter.err.log"

    Write-Step '۲/۳ رز سنتر — بررسی سلامت'
    $healthy = $false
    foreach ($i in 1..10) {
      Start-Sleep -Seconds 3
      try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$RosecenterPort/api/health" -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
      } catch { }
    }
    if ($healthy) { Write-Ok "رز سنتر روی پورت $RosecenterPort پاسخ می‌دهد" }
    else { Write-Err2 "رز سنتر بالا نیامد — لاگ را ببینید: $errLog" }
    $summary += @{ N = "رز سنتر ($RosecenterPort)"; D = $RosecenterDir }
  } catch {
    Write-Err2 "رز سنتر: $($_.Exception.Message)"
  } finally {
    Pop-Location
  }
} else { Write-Step '۲/۳ رز سنتر — رد شد (SkipRosecenter)' }

# ================================================================
# ۳) حضور و غیاب (rose-attendance) — پورت 8085
# ================================================================
if (-not $SkipAttendance) {
  Write-Step '۳/۳ حضور و غیاب — همگام‌سازی کد از گیت‌هاب'
  if (Test-Path (Join-Path $AttendanceDir '.git')) {
    Push-Location $AttendanceDir
    try {
      & git fetch origin main
      if ($LASTEXITCODE -ne 0) { throw 'git fetch ناموفق بود' }
      & git reset --hard origin/main
      if ($LASTEXITCODE -ne 0) { throw 'git reset ناموفق بود' }
      Write-Ok 'کد حضور و غیاب به‌روز شد (شامل dist فرانت‌اند با handoff توکن SSO)'
    } catch {
      Write-Err2 "حضور و غیاب: $($_.Exception.Message)"
    } finally {
      Pop-Location
    }
    Write-Step '۳/۳ حضور و غیاب — ری‌استارت سرویس‌های ویندوزی (RoseApi و ...)'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $AttendanceDir 'run-rose.ps1') -Restart
    Write-Ok 'سرویس‌های حضور و غیاب ری‌استارت شدند'
    $summary += @{ N = 'حضور و غیاب (8085)'; D = $AttendanceDir }
  } else {
    Write-Warn2 "مخزن حضور و غیاب یافت نشد: $AttendanceDir — اگر مسیر دیگری است با -AttendanceDir بدهید"
  }
} else { Write-Step '۳/۳ حضور و غیاب — رد شد (SkipAttendance)' }

# ================================================================
# ۴) تست SSM خودِ SSO روی هر سه سامانه (از داخل سرور)
# ================================================================
Write-Step '۴/۳ بررسی اثرگذاری به‌روزرسانی (وجود کد SSO در پاسخ‌ها)'

function Test-SSOMarker([string]$Name, [scriptblock]$Check) {
  try {
    if (& $Check) { Write-Ok $Name } else { Write-Warn2 "$Name — نشانه SSO دیده نشد" }
  } catch {
    Write-Warn2 "$Name — پاسخ نداد: $($_.Exception.Message)"
  }
}

Test-SSOMarker 'رز سای (80): دست‌به‌دست‌کننده sso_token در صفحه اصلی فعال است' {
  $c = (Invoke-WebRequest -Uri 'http://127.0.0.1/' -UseBasicParsing -TimeoutSec 15).Content
  $c -match 'sso_token'
}
Test-SSOMarker 'رز سنتر (8083): مسیر /sso/rose فعال است (ریدایرکت به رز هاب)' {
  $loc = & curl.exe -s -o NUL -w "%{redirect_url}" "http://127.0.0.1:$RosecenterPort/sso/rose"
  "$loc" -match 'sso/launch'
}
Test-SSOMarker 'حضور و غیاب (8085): دست‌به‌دست‌کننده rose-sso در صفحه اصلی فعال است' {
  $c = (Invoke-WebRequest -Uri 'http://127.0.0.1:8085/' -UseBasicParsing -TimeoutSec 15).Content
  $c -match 'rose-sso'
}

# ================================================================
# خلاصه
# ================================================================
Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '  به‌روزرسانی سه سامانه برای ورود یکپارچه (SSO) با رز هاب کامل شد' -ForegroundColor Cyan
Write-Host '=================================================================' -ForegroundColor Cyan
foreach ($s in $summary) { Write-Host ("  {0,-22} مسیر: {1}" -f $s.N, $s.D) }
Write-Host ''
Write-Host '  حالا این‌طور تست کنید:'
Write-Host '    ۱) در مرورگر http://130.185.73.157:8082 را باز و وارد شوید'
Write-Host '    ۲) از «سامانه‌ها» روی رز سای / رز سنتر / حضور و غیاب کلیک کنید'
Write-Host '       — باید بدون فرم ورود، وارد همان سامانه شوید'
Write-Host '    ۳) اگر صفحه تغییری نکرد: Ctrl+F5 (پاک‌شدن کش مرورگر)'
Write-Host ''
Write-Host '  نکته: ورود یکپارچه فقط برای کاربرانی است که مدیر در رز هاب به آن‌ها'
Write-Host '  مجوز آن سامانه را داده (مدیر کل همیشه مجاز است).'
Write-Host ''
Write-Host '  مدیریت رز سنتر:'
Write-Host '    توقف:   Get-NetTCPConnection -LocalPort 8083 -State Listen | %% { Stop-Process -Id $_.OwningProcess -Force }'
Write-Host '    اجرا:   Start-Process python -ArgumentList app.py -WorkingDirectory C:\rosecenter-deploy -WindowStyle Hidden'
Write-Host '            (قبل از اجرا: $env:PORT = "8083")'
Write-Host ''
