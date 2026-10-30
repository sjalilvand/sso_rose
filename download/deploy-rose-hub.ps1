# =============================================================================
#  deploy-rose-hub.ps1 — استقرار رز هاب (Rose Hub) روی سرور ویندوز
#  هدف: اجرای برنامه به‌صورت production روی پورت 8082 با PM2
#  استفاده:
#     powershell -ExecutionPolicy Bypass -File .\deploy-rose-hub.ps1
#  پارامترها (اختیاری):
#     -InstallDir "C:\RoseHub"   مسیر نصب
#     -Port 8082                 پورت اجرا
#     -GitHubToken "ghp_..."     توکن گیت‌هاب (فقط اگر ریپو خصوصی شد؛ ریپو عمومی بدون توکن کلون می‌شود)
#  نکته: اجرای مکرر اسکریپت امن است — بار دوم به‌جای نصب، به‌روزرسانی می‌کند
#        (ابتدا برنامه را متوقف، از دیتابیس پشتیبان می‌گیرد و سپس برمی‌گرداند).
# =============================================================================

param(
    [string]$InstallDir  = "C:\RoseHub",
    [int]$Port           = 8082,
    [string]$RepoUrl     = "https://github.com/sjalilvand/sso_rose.git",
    [string]$GitUser     = "sjalilvand",
    [string]$GitHubToken = "",
    [string]$ServerIp    = "130.185.73.157"
)

# توجه: عمداً از "Stop" سراسری استفاده نکنیم تا خروجی stderr فرمان‌های بومی
# (git/npm/pm2) در PowerShell 5.1 باعث توقف اسکریپت نشود؛
# خطاهای بحرانی با $LASTEXITCODE و throw بررسی می‌شوند.
$ErrorActionPreference = "Continue"
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

function Write-Step($msg)  { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
}

function Test-NodeOk {
    try {
        $v = (& node -v) 2>$null
        if (-not $v) { return $false }
        $parts = ("$v".TrimStart("v")).Split(".")
        $major = [int]$parts[0]; $minor = [int]$parts[1]
        return ($major -gt 20) -or ($major -eq 20 -and $minor -ge 9)
    } catch { return $false }
}

function Ensure-Node {
    Write-Step "بررسی Node.js (نیازمند 20.9 به بالا)"
    if (Test-NodeOk) { Write-Ok "Node.js $(node -v) موجود است"; return }

    Write-Warn2 "Node.js مناسب یافت نشد — در حال نصب..."
    $haveWinget = (Get-Command winget -ErrorAction SilentlyContinue) -ne $null
    if ($haveWinget) {
        try { winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements --silent | Out-Null } catch {}
    }
    if (-not (Test-NodeOk)) {
        $msi = Join-Path $env:TEMP "node-v22-install.msi"
        Write-Host "  دانلود Node.js v22.14.0 (MSI) ..."
        Invoke-WebRequest -Uri "https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi" -OutFile $msi -UseBasicParsing
        Start-Process msiexec -ArgumentList "/i", $msi, "/qn", "/norestart" -Wait
    }
    Refresh-Path
    if (Test-NodeOk) { Write-Ok "Node.js $(node -v) نصب شد" }
    else { throw "نصب Node.js ناموفق بود. دستی نصب کنید (نسخه LTS): https://nodejs.org و سپس اسکریپت را دوباره اجرا کنید" }
}

function Ensure-Git {
    Write-Step "بررسی Git"
    if (Get-Command git -ErrorAction SilentlyContinue) { Write-Ok "Git موجود است"; return }

    Write-Warn2 "Git یافت نشد — در حال نصب..."
    $haveWinget = (Get-Command winget -ErrorAction SilentlyContinue) -ne $null
    if ($haveWinget) {
        try { winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements --silent | Out-Null } catch {}
    }
    Refresh-Path
    if (Get-Command git -ErrorAction SilentlyContinue) { Write-Ok "Git نصب شد" }
    else { throw "نصب Git ناموفق بود. دستی نصب کنید: https://git-scm.com/download/win و سپس اسکریپت را دوباره اجرا کنید" }
}

function TryStop-Pm2 {
    # اگر برنامه از قبل با pm2 اجرا می‌شود، قبل از به‌روزرسانی متوقفش کنیم
    if (Get-Command pm2 -ErrorAction SilentlyContinue) {
        try { pm2 stop rose-hub 2>$null | Out-Null } catch {}
        try { pm2 delete rose-hub 2>$null | Out-Null } catch {}
    }
}

function Backup-Database {
    $db = Join-Path $InstallDir "db\custom.db"
    if (-not (Test-Path $db)) { return $null }
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $bak   = Join-Path $InstallDir "db\custom-backup-$stamp.db"
    Copy-Item $db $bak -Force
    foreach ($ext in @("-wal", "-shm")) {
        $side = "$db$ext"
        if (Test-Path $side) { Copy-Item $side "$bak$ext" -Force }
    }
    Write-Ok "پشتیبان دیتابیس: $bak"
    return $bak
}

function Restore-Database($backup) {
    if (-not $backup) { return }
    $db = Join-Path $InstallDir "db\custom.db"
    Copy-Item $backup $db -Force
    foreach ($ext in @("-wal", "-shm")) {
        if (Test-Path "$backup$ext") { Copy-Item "$backup$ext" "$db$ext" -Force }
    }
    Write-Ok "دیتابیس زنده پس از به‌روزرسانی برقرار شد"
}

function Get-Source {
    Write-Step "دریافت سورس پروژه در $InstallDir"
    $remote = $RepoUrl
    if ($GitHubToken) {
        $remote = "https://$($GitUser):$($GitHubToken)@github.com/sjalilvand/sso_rose.git"
    }

    if (Test-Path (Join-Path $InstallDir ".git")) {
        Write-Host "  پروژه موجود است — به‌روزرسانی از GitHub ..."
        git -C $InstallDir remote set-url origin $remote | Out-Null
        git -C $InstallDir fetch origin 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "به‌روزرسانی از GitHub ناموفق بود (اتصال اینترنت یا اعتبار توکن را بررسی کنید)" }
        git -C $InstallDir reset --hard origin/main 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "به‌روزرسانی سورس ناموفق بود" }
        Write-Ok "سورس به آخرین نسخه main به‌روز شد"
    }
    else {
        if ((Test-Path $InstallDir) -and ((Get-ChildItem $InstallDir -Force | Measure-Object).Count -gt 0)) {
            throw "پوشه $InstallDir موجود است ولی مخزن Git نیست. مسیر دیگری بدهید: -InstallDir"
        }
        Write-Host "  کلون مخزن (ممکن است چند دقیقه طول بکشد) ..."
        git clone $remote $InstallDir 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "کلون مخزن ناموفق بود (اتصال اینترنت یا اعتبار توکن را بررسی کنید)" }
        Write-Ok "کلون کامل شد"
    }
}

function Set-EnvFile {
    Write-Step "تنظیم فایل .env"
    $envPath = Join-Path $InstallDir ".env"
    # مسیر نسبی نسبت به پوشه prisma — روی ویندوز و لینوکس یکسان کار می‌کند
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($envPath, "DATABASE_URL=file:../db/custom.db`n", $utf8NoBom)
    Write-Ok "DATABASE_URL تنظیم شد"
}

function Invoke-Build {
    Push-Location $InstallDir
    try {
        Write-Step "نصب وابستگی‌ها (npm install) — چند دقیقه طول می‌کشد"
        npm install --no-audit --no-fund 2>$null
        if ($LASTEXITCODE -ne 0) { throw "npm install ناموفق بود" }
        Write-Ok "وابستگی‌ها نصب شد"

        Write-Step "تولید کلاینت Prisma"
        npx prisma generate 2>$null
        if ($LASTEXITCODE -ne 0) { throw "prisma generate ناموفق بود" }
        Write-Ok "کلاینت Prisma تولید شد"

        Write-Step "همگام‌سازی اسکیمای دیتابیس"
        npx prisma db push --accept-data-loss --skip-generate 2>$null
        if ($LASTEXITCODE -ne 0) { throw "prisma db push ناموفق بود" }
        Write-Ok "اسکیمای دیتابیس همگام است"

        Write-Step "ساخت نسخه production (next build) — چند دقیقه طول می‌کشد"
        npm run build 2>$null
        if ($LASTEXITCODE -ne 0) { throw "next build ناموفق بود" }
        Write-Ok "بیلد تولیدی ساخته شد"
    }
    finally { Pop-Location }
}

function Open-Firewall {
    Write-Step "باز کردن پورت $Port در فایروال ویندوز"
    $ruleName = "Rose Hub $Port"
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Warn2 "با دسترسی Administrator اجرا نشده — قانون فایروال اضافه نشد. دستی اجرا کنید:"
        Write-Host "    netsh advfirewall firewall add rule name=`"$ruleName`" dir=in action=allow protocol=TCP localport=$Port" -ForegroundColor Yellow
        return
    }
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if ($existing) { Write-Ok "قانون فایروال از قبل موجود است"; return }
    try {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Any | Out-Null
        Write-Ok "پورت $Port برای دسترسی عمومی باز شد"
    } catch {
        netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=$Port | Out-Null
        Write-Ok "پورت $Port باز شد (netsh)"
    }
}

function Start-WithPm2 {
    Write-Step "راه‌اندازی سرویس با PM2 (اجرای دائمی + شروع خودکار)"

    if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
        npm install -g pm2 pm2-windows-startup --no-audit --no-fund 2>$null
        if ($LASTEXITCODE -ne 0) { throw "نصب pm2 ناموفق بود" }
        Refresh-Path
    }

    # فایل پیکربندی PM2 با پورت انتخابی
    $ecoPath = Join-Path $InstallDir "ecosystem.config.js"
    $eco = @"
module.exports = {
  apps: [{
    name: "rose-hub",
    script: "node_modules/next/dist/bin/next",
    args: "start -p $Port",
    cwd: __dirname,
    env: {
      NODE_ENV: "production",
      PORT: "$Port"
    },
    autorestart: true,
    max_memory_restart: "700M",
    time: true
  }]
};
"@
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($ecoPath, $eco, $utf8NoBom)

    Push-Location $InstallDir
    try {
        pm2 start ecosystem.config.js 2>$null
        if ($LASTEXITCODE -ne 0) { throw "pm2 start ناموفق بود" }
        pm2 save 2>$null | Out-Null
        try { pm2-startup install 2>$null | Out-Null } catch { }
        Write-Ok "برنامه با PM2 اجرا شد و برای شروع خودکار ثبت شد"
    }
    finally { Pop-Location }
}

function Wait-Healthy {
    Write-Step "بررسی سلامت برنامه روی پورت $Port"
    for ($i = 0; $i -lt 45; $i++) {
        Start-Sleep -Seconds 2
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/login" -UseBasicParsing -TimeoutSec 5
            if ($r.StatusCode -eq 200) { Write-Ok "برنامه پاسخ می‌دهد"; return $true }
        } catch {}
    }
    Write-Warn2 "برنامه پاسخ نداد — برای بررسی: pm2 logs rose-hub"
    return $false
}

function Show-Summary($healthy) {
    Write-Host ""
    Write-Host "=================================================================" -ForegroundColor Magenta
    Write-Host "   رز هاب (Rose Hub) روی سرور مستقر شد" -ForegroundColor Magenta
    Write-Host "=================================================================" -ForegroundColor Magenta
    Write-Host "  نشانی برنامه     : http://$ServerIp`:$Port"
    Write-Host "  نشانی محلی سرور  : http://localhost`:$Port"
    Write-Host "  حساب مدیر        : admin@rose.ir / rose1234"
    Write-Host "  مسیر نصب         : $InstallDir"
    Write-Host "-----------------------------------------------------------------"
    if ($healthy) {
        Write-Host "  وضعیت            : در حال اجرا" -ForegroundColor Green
    } else {
        Write-Host "  وضعیت            : نیاز به بررسی — pm2 logs rose-hub" -ForegroundColor Yellow
    }
    Write-Host "-----------------------------------------------------------------"
    Write-Host "  دستورات مدیریتی:"
    Write-Host "    pm2 status               وضعیت برنامه"
    Write-Host "    pm2 logs rose-hub        مشاهده لاگ‌ها"
    Write-Host "    pm2 restart rose-hub     شروع مجدد"
    Write-Host "    pm2 stop rose-hub        توقف"
    Write-Host "  به‌روزرسانی از GitHub (هر بار که ریپو تغییر کرد):"
    Write-Host "    powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    Write-Host "=================================================================" -ForegroundColor Magenta
    Write-Host ""
    Write-Host "  نکته: پس از ری‌استارت سرور، برنامه با اولین ورود کاربر (RDP) خودکار بالا می‌آید (pm2-startup)." -ForegroundColor DarkGray
    Write-Host ""
}

# ================================ main =======================================
Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  استقرار رز هاب | Rose Hub → پورت $Port" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

Ensure-Node
Ensure-Git
TryStop-Pm2
$backup = Backup-Database
Get-Source
Restore-Database $backup
Set-EnvFile
Invoke-Build
Open-Firewall
Start-WithPm2
$healthy = Wait-Healthy
Show-Summary $healthy
