#requires -Version 5.1
<#
.SYNOPSIS
  رفع مشکل ورود یکپارچه (SSO) تکنورز (سامانه حضور و غیاب) روی پورت‌های 3005/8085
  + تست سرتاسری SSO هر سه سامانه.

.DESCRIPTION
  علامت: مصرف توکن SSO در تکنورز پاسخ 404 می‌دهد، در حالی که کد ریپو
  (config/urls.py -> path("auth/rose-sso/")) و requirements.lock (شامل PyJWT)
  هر دو درست هستند.

  علت: پروسهٔ قدیمی daphne (کد قبل از SSO) همچنان روی پورت 3005 شنونده است؛
  سرویس RoseApi جدید نمی‌تواند روی 3005 bind شود و درخواست‌ها را کد قدیمی
  جواب می‌دهد. این اسکریپت:
    گام ۱) شنوندهٔ 3005 و پیکربندی سرویس RoseApi را تشخیص و چاپ می‌کند
    گام ۲) سرویس را متوقف، پروسهٔ یتیم را می‌کشد و دوباره اجرا می‌کند
    گام ۳) از مسیر واقعی کاربر (8085/nginx) تأیید می‌کند کد جدید زنده است
    گام ۴) جریان کامل SSO هر سه سامانه را از خود سرور تست می‌کند

  دستور اجرا (PowerShell مدیر):
    powershell -ExecutionPolicy Bypass -File C:\fix-technorz-sso.ps1

#>

param(
  [string]$RepoDir = "C:\rose-attendance",
  [string]$Stack = "C:\rose-stack",
  [int]$ApiPort = 3005,
  [int]$WebPort = 8085,
  [string]$HubUrl = "http://127.0.0.1:8082",
  [string]$AdminEmail = "admin@rose.ir",
  [string]$AdminPassword = "rose1234",
  [switch]$SkipE2E
)

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$ok = [char]0x2713
function Write-Step($m)  { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok($m)    { Write-Host "  [$ok] $m" -ForegroundColor Green }
function Write-Warn2($m) { Write-Host "  [!] $m" -ForegroundColor Yellow }
function Write-Err2($m)  { Write-Host "  [X] $m" -ForegroundColor Red }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Err2 'این اسکریپت باید در PowerShell «Run as Administrator» اجرا شود.'
  exit 1
}

$backend = Join-Path $RepoDir 'backend'
$venvPy  = Join-Path $Stack 'venv\Scripts\python.exe'
$envCmd  = Join-Path $Stack 'rose-backend-env.cmd'

# ================================================================
# گام ۱ — تشخیص
# ================================================================
Write-Step "گام ۱/۴ — تشخیص شنوندهٔ پورت $ApiPort و سرویس RoseApi"

$svc = Get-Service RoseApi -ErrorAction SilentlyContinue
if ($svc) { Write-Host ("  وضعیت سرویس RoseApi: {0}" -f $svc.Status) }
else { Write-Warn2 'سرویس RoseApi یافت نشد — در انتها به‌صورت دستی اجرا می‌شود' }

# پیکربندی ثبت‌شدهٔ سرویس (NSSM یا WinSW)
$regBase = "HKLM:\SYSTEM\CurrentControlSet\Services\RoseApi"
try {
  $img = (Get-ItemProperty $regBase -ErrorAction SilentlyContinue).ImagePath
  if ($img) { Write-Host "  ImagePath سرویس: $img" }
  $pp = Get-ItemProperty "$regBase\Parameters" -ErrorAction SilentlyContinue
  if ($pp) {
    if ($pp.Application)   { Write-Host "  Application  : $($pp.Application)" }
    if ($pp.AppDirectory)  { Write-Host "  AppDirectory : $($pp.AppDirectory)" }
    if ($pp.AppParameters) { Write-Host "  AppParameters: $($pp.AppParameters)" }
    if ($pp.AppDirectory -and ((Resolve-Path $pp.AppDirectory -ErrorAction SilentlyContinue).Path -ne (Resolve-Path $backend -ErrorAction SilentlyContinue).Path)) {
      Write-Warn2 "AppDirectory سرویس با مسیر مورد انتظار ($backend) فرق دارد!"
    }
  }
} catch { }

# شنوندهٔ پورت بک‌اند
$conns = Get-NetTCPConnection -LocalPort $ApiPort -State Listen -ErrorAction SilentlyContinue |
  Sort-Object OwningProcess -Unique
foreach ($c in $conns) {
  $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
  if ($p) {
    $cl = ''
    try {
      $ci = Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)" -ErrorAction SilentlyContinue
      if ($ci) { $cl = [string]$ci.CommandLine }
    } catch { }
    Write-Host ("  شنوندهٔ پورت {0}: PID {1} ({2})  مسیر: {3}" -f $ApiPort, $p.Id, $p.ProcessName, $p.Path)
    if ($cl) { Write-Host ("    خط فرمان: {0}" -f $cl) }
  }
}
if (-not $conns) { Write-Host "  هیچ پروسه‌ای روی پورت $ApiPort گوش نمی‌دهد" }

# آیا کد روی دیسک مسیر SSO را دارد؟
$urlsFile = Join-Path $backend 'config\urls.py'
$codeHasSso = $false
if (Test-Path $urlsFile) {
  $codeHasSso = (Select-String -Path $urlsFile -Pattern 'rose-sso' -Quiet)
  if ($codeHasSso) { Write-Ok 'کد روی دیسک شامل مسیر auth/rose-sso است' }
  else {
    Write-Warn2 'کد روی دیسک مسیر SSO ندارد — همگام‌سازی از گیت‌هاب...'
    Push-Location $RepoDir
    & git fetch origin main 2>&1 | Out-Null
    & git reset --hard origin/main | Out-Null
    Pop-Location
    $codeHasSso = (Select-String -Path $urlsFile -Pattern 'rose-sso' -Quiet)
    if ($codeHasSso) { Write-Ok 'کد به‌روز شد (شامل مسیر SSO)' }
    else { Write-Err2 'پس از همگام‌سازی هم مسیر SSO در کد نیست — خروجی را برای ما بفرستید' }
  }
} else {
  Write-Err2 "مسیر بک‌اند یافت نشد: $urlsFile — پارامتر -RepoDir را بررسی کنید"
}

# بررسی وابستگی PyJWT در venv سرویس
if (Test-Path $venvPy) {
  & $venvPy -c "import jwt; print('jwt-ok')" 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Ok 'PyJWT در venv سرویس موجود است' }
  else {
    Write-Warn2 'PyJWT در venv سرویس نیست — نصب از میرور ایرانی...'
    & $venvPy -m pip install PyJWT -i 'https://archive.ito.gov.ir/mirror2/python/simple/' --timeout 60 --retries 5 --quiet --disable-pip-version-check 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Ok 'PyJWT نصب شد' }
    else { Write-Err2 'نصب PyJWT ناموفق بود — نصب دستی: & "C:\rose-stack\venv\Scripts\python.exe" -m pip install PyJWT' }
  }
} else {
  Write-Warn2 "venv یافت نشد: $venvPy — اگر مسیر دیگری است با -Stack بدهید"
}

# وضعیت فعلی: آیا همین حالا کد جدید جواب می‌دهد؟
function Test-NewCode([int]$Port) {
  $raw = (& curl.exe -s --connect-timeout 4 --max-time 12 "http://127.0.0.1:$Port/api/v1/auth/rose-sso/" 2>$null) -join ''
  return ($raw -match 'sso_token')
}
$alreadyFixed = $false
if (Test-NewCode $ApiPort) {
  $alreadyFixed = $true
  Write-Ok "پورت $ApiPort همین حالا کد جدید را سرو می‌کند — نیازی به ری‌استارت نیست"
}

# ================================================================
# گام ۲ — توقف سرویس، کشتن پروسهٔ یتیم، اجرای دوباره
# ================================================================
if (-not $alreadyFixed) {

Write-Step 'گام ۲/۴ — توقف سرویس RoseApi و پاک‌کردن پروسهٔ یتیم روی 3005'

if ($svc) {
  try { Stop-Service RoseApi -Force -ErrorAction Continue } catch { }
  Start-Sleep -Seconds 3
  Write-Host '  سرویس RoseApi متوقف شد'
}

# هر پروسهٔ python/daphne که هنوز روی 3005 گوش می‌دهد = یتیم → کشتن
$left = Get-NetTCPConnection -LocalPort $ApiPort -State Listen -ErrorAction SilentlyContinue |
  Sort-Object OwningProcess -Unique
foreach ($c in $left) {
  $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
  if ($p) {
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    Write-Host "  پروسهٔ یتیم روی $ApiPort متوقف شد: PID $($p.Id) ($($p.ProcessName))"
  }
}
# پروسه‌های daphne دیگری که شاید به‌زودی پورت را بگیرند
try {
  Get-CimInstance Win32_Process -Filter "Name like 'python%'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'daphne' -and $_.CommandLine -match '3005' } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      Write-Host "  پروسهٔ daphne (PID $($_.ProcessId)) متوقف شد"
    }
} catch { }
Start-Sleep -Seconds 2

if ($svc) {
  try { Start-Service RoseApi -ErrorAction Continue; Write-Host '  سرویس RoseApi شروع شد' } catch {
    Write-Warn2 "شروع سرویس ناموفق: $($_.Exception.Message) — اجرای مستقیم انجام می‌شود"
  }
}

# اگر سرویس نبود یا بالا نیامد → اجرای مستقیم با env رسمی
$up = $false
foreach ($i in 1..20) {
  Start-Sleep -Seconds 3
  $code = & curl.exe -s -o NUL -w "%{http_code}" --connect-timeout 3 --max-time 10 "http://127.0.0.1:$ApiPort/api/v1/health/" 2>$null
  if ("$code" -eq '200') { $up = $true; break }
}
if (-not $up) {
  Write-Warn2 'بک‌اند بالا نیامد — اجرای مستقیم daphne با env رسمی (C:\rose-stack\rose-backend-env.cmd)...'
  if ((Test-Path $envCmd) -and (Test-Path $venvPy)) {
    $line = "call `"$envCmd`" && cd /d `"$backend`" && `"$venvPy`" -m daphne -b 0.0.0.0 -p $ApiPort config.asgi:application"
    try {
      Start-Process -FilePath 'cmd.exe' -ArgumentList ('/c "' + $line + '"') -WindowStyle Hidden
      foreach ($i in 1..15) {
        Start-Sleep -Seconds 3
        $code = & curl.exe -s -o NUL -w "%{http_code}" --connect-timeout 3 --max-time 10 "http://127.0.0.1:$ApiPort/api/v1/health/" 2>$null
        if ("$code" -eq '200') { $up = $true; break }
      }
    } catch { Write-Err2 "اجرای مستقیم ناموفق: $($_.Exception.Message)" }
  } else {
    Write-Err2 "env یا venv یافت نشد ($envCmd / $venvPy) — اجرای سرویس را دستی بررسی کنید"
  }
}
if ($up) { Write-Ok "بک‌اند تکنورز روی پورت $ApiPort سالم است (/api/v1/health/ = 200)" }
else {
  Write-Err2 'بک‌اند بالا نیامد — لاگ سرویس را ببینید:'
  Get-ChildItem "$Stack\logs" -Filter 'RoseApi*' -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  --- $($_.Name) (۱۰ خط آخر) ---"
    Get-Content $_.FullName -Tail 10 | ForEach-Object { Write-Host "    $_" }
  }
}

# هنوز کد قدیمی جواب می‌دهد؟
if (-not (Test-NewCode $ApiPort)) {
  Write-Warn2 "پورت $ApiPort هنوز مسیر SSO را نمی‌شناسد — پروسهٔ فعلی را بررسی کنید:"
  Get-NetTCPConnection -LocalPort $ApiPort -State Listen -ErrorAction SilentlyContinue | Sort-Object OwningProcess -Unique | ForEach-Object {
    $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    if ($p) { Write-Host "    PID $($p.Id) ($($p.ProcessName)) — $($p.Path)" }
  }
  Write-Host '  اگر مسیر پروسه متفاوت از C:\rose-attendance است، سرویس را دوباره نصب کنید:'
  Write-Host '    C:\rose-attendance\run-rose.ps1 -InstallServices'
}
}

# ================================================================
# گام ۳ — تأیید از مسیر واقعی کاربر (nginx روی 8085)
# ================================================================
Write-Step 'گام ۳/۴ — تأیید از مسیر کاربر (8085/nginx)'
$webRaw = (& curl.exe -s --connect-timeout 4 --max-time 12 "http://127.0.0.1:$WebPort/api/v1/auth/rose-sso/" 2>$null) -join ''
if ($webRaw -match 'sso_token') {
  Write-Ok "وب (8085) به کد جدید وصل است — مسیر SSO از بیرون هم فعال است"
} else {
  Write-Warn2 'وب (8085) هنوز کد جدید را جواب نمی‌دهد — اگر بک‌اند سبز شد، RoseNginx را ری‌استارت کنید: Restart-Service RoseNginx'
}
try {
  $homePage = (Invoke-WebRequest -Uri "http://127.0.0.1:$WebPort/" -UseBasicParsing -TimeoutSec 15).Content
  if ($homePage -match 'rose-sso') { Write-Ok 'دست‌به‌دست‌کنندهٔ rose-sso در صفحهٔ اصلی فعال است' }
  else { Write-Warn2 'نشانهٔ rose-sso در صفحهٔ اصلی دیده نشد' }
} catch { Write-Warn2 "صفحهٔ اصلی 8085 باز نشد: $($_.Exception.Message)" }

# ================================================================
# گام ۴ — تست سرتاسری SSO هر سه سامانه
#   ورود به رز هاب -> صدور توکن -> مصرف توکن (ورود بدون یوزر/پسورد)
# ================================================================
if (-not $SkipE2E) {

Write-Step 'گام ۴/۴ — تست سرتاسری SSO (لاگین رز هاب -> صدور توکن -> ورود بدون رمز)'

$hubSession = $null
try {
  $loginBody = @{ email = $AdminEmail; password = $AdminPassword } | ConvertTo-Json
  $login = Invoke-RestMethod -Method Post -Uri "$HubUrl/api/auth/login" `
    -ContentType 'application/json' -Body $loginBody -SessionVariable hubSession -TimeoutSec 30
  if ($login.requiresTwoFactor) {
    Write-Err2 'حساب مدیر ورود دومرحله‌ای (2FA) دارد — با حساب بدون 2FA تست کنید:'
    Write-Host '    powershell -ExecutionPolicy Bypass -File C:\fix-technorz-sso.ps1 -AdminEmail you@x.com -AdminPassword ...'
    return
  }
  Write-Ok "ورود به رز هاب موفق بود (کاربر: $($login.user.name))"
} catch {
  Write-Err2 "ورود به رز هاب ($HubUrl) ناموفق بود: $($_.Exception.Message)"
  Write-Host '  مطمئن شوید رز هاب روی 8082 بالا است:  pm2 status  (مسیر C:\RoseHub)'
  return
}

$systems = @()
try {
  $systems = (Invoke-RestMethod -Uri "$HubUrl/api/systems" -WebSession $hubSession -TimeoutSec 30).systems
} catch {
  Write-Err2 "گرفتن فهرست سامانه‌ها ناموفق بود: $($_.Exception.Message)"
  return
}

$targets = @(
  @{ Name = 'رز سای';   ClientId = 'rose-psy-5c3f9b';
     UrlIn  = 'http://127.0.0.1/api/v1/auth/rose-sso';
     UrlOut = 'http://130.185.73.157/api/v1/auth/rose-sso';
     Mode = 'redirect'; Marker = '/panel' },
  @{ Name = 'رز سنتر';  ClientId = 'rose-center-2e8a5c';
     UrlIn  = 'http://127.0.0.1:8083/sso/rose';
     UrlOut = 'http://130.185.73.157:8083/sso/rose';
     Mode = 'redirect'; Marker = 'panel' },
  @{ Name = 'تکنورز';   ClientId = 'rose-techno-8a4e1f';
     UrlIn  = 'http://127.0.0.1:8085/api/v1/auth/rose-sso/';
     UrlOut = 'http://130.185.73.157:8085/api/v1/auth/rose-sso/';
     Mode = 'json'; Marker = 'access' }
)

$results = @()
foreach ($t in $targets) {
  $sys = $systems | Where-Object { $_.clientId -eq $t.ClientId } | Select-Object -First 1
  if (-not $sys) {
    Write-Warn2 "$($t.Name): سامانه‌ای با clientId=$($t.ClientId) در رز هاب یافت نشد"
    $results += @{ N = $t.Name; S = 'یافت نشد' }
    continue
  }
  try {
    $issue = Invoke-RestMethod -Method Post -Uri "$HubUrl/api/systems/$($sys.id)/sso" `
      -WebSession $hubSession -TimeoutSec 30
    $tok = $issue.token
    if (-not $tok) { throw 'توکن صادر نشد' }
  } catch {
    Write-Warn2 "$($t.Name): صدور توکن SSO ناموفق بود — $($_.Exception.Message)"
    $results += @{ N = $t.Name; S = 'خطای صدور توکن' }
    continue
  }

  $passed = $false
  $detail = ''
  foreach ($base in @($t.UrlIn, $t.UrlOut)) {
    $u = "{0}?sso_token={1}" -f $base, $tok
    if ($t.Mode -eq 'redirect') {
      $out = & curl.exe -s -o NUL -w "%{http_code}|%{redirect_url}" --connect-timeout 5 --max-time 20 $u 2>$null
      $pp = "$out" -split '\|', 2
      $detail = "code=$($pp[0]) location=$($pp[1])"
      if ($pp[1] -match [regex]::Escape($t.Marker)) { $passed = $true; break }
    } else {
      $raw = (& curl.exe -s --connect-timeout 5 --max-time 20 $u 2>$null) -join ''
      try { $j = $raw | ConvertFrom-Json } catch { $j = $null }
      if ($j -and $j.access) {
        $passed = $true
        $detail = "username=$($j.username) — توکن نشست صادر شد"
        break
      }
      $detail = "پاسخ: $raw"
      if ($detail.Length -gt 160) { $detail = $detail.Substring(0, 160) }
    }
  }
  if ($passed) { Write-Ok "$($t.Name): ورود بدون یوزر/پسورد برقرار است ($detail)" }
  else { Write-Warn2 "$($t.Name): مصرف توکن موفق نبود — $detail" }
  $results += @{ N = $t.Name; S = $(if ($passed) { 'SSO برقرار' } else { 'ناموفق' }) }
}

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '  جمع‌بندی وضعیت ورود یکپارچه (SSO)' -ForegroundColor Cyan
Write-Host '=================================================================' -ForegroundColor Cyan
foreach ($r in $results) {
  $color = if ($r.S -eq 'SSO برقرار') { 'Green' } else { 'Yellow' }
  Write-Host ("  {0,-12} : {1}" -f $r.N, $r.S) -ForegroundColor $color
}
Write-Host ''
Write-Host '  اگر همه سبز بودند، در مرورگر تست کنید:'
Write-Host '    ۱) http://130.185.73.157:8082 — ورود با admin@rose.ir'
Write-Host '    ۲) صفحهٔ «سامانه‌ها» — کلیک روی رز سای / رز سنتر / تکنورز'
Write-Host '       باید بدون فرم ورود وارد شوید'
Write-Host '    ۳) اگر صفحهٔ قدیمی دیدید: Ctrl+F5 (پاک‌کردن کش مرورگر)'
Write-Host ''
}
