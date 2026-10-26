# =====================================================================
#  رز هاب (Rose Hub) — نصب و راه‌اندازی کامل روی ویندوز سرور (بدون داکر)
#
#  نحوه اجرا: پنجره PowerShell با دسترسی Administrator باز کنید:
#     powershell -ExecutionPolicy Bypass -File deploy.ps1
#
#  عملیات این اسکریپت:
#    1) بررسی دسترسی Administrator
#    2) آماده‌سازی پوشه‌ها  (D:\rose-hub یا C:\rose-hub)
#    3) بررسی Git و نصب خودکار Node.js در صورت نبود
#    4) کلون/به‌روزرسانی کد از GitHub (با توکن در صورت موجود بودن)
#    5) آماده‌سازی دیتابیس (از تمپلیت، فقط بار اول) + کلید امنیتی AUTH_SECRET
#    6) نصب پکیج‌ها (npm install + prisma generate)
#    7) build نسخه Production
#    8) قوانین فایروال (8088 و 3008) + portproxy  (8088 → 3008)
#    9) ثبت سرویس در Task Scheduler + اجرا + بررسی سلامت
#
#  پارامترها:
#    -NoService   : بدون ثبت در Task Scheduler (اجرا فقط دستی)
#    -SkipBuild   : اگر build قبلی موجود باشد، از build مجدد صرف‌نظر شود
#    -BaseDir X   : مسیر نصب دلخواه (پیش‌فرض: خودکار — D:\rose-hub در صورت
#                   قابل نوشتن بودن، وگرنه C:\rose-hub)
# =====================================================================

param(
    [switch]$NoService,
    [switch]$SkipBuild,
    [string]$BaseDir = ""
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
. (Join-Path $PSScriptRoot "config.ps1")

Write-Host ""
Write-Host "==================================================" -ForegroundColor Magenta
Write-Host "   نصب و راه‌اندازی رز هاب (Rose Hub) - Production" -ForegroundColor Magenta
Write-Host "==================================================" -ForegroundColor Magenta
Write-Host ""

# ---------- [1/9] دسترسی Administrator ----------
if (-not (Test-IsAdmin)) {
    Write-Host "[خطا] این اسکریپت باید با دسترسی Administrator اجرا شود." -ForegroundColor Red
    Write-Host "      (قوانین فایروال، portproxy و ثبت سرویس به این دسترسی نیاز دارند)" -ForegroundColor Red
    Write-Host "      روی PowerShell راست‌کلیک کنید و «Run as Administrator» را بزنید." -ForegroundColor Yellow
    exit 1
}
Write-Host "[1/9] دسترسی Administrator تایید شد." -ForegroundColor Green

# ---------- [2/9] پوشه‌ها ----------
# (مسیر نصب توسط config.ps1 با تست واقعیِ قابل‌نوشتن بودن درایو انتخاب می‌شود:
#  اگر D: قابل نوشتن نباشد — مثلاً CD-ROM مجازی باشد — خودکار C: انتخاب می‌شود)
try {
    New-Item -ItemType Directory -Force -Path $AppDir, $LogDir -ErrorAction Stop | Out-Null
} catch {
    Write-Host "[خطا] ساخت پوشه‌های نصب در «$BaseDir» ممکن نشد: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "      راه‌حل: مسیر دیگری را دستی بدهید. مثال:" -ForegroundColor Yellow
    Write-Host '      powershell -ExecutionPolicy Bypass -File deploy.ps1 -BaseDir "C:\rose-hub"' -ForegroundColor Yellow
    exit 1
}
Write-Host ("[2/9] پوشه نصب آماده است: {0}" -f $BaseDir) -ForegroundColor Green

# ---------- [3/9] پیش‌نیازها: Git و Node.js ----------
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[خطا] Git نصب نیست! از https://git-scm.com/download/win نصبش کنید." -ForegroundColor Red
    exit 1
}
Ensure-NodeInPath
$nodeMajor = Get-NodeMajor
if ($nodeMajor -lt 20) {
    if ($nodeMajor -gt 0) {
        Write-Host ("      Node.js نصب‌شده قدیمی است (نسخه {0}) - نسخه جدید نصب می‌شود..." -f $nodeMajor) -ForegroundColor Yellow
    }
    Write-Host ("[3/9] نصب خودکار Node.js {0} LTS ..." -f $NodeVersion) -ForegroundColor Cyan
    $installed = $false

    # روش اول: winget (در ویندوز سرور 2025 معمولاً موجود است)
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        try {
            winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements | Out-Null
            if ($LASTEXITCODE -eq 0) { $installed = $true }
        } catch { $installed = $false }
    }

    # روش دوم: دانلود مستقیم MSI رسمی از nodejs.org
    if (-not $installed) {
        $msiPath = Join-Path $env:TEMP ("node-v{0}-x64.msi" -f $NodeVersion)
        $msiUrl  = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-x64.msi"
        Write-Host "      دانلود MSI از $msiUrl ..." -ForegroundColor Gray
        Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing
        Write-Host "      نصب بی‌صدای MSI (چند دقیقه)..." -ForegroundColor Gray
        Start-Process msiexec -ArgumentList "/i", "`"$msiPath`"", "/qn", "/norestart" -Wait
        Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
    }

    Ensure-NodeInPath
    if ((Get-NodeMajor) -lt 20) {
        Write-Host "[خطا] نصب Node.js ناموفق بود. لطفاً دستی نسخه 20+ را از https://nodejs.org نصب کنید." -ForegroundColor Red
        exit 1
    }
}
Write-Host ("[3/9] پیش‌نیازها OK - Node {0} | Git {1}" -f (node -v), (git --version)) -ForegroundColor Green

# ---------- [4/9] دریافت/به‌روزرسانی کد ----------
if (Test-Path (Join-Path $AppDir ".git")) {
    Write-Host "[4/9] پروژه موجود است؛ همگام‌سازی با GitHub..." -ForegroundColor Cyan
    git -C $AppDir fetch origin --prune
    if ($LASTEXITCODE -ne 0) { Write-Host "[خطا] git fetch ناموفق بود (اینترنت/توکن را بررسی کنید)." -ForegroundColor Red; exit 1 }
    git -C $AppDir reset --hard "origin/$Branch"
    if ($LASTEXITCODE -ne 0) { Write-Host "[خطا] git reset ناموفق بود." -ForegroundColor Red; exit 1 }
    # اگر توکن موجود است، remote هم با توکن تنظیم می‌شود (برای pullهای بعدی)
    $tok = Get-GitToken
    if ($tok) {
        git -C $AppDir remote set-url origin ("https://{0}@github.com/{1}/{2}.git" -f $tok, $RepoOwner, $RepoName) | Out-Null
    }
} else {
    $cloneUrl = Get-AuthRepoUrl
    Write-Host "[4/9] در حال کلون پروژه از GitHub..." -ForegroundColor Cyan
    git clone $cloneUrl $AppDir
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[خطا] کلون ناموفق بود. اتصال اینترنت و آدرس مخزن را بررسی کنید." -ForegroundColor Red
        exit 1
    }
}
Write-Host ("      نسخه فعال: {0}" -f (git -C $AppDir log --oneline -1)) -ForegroundColor Gray

# ---------- [5/9] دیتابیس و کلید امنیتی ----------
$dbPath = Join-Path $AppDir "db\custom.db"
if (-not (Test-Path $dbPath)) {
    New-Item -ItemType Directory -Force -Path (Join-Path $AppDir "db") | Out-Null
    Copy-Item (Join-Path $AppDir "deploy\db-template\custom.db") $dbPath
    Write-Host "[5/9] دیتابیس از تمپلیت ساخته شد (db\custom.db با داده‌های نمایشی)." -ForegroundColor Green
} else {
    Write-Host "[5/9] دیتابیس موجود حفظ شد (db\custom.db)." -ForegroundColor Green
}

$envLocalPath = Join-Path $AppDir ".env.local"
if (-not (Test-Path $envLocalPath)) {
    $bytes  = New-Object byte[] 32
    $rng    = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $secret = [System.BitConverter]::ToString($bytes).Replace("-", "").ToLower()
    ("AUTH_SECRET=" + $secret) | Out-File -FilePath $envLocalPath -Encoding ascii
    Write-Host "      کلید امضای توکن‌ها (AUTH_SECRET) تولید شد -> .env.local" -ForegroundColor Green
}

# ---------- توقف سرویس قبلی (قبل از دست‌کاری node_modules و build) ----------
$taskExists = $false
try { $taskExists = [bool](Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) } catch {}
if ($taskExists) {
    Write-Host "      توقف موقت سرویس قبلی..." -ForegroundColor Gray
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# ---------- [6/9] نصب پکیج‌ها ----------
Set-Location $AppDir
Write-Host "[6/9] نصب پکیج‌ها (npm install) - بسته به سرعت اینترنت چند دقیقه..." -ForegroundColor Cyan
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Write-Host "[خطا] npm install ناموفق بود." -ForegroundColor Red; exit 1 }

Write-Host "      ساخت Prisma Client (npx prisma generate)..." -ForegroundColor Cyan
npx prisma generate
if ($LASTEXITCODE -ne 0) { Write-Host "[خطا] prisma generate ناموفق بود." -ForegroundColor Red; exit 1 }

# ---------- [7/9] build نسخه Production ----------
$buildIdPath = Join-Path $AppDir ".next\BUILD_ID"
if ($SkipBuild -and (Test-Path $buildIdPath)) {
    Write-Host "[7/9] build قبلی موجود است؛ از build مجدد صرف‌نظر شد (-SkipBuild)." -ForegroundColor Yellow
} else {
    Write-Host "[7/9] ساخت نسخه Production (npm run build) - چند دقیقه طول می‌کشد..." -ForegroundColor Cyan
    $env:NODE_OPTIONS = "--max-old-space-size=4096"
    npm run build
    Remove-Item Env:\NODE_OPTIONS -ErrorAction SilentlyContinue
    if ($LASTEXITCODE -ne 0) { Write-Host "[خطا] npm run build ناموفق بود." -ForegroundColor Red; exit 1 }
}

# ---------- [8/9] فایروال + portproxy ----------
function Ensure-FirewallRule {
    param([string]$Name, [int]$Port)
    if (-not (Get-NetFirewallRule -DisplayName $Name -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $Name -Direction Inbound -Protocol TCP `
            -LocalPort $Port -Action Allow -Profile Any | Out-Null
    }
}
Ensure-FirewallRule -Name "RoseHub-Frontend-8088" -Port $FrontendPort
Ensure-FirewallRule -Name "RoseHub-Backend-3008"  -Port $BackendPort
Write-Host ("[8/9] قوانین فایروال برای پورت‌های {0} و {1} آماده شد." -f $FrontendPort, $BackendPort) -ForegroundColor Green

# سرویس IP Helper باید فعال باشد (برای portproxy)
try {
    Set-Service iphlpsvc -StartupType Automatic -ErrorAction SilentlyContinue
    Start-Service iphlpsvc -ErrorAction SilentlyContinue
} catch {}

# portproxy: پورت 8088 (فرانت) به پورت 3008 (بک‌اند) وصل می‌شود
# (با cmd /c اجرا می‌شود تا ریدایرکت stderr در PowerShell 5.1 با EAP=Stop مشکل نسازد)
$null = cmd /c "netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$FrontendPort 2>nul"
cmd /c "netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=$FrontendPort connectaddress=127.0.0.1 connectport=$BackendPort" | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host ("      portproxy فعال شد: پورت {0} -> 127.0.0.1:{1}" -f $FrontendPort, $BackendPort) -ForegroundColor Green
} else {
    Write-Host "      [هشدار] تنظیم portproxy ناموفق بود (فقط پورت بک‌اند در دسترس خواهد بود)." -ForegroundColor Yellow
}

# ---------- [9/9] سرویس ویندوزی + اجرا ----------
if (-not $NoService) {
    $action = New-ScheduledTaskAction -Execute "powershell.exe" `
        -Argument ("-NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f (Join-Path $AppDir "deploy\run-server.ps1")) `
        -WorkingDirectory $AppDir
    $trigger  = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
        -MultipleInstances IgnoreNew
    # بدون محدودیت زمان اجرا (سرویس همیشه باید بماند)
    try { $settings.ExecutionTimeLimit = "PT0S" } catch {
        try { $settings.ExecutionTimeLimit = ([TimeSpan]::FromDays(3650)) } catch {}
    }
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
        -Settings $settings -Principal $principal -Force | Out-Null
    Write-Host ("[9/9] سرویس ویندوزی «{0}» ثبت شد (شروع خودکار بعد از ری‌استارت + ری‌استارت خودکار تا 3 بار در صورت کرش)." -f $TaskName) -ForegroundColor Green

    Start-ScheduledTask -TaskName $TaskName
    Write-Host "      سرویس اجرا شد..." -ForegroundColor Cyan
} else {
    Write-Host "[9/9] حالت بدون سرویس (-NoService)؛ برنامه دستی اجرا می‌شود..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $AppDir "deploy\run-server.ps1")
}

# ---------- بررسی سلامت ----------
Write-Host "      بررسی سلامت سرور (حداکثر 90 ثانیه)..." -ForegroundColor Cyan
$healthy = Wait-RoseHealthy

Write-Host ""
if ($healthy) {
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host "   نصب با موفقیت انجام شد! برنامه در حال اجراست." -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Green
    Show-RoseUrls
} else {
    Write-Host "[هشدار] سرور هنوز پاسخ نمی‌دهد! آخرین لاگ‌ها:" -ForegroundColor Red
    if (Test-Path $LogFile) { Get-Content $LogFile -Tail 20 }
    Write-Host ""
    Write-Host "برای بررسی بیشتر:  powershell -File status.ps1   یا   powershell -File logs.ps1" -ForegroundColor Yellow
}
