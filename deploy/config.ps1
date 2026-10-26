# =====================================================================
#  رز هاب (Rose Hub) — تنظیمات مشترک استقرار
#  این فایل توسط همه اسکریپت‌های deploy فراخوانی (dot-source) می‌شود.
#  برای تغییر مسیر یا پورت‌ها بدون دست‌کاری این فایل، می‌توانید
#  فایل «local-config.ps1» کنار همین فایل بسازید و متغیرها را بازنویسی کنید.
# =====================================================================

# --- مخزن و شاخه ---
$RepoOwner = "sjalilvand"
$RepoName  = "sso_rose"
$RepoUrl   = "https://github.com/$RepoOwner/$RepoName.git"
$Branch    = "main"

# --- پورت‌ها ---
$FrontendPort = 8088   # ورودی کاربران (فرانت) - با portproxy ویندوز به بک‌اند وصل می‌شود
$BackendPort  = 3008   # سرور واقعی Next.js (بک‌اند + API)

# --- نسخه Node.js برای نصب خودکار (LTS) ---
$NodeVersion = "22.14.0"

# --- نام سرویس در Task Scheduler ویندوز ---
$TaskName = "RoseHub"

# --- مسیر نصب: اگر درایو D موجود باشد D:\rose-hub وگرنه C:\rose-hub ---
if (Test-Path "D:\") { $BaseDir = "D:\rose-hub" } else { $BaseDir = "C:\rose-hub" }
$AppDir  = Join-Path $BaseDir "app"
$LogDir  = Join-Path $BaseDir "logs"
$LogFile = Join-Path $LogDir "rose-hub.log"

# --- محل فایل توکن (این فایل gitignore شده و هرگز push نمی‌شود) ---
$TokenFile = Join-Path $PSScriptRoot "github-token.txt"

# ---------------------------------------------------------------------
#  توابع کمکی مشترک
# ---------------------------------------------------------------------

function Get-GitToken {
    # توکن را به ترتیب از این منابع می‌خواند:
    #   1) متغیر محیطی GH_TOKEN
    #   2) فایل deploy\github-token.txt
    #   3) توکن ذخیره‌شده در remote URL کلون موجود
    if ($env:GH_TOKEN -and $env:GH_TOKEN.Trim()) { return $env:GH_TOKEN.Trim() }
    if (Test-Path $TokenFile) {
        $t = Get-Content $TokenFile -Raw -ErrorAction SilentlyContinue
        if ($t) { $t = $t.Trim(); if ($t) { return $t } }
    }
    if (Test-Path (Join-Path $AppDir ".git")) {
        $u = $null
        try { $u = git -C $AppDir remote get-url origin 2>$null } catch { $u = $null }
        if ($u -and ($u -is [string]) -and $u -match "https://([^@/]+)@github\.com") { return $Matches[1] }
    }
    return $null
}

function Get-AuthRepoUrl {
    # آدرس مخزن همراه توکن (اگر موجود باشد)
    $t = Get-GitToken
    if ($t) { return "https://$t@github.com/$RepoOwner/$RepoName.git" }
    return $RepoUrl
}

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $pr = New-Object Security.Principal.WindowsPrincipal($id)
    return $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-NodeMajor {
    # نسخه major مربوط به Node.js نصب‌شده؛ اگر نصب نبود 0 برمی‌گرداند
    try {
        $v = (& node -v) 2>$null
        if (-not $v) { return 0 }
        $v = ([string]$v).Trim() -replace "^v", ""
        return [int]($v.Split(".")[0])
    } catch { return 0 }
}

function Ensure-NodeInPath {
    # اطمینان از این‌که node در PATH نشست فعلی هست (مخصوصاً برای حساب SYSTEM)
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath    = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath;$env:Path"
}

function Write-Log {
    param([string]$Message)
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
    ("[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message) |
        Out-File $LogFile -Append -Encoding utf8
}

function Test-RoseHealthy {
    # بررسی سلامت سرور روی پورت بک‌اند؛ True یعنی برنامه پاسخ می‌دهد
    try {
        $r = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/login" -f $BackendPort) `
                -UseBasicParsing -TimeoutSec 4
        return ($r.StatusCode -eq 200)
    } catch { return $false }
}

function Wait-RoseHealthy {
    # تا 90 ثانیه منتظر بالا آمدن برنامه می‌ماند
    for ($i = 0; $i -lt 45; $i++) {
        Start-Sleep -Seconds 2
        if (Test-RoseHealthy) { return $true }
    }
    return $false
}

function Get-ServerIps {
    # فهرست IPهای IPv4 سرور (برای نمایش آدرس‌های دسترسی)
    $ips = @()
    try {
        $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
            Select-Object -ExpandProperty IPAddress -Unique
    } catch {}
    return @($ips)
}

function Show-RoseUrls {
    # نمایش آدرس‌های نهایی دسترسی
    Write-Host ""
    Write-Host "  ---------------- آدرس‌های دسترسی ----------------" -ForegroundColor Cyan
    Write-Host ("   فرانت‌اند (کاربران)   : http://localhost:{0}" -f $FrontendPort) -ForegroundColor Yellow
    Write-Host ("   بک‌اند / API          : http://localhost:{0}" -f $BackendPort) -ForegroundColor Yellow
    foreach ($ip in (Get-ServerIps)) {
        Write-Host ("   فرانت‌اند از شبکه     : http://{0}:{1}" -f $ip, $FrontendPort) -ForegroundColor Yellow
        Write-Host ("   بک‌اند از شبکه        : http://{0}:{1}" -f $ip, $BackendPort) -ForegroundColor Yellow
    }
    Write-Host "  ------------------------------------------------" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  ورود مدیر کل: admin@rose.ir / rose1234  (بعد از راه‌اندازی رمز را عوض کنید!)" -ForegroundColor Gray
}

# --- تنظیمات محلی اختیاری (بازنویسی مقادیر بالا) ---
$LocalConfigPath = Join-Path $PSScriptRoot "local-config.ps1"
if (Test-Path $LocalConfigPath) { . $LocalConfigPath }
