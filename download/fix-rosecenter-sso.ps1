#requires -Version 5.1
<#
.SYNOPSIS
  رفع مشکل ورود یکپارچه (SSO) رز سنتر روی پورت 8083 + تست سرتاسری SSO هر سه سامانه.

.DESCRIPTION
  چرا این اسکریپت لازم است؟
  در به‌روزرسانی قبلی، کد جدید رز سنتر از گیت‌هاب ریخته شد اما:
    ۱) پورت 8083 توسط پروسهٔ قدیمیِ غیرپایتونی اشغال بود (معمولاً portproxy ویندوز
       که 8083 را به پورت داخلی برنامهٔ قدیمی می‌برد) — بنابراین python app.py جدید
       نتوانست bind شود و کد قدیمی روی 8083 در حال پاسخ‌دادن بود.
    ۲) pip به‌خاطر Timeout روی pypi.org شکست خورد (تحریم) — باید از میرور ایرانی استفاده شود.

  این اسکریپت:
    گام ۱) پورت 8083 و portproxy/nginx را تشخیص می‌دهد و پورت «واقعی» برنامه را پیدا می‌کند
    گام ۲) پروسهٔ قدیمی رز سنتر را متوقف می‌کند
    گام ۳) وابستگی‌ها را از میرور ایرانی نصب می‌کند (Flask، PyJWT و ...)
    گام ۴) برنامهٔ جدید را روی پورت درست بالا می‌آورد و نشانه‌های SSO را تأیید می‌کند
    گام ۵) جریان کامل SSO هر سه سامانه را از خود سرور تست می‌کند:
           ورود به رز هاب -> صدور توکن -> مصرف توکن در سامانه (ورود بدون یوزر/پسورد)

  دستور اجرا (PowerShell مدیر):
    powershell -ExecutionPolicy Bypass -File C:\fix-rosecenter-sso.ps1

#>

param(
  [string]$RosecenterDir = "C:\rosecenter-deploy",
  [int]$ExternalPort = 8083,
  [string]$HubUrl = "http://127.0.0.1:8082",
  [string]$AdminEmail = "admin@rose.ir",
  [string]$AdminPassword = "rose1234",
  [switch]$SkipRosecenterFix,
  [switch]$SkipE2E
)

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$ok = [char]0x2713
$script:BackendPort = $ExternalPort
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

# ================================================================
# گام ۱ — تشخیص: چه چیزی روی 8083 گوش می‌دهد؟ portproxy وجود دارد؟
# ================================================================
if (-not $SkipRosecenterFix) {

Write-Step 'گام ۱/۵ — تشخیص پورت 8083 و portproxy ویندوز'
$proxyOut = $null
try { $proxyOut = (& netsh interface portproxy show all) -join "`n" } catch { }
$backendPort = $ExternalPort
$hasPortProxy = $false
$proxyTarget = ''
if ($proxyOut) {
  foreach ($line in ($proxyOut -split "`n")) {
    # قالب سطرها:  listenAddress listenPort connectAddress connectPort
    if ($line -match '^\s*\*?([\d\.]+|\*)\s+(\d+)\s+([\d\.]+|\*)\s+(\d+)\s*$') {
      $lPort = [int]$matches[2]; $cAddr = $matches[3]; $cPort = [int]$matches[4]
      if ($lPort -eq $ExternalPort) {
        $hasPortProxy = $true
        $backendPort = $cPort
        $proxyTarget = "$cAddr`:$cPort"
      }
    }
  }
}
if ($hasPortProxy) {
  Write-Host "  portproxy یافت شد: $ExternalPort -> $proxyTarget — برنامهٔ واقعی باید روی پورت $backendPort اجرا شود"
} else {
  Write-Host '  portproxy یافت نشد — برنامه باید مستقیم روی 8083 اجرا شود'
}

$conns = Get-NetTCPConnection -LocalPort $backendPort -State Listen -ErrorAction SilentlyContinue |
  Sort-Object OwningProcess -Unique
$owners = @()
foreach ($c in $conns) {
  $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
  if ($p) { $owners += $p }
}
if ($owners.Count -eq 0) {
  Write-Host "  هیچ پروسه‌ای روی پورت $backendPort گوش نمی‌دهد (پورت آزاد است)"
} else {
  foreach ($p in $owners) {
    $cl = ''
    try {
      $ci = Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)" -ErrorAction SilentlyContinue
      if ($ci) { $cl = [string]$ci.CommandLine }
    } catch { }
    Write-Host ("  شنوندهٔ پورت {0}: PID {1} ({2})  مسیر: {3}" -f $backendPort, $p.Id, $p.ProcessName, $p.Path)
    if ($cl) { Write-Host ("    خط فرمان: {0}" -f $cl) }
  }
}

$isHttpSys = ($owners | Where-Object { $_.ProcessName -in @('System', 'svchost') }).Count -gt 0
$isNginx   = ($owners | Where-Object { $_.ProcessName -eq 'nginx' }).Count -gt 0
$isPython  = ($owners | Where-Object { $_.ProcessName -match 'python' }).Count -gt 0

# اگر nginx روی همان پورت بیرونی گوش می‌دهد، پورت upstream را از کانفیگ بخوان
if ($isNginx -and -not $hasPortProxy) {
  $nginxExe = ($owners | Where-Object { $_.ProcessName -eq 'nginx' } | Select-Object -First 1).Path
  if ($nginxExe) {
    $nDir = Split-Path $nginxExe -Parent
    $confCandidates = @("$nDir\conf\nginx.conf", "$nDir\..\conf\nginx.conf",
                        (Join-Path $RosecenterDir 'nginx.conf'),
                        (Join-Path $RosecenterDir 'rose-nginx-windows.conf'))
    foreach ($conf in $confCandidates) {
      if (Test-Path $conf) {
        $txt = Get-Content $conf -Raw -ErrorAction SilentlyContinue
        $idx = $txt.IndexOf("listen $ExternalPort")
        if ($idx -lt 0) { $idx = $txt.IndexOf("listen $ExternalPort ".Trim()) }
        if ($idx -ge 0) {
          $seg = $txt.Substring($idx, [Math]::Min(4000, $txt.Length - $idx))
          $nxt = $seg.IndexOf('listen ', 8)
          if ($nxt -gt 0) { $seg = $seg.Substring(0, $nxt) }
          if ($seg -match 'proxy_pass\s+http://127\.0\.0\.1:(\d+)') {
            $backendPort = [int]$matches[1]
            Write-Host "  nginx روی $ExternalPort به 127.0.0.1:$backendPort پروکسی می‌کند (از $($conf))"
          }
        }
        if ($backendPort -ne $ExternalPort) { break }
      }
    }
  }
}

# ================================================================
# گام ۲ — توقف پروسهٔ قدیمی رز سنتر
# ================================================================
Write-Step "گام ۲/۵ — توقف پروسهٔ قدیمی رز سنتر"

$pyProcs = @()
try {
  $pyProcs = Get-CimInstance Win32_Process -Filter "Name like 'python%' or Name like 'py.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -match 'app\.py' -and
      $_.CommandLine -notmatch 'rosepsy' -and
      $_.CommandLine -notmatch 'uvicorn'
    }
} catch { }

foreach ($wp in $pyProcs) {
  try {
    Stop-Process -Id $wp.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Host "  پروسهٔ python قدیمی (app.py، PID $($wp.ProcessId)) متوقف شد"
  } catch { }
}

# اگر شنوندهٔ پورت بک‌اند خودش پایتون است (بدون app.py در خط فرمان)، آن را هم متوقف کن
foreach ($p in $owners) {
  if ($p.ProcessName -match 'python') {
    $cl = ''
    try {
      $ci = Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)" -ErrorAction SilentlyContinue
      if ($ci) { $cl = [string]$ci.CommandLine }
    } catch { }
    if ($cl -notmatch 'rosepsy' -and $cl -notmatch 'uvicorn') {
      Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
      Write-Host "  شنوندهٔ قدیمی پورت $backendPort (python، PID $($p.Id)) متوقف شد"
    }
  }
}

if ($isHttpSys -and -not $hasPortProxy -and -not $isPython) {
  Write-Warn2 "پورت $backendPort توسط http.sys ویندوز (svchost/System) اشغال است و portproxy هم یافت نشد."
  Write-Warn2 'این حالت یعنی احتمالاً IIS یا HttpListener روی این پورت سرو می‌کند.'
  Write-Warn2 'خروجی گام ۱ را برای ما بفرستید تا دقیق راهنمایی کنیم؛ با این حال تست سرتاسری ادامه می‌یابد.'
}

Start-Sleep -Seconds 2

# ================================================================
# گام ۳ — وابستگی‌ها از میرور ایرانی (Flask، PyJWT و ...)
# ================================================================
Write-Step 'گام ۳/۵ — نصب وابستگی‌ها از میرور ایرانی (رفع خطای Timeout خطای pypi)'
Push-Location $RosecenterDir
$depsOk = $false
$mirrors = @(
  'https://archive.ito.gov.ir/mirror2/python/simple/',
  'https://archive.ito.gov.ir/python/simple/',
  'https://pypi.org/simple/'
)
foreach ($m in $mirrors) {
  Write-Host "  امتحان میرور: $m"
  & python -m pip install -r requirements.txt -i $m --timeout 60 --retries 5 --quiet --disable-pip-version-check 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) { $depsOk = $true; Write-Ok "وابستگی‌ها نصب شدند (میرور: $m)"; break }
  else { Write-Warn2 "این میرور جواب نداد — بعدی..." }
}
& python -c "import flask, jwt; print('deps-check-ok')" 2>$null | Out-Null
$importOk = ($LASTEXITCODE -eq 0)
if ($importOk) {
  Write-Ok 'Flask و PyJWT قابل import هستند — وابستگی‌های SSO آماده است'
} else {
  Write-Err2 'نصب وابستگی‌ها ناموفق بود — بدون PyJWT پل SSO کار نمی‌کند.'
  Write-Host '  نصب دستی:  python -m pip install PyJWT Flask -i https://archive.ito.gov.ir/mirror2/python/simple/'
}

# ================================================================
# گام ۴ — اجرای برنامهٔ جدید روی پورت درست + تأیید نشانه‌های SSO
# ================================================================
Write-Step "گام ۴/۵ — اجرای برنامهٔ جدید روی پورت $backendPort"

# اگر http.sys پورت را گرفته، اجرای مستقیم ممکن نیست — فقط تست می‌کنیم
$canStart = -not ($isHttpSys -and -not $hasPortProxy -and -not $isPython)
if ($canStart) {
  # اطمینان از آزاد بودن پورت بک‌اند
  $still = Get-NetTCPConnection -LocalPort $backendPort -State Listen -ErrorAction SilentlyContinue |
    Sort-Object OwningProcess -Unique
  foreach ($c in $still) {
    $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -match 'python') {
      Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    } elseif ($p) {
      Write-Warn2 "پورت $backendPort همچنان توسط $($p.ProcessName) (PID $($p.Id)) اشغال است"
    }
  }
  Start-Sleep -Seconds 1

  $env:PORT = "$backendPort"
  $outLog = Join-Path $RosecenterDir 'rosecenter.out.log'
  $errLog = Join-Path $RosecenterDir 'rosecenter.err.log'
  try {
    Start-Process -FilePath "python" -ArgumentList "app.py" -WorkingDirectory $RosecenterDir `
      -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog
  } catch {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $outLog = Join-Path $RosecenterDir "rosecenter.out.$stamp.log"
    $errLog = Join-Path $RosecenterDir "rosecenter.err.$stamp.log"
    Start-Process -FilePath "python" -ArgumentList "app.py" -WorkingDirectory $RosecenterDir `
      -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog
  }
  Write-Ok "برنامه اجرا شد (PORT=$backendPort) — لاگ: $(Split-Path $outLog -Leaf) / $(Split-Path $errLog -Leaf)"

  # ساخت اسکریپت راه‌انداز با پورت درست برای ری‌استارت‌های بعدی
  $starter = @"
# راه‌انداز رز سنتر — ساخته‌شده توسط fix-rosecenter-sso.ps1
`$env:PORT = "$backendPort"
Start-Process -FilePath "python" -ArgumentList "app.py" -WorkingDirectory "$RosecenterDir" -WindowStyle Hidden
Write-Host "رز سنتر روی پورت $backendPort اجرا شد"
"@
  Set-Content -Path (Join-Path $RosecenterDir 'start-rosecenter.ps1') -Value $starter -Encoding UTF8
} else {
  Write-Warn2 'اجرای مستقیم python روی این پورت ممکن نیست (http.sys) — فقط تأیید انجام می‌شود'
}

# انتظار برای بالا آمدن
$healthy = $false
foreach ($i in 1..12) {
  Start-Sleep -Seconds 3
  $code = & curl.exe -s -o NUL -w "%{http_code}" --connect-timeout 3 --max-time 10 "http://127.0.0.1:$backendPort/api/health" 2>$null
  if ("$code" -eq '200') { $healthy = $true; break }
}
if ($healthy) { Write-Ok "رز سنتر روی پورت $backendPort سالم است (/api/health = 200)" }
else {
  Write-Err2 "رز سنتر روی پورت $backendPort بالا نیامد — آخر لاگ خطا:"
  $errLogPath = Join-Path $RosecenterDir 'rosecenter.err.log'
  if (Test-Path $errLogPath) { Get-Content $errLogPath -Tail 15 | ForEach-Object { Write-Host "    $_" } }
}

# تأیید نشانه‌های کد جدید
Write-Step 'تأیید کد جدید (نشانه‌های SSO در رز سنتر)'
$mk1 = & curl.exe -s -o NUL -w "%{http_code}|%{redirect_url}" --max-time 10 "http://127.0.0.1:$backendPort/sso/rose" 2>$null
$p1 = "$mk1" -split '\|', 2
if ($p1[1] -match 'sso/launch') {
  Write-Ok "/sso/rose (بدون توکن) به رز هاب هدایت می‌کند — کد جدید زنده است"
} else {
  Write-Warn2 "/sso/rose هدایت مورد انتظار را نداشت (code=$($p1[0])) — احتمالاً هنوز کد قدیمی در حال سرو است"
}
$mk2 = & curl.exe -s -o NUL -w "%{http_code}|%{redirect_url}" --max-time 10 "http://127.0.0.1:$backendPort/?sso_token=probe-fix-123" 2>$null
$p2 = "$mk2" -split '\|', 2
if ($p2[1] -match '/sso/rose\?sso_token=probe-fix-123') {
  Write-Ok "صفحهٔ اصلی توکن sso_token را به /sso/rose دست‌به‌دست می‌کند"
} else {
  Write-Warn2 "دست‌به‌دست‌کردن توکن در صفحهٔ اصلی دیده نشد (code=$($p2[0]))"
}

if ($backendPort -ne $ExternalPort) {
  # مسیر واقعی کاربران: از طریق portproxy/nginx روی پورت بیرونی
  $mk3 = & curl.exe -s -o NUL -w "%{http_code}|%{redirect_url}" --max-time 10 "http://127.0.0.1:$ExternalPort/sso/rose" 2>$null
  $p3 = "$mk3" -split '\|', 2
  if ($p3[1] -match 'sso/launch') {
    Write-Ok "پورت بیرونی $ExternalPort (portproxy/nginx) هم کد جدید را سرو می‌کند"
  } else {
    Write-Warn2 "پورت بیرونی $ExternalPort هنوز کد جدید را سرو نمی‌کند (code=$($p3[0])) — portproxy/nginx را بررسی کنید"
  }
}
Pop-Location

} # پایان بخش رفع رز سنتر

# ================================================================
# گام ۵ — تست سرتاسری SSO هر سه سامانه از خود سرور
#   ورود به رز هاب -> صدور توکن -> مصرف توکن (ورود بدون یوزر/پسورد)
# ================================================================
if (-not $SkipE2E) {

Write-Step 'گام ۵/۵ — تست سرتاسری SSO (لاگین رز هاب -> صدور توکن -> ورود بدون رمز)'

$hubSession = $null
try {
  $loginBody = @{ email = $AdminEmail; password = $AdminPassword } | ConvertTo-Json
  $login = Invoke-RestMethod -Method Post -Uri "$HubUrl/api/auth/login" `
    -ContentType 'application/json' -Body $loginBody -SessionVariable hubSession -TimeoutSec 30
  if ($login.requiresTwoFactor) {
    Write-Err2 'حساب مدیر ورود دومرحله‌ای (2FA) دارد — با حساب بدون 2FA تست کنید:'
    Write-Host '    powershell -ExecutionPolicy Bypass -File C:\fix-rosecenter-sso.ps1 -AdminEmail you@x.com -AdminPassword ...'
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
     UrlIn  = ("http://127.0.0.1:{0}/sso/rose" -f $ExternalPort);
     UrlOut = ("http://130.185.73.157:{0}/sso/rose" -f $ExternalPort);
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
if (Test-Path (Join-Path $RosecenterDir 'start-rosecenter.ps1')) {
  Write-Host '  ری‌استارت رز سنتر از این به بعد (پورت درست داخلش ذخیره شده):'
  Write-Host "    powershell -ExecutionPolicy Bypass -File $(Join-Path $RosecenterDir 'start-rosecenter.ps1')"
  Write-Host ''
}
}
