# =============================================================================
#  update-rosehub.ps1 — به‌روزرسانی رز هاب روی سرور از گیت‌هاب
#  کارها: git pull + npm install + prisma + اصلاح نام/نشانی سامانه‌ها در دیتابیس
#         + build + ری‌استارت PM2 + تست سلامت
#  استفاده:
#     powershell -ExecutionPolicy Bypass -File C:\update-rosehub.ps1
#  پارامترها (اختیاری):
#     -InstallDir "C:\RoseHub"   مسیر نصب
#     -Port 8082                 پورت اجرا
#     -GitHubToken "ghp_..."     فقط اگر مخزن خصوصی شده باشد
#  نکته: فایل‌های untracked مانند .env و دیتابیس rose.db دست‌نخورده می‌مانند.
# =============================================================================

param(
    [string]$InstallDir  = "C:\RoseHub",
    [int]$Port           = 8082,
    [string]$GitHubToken = ""
)

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
Refresh-Path

# ---------- گام ۱: بررسی پوشه نصب ----------
Write-Step "گام ۱/۷ — بررسی پوشه نصب رز هاب"
if (-not (Test-Path (Join-Path $InstallDir "package.json"))) {
    throw "رز هاب در $InstallDir یافت نشد — ابتدا deploy-rose-hub.ps1 را اجرا کنید."
}
Set-Location $InstallDir
Write-Ok "مسیر نصب: $InstallDir"

# ---------- گام ۲: همگام‌سازی کد از گیت‌هاب ----------
Write-Step "گام ۲/۷ — همگام‌سازی کد از گیت‌هاب"
if ($GitHubToken -ne "") {
    git remote set-url origin "https://sjalilvand:$GitHubToken@github.com/sjalilvand/sso_rose.git" 2>$null
}
git fetch origin main 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "دسترسی به گیت‌هاب ممکن نشد (اینترنت/توکن را بررسی کنید)" }

$localCommit = (git rev-parse HEAD).Trim()
$remoteCommit = (git rev-parse origin/main).Trim()
if ($localCommit -eq $remoteCommit) {
    Write-Ok "کد از قبل آخرین نسخه است ($($localCommit.Substring(0,7)))"
} else {
    # تغییرات موضعی روی فایل‌های tracked نادیده گرفته می‌شود؛ untracked (مثل .env و rose.db) حفظ می‌شود
    git reset --hard origin/main 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "git reset ناموفق بود" }
    Write-Ok "کد به $($remoteCommit.Substring(0,7)) به‌روز شد (فایل‌های محلی مانند .env و rose.db دست‌نخورده ماندند)"
}

# ---------- گام ۳: نصب وابستگی‌ها (میرور ایرانی با fallback) ----------
Write-Step "گام ۳/۷ — نصب وابستگی‌های npm"
$mirror = "https://archive.ito.gov.ir/mirror2/npm/"
$useRegistry = ""
try {
    $probe = Invoke-WebRequest -Uri $mirror -Method Head -UseBasicParsing -TimeoutSec 8
    if ($probe.StatusCode -lt 500) { $useRegistry = $mirror }
} catch {}
if ($useRegistry -ne "") {
    Write-Host "  npm install از میرور $mirror ..."
    npm install --registry $useRegistry --no-audit --no-fund 2>$null
}
if ($LASTEXITCODE -ne 0) {
    Write-Warn2 "نصب از میرور ناموفق بود — تلاش با رجیستری رسمی"
    npm install --no-audit --no-fund 2>$null
    if ($LASTEXITCODE -ne 0) { throw "npm install ناموفق بود" }
}
Write-Ok "وابستگی‌ها نصب شدند"

# ---------- گام ۴: Prisma (کلاینت + همگام‌سازی اسکیما) ----------
Write-Step "گام ۴/۷ — Prisma (generate + db push)"
npx prisma generate 2>$null
if ($LASTEXITCODE -ne 0) { throw "prisma generate ناموفق بود" }
npx prisma db push --accept-data-loss --skip-generate 2>$null
if ($LASTEXITCODE -ne 0) { Write-Warn2 "prisma db push ناموفق بود — اگر اسکیما تغییری نکرده باشد مشکلی نیست" }
Write-Ok "Prisma آماده است"

# ---------- گام ۵: اصلاح نام و نشانی سامانه‌ها در دیتابیس ----------
Write-Step "گام ۵/۷ — همگام‌سازی نام و نشانی سامانه‌ها در دیتابیس"
if (Test-Path "scripts\bind-sso-systems.cjs") {
    node scripts/bind-sso-systems.cjs
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "نام و نشانی سامانه‌ها (رز سای / رز سنتر / حضور و غیاب) همگام شد"
    } else {
        Write-Warn2 "اجرای bind-sso-systems ناموفق بود — بعداً دستی اجرا کنید: node scripts\bind-sso-systems.cjs"
    }
} else {
    Write-Warn2 "scripts\bind-sso-systems.cjs یافت نشد — رد شد"
}

# ---------- گام ۶: ساخت نسخه production ----------
Write-Step "گام ۶/۷ — build نسخه production (چند دقیقه)"
npm run build 2>$null
if ($LASTEXITCODE -ne 0) { throw "build ناموفق بود — خروجی بالا را بررسی کنید" }
Write-Ok "build کامل شد (.next)"

# ---------- گام ۷: ری‌استارت PM2 و تست سلامت ----------
Write-Step "گام ۷/۷ — ری‌استارت برنامه (PM2)"
$pm2Name = "rose-hub"
$inList = $false
try {
    $jl = pm2 jlist 2>$null | ConvertFrom-Json
    if ($jl) { $inList = ($jl | Where-Object { $_.name -eq $pm2Name }) -ne $null }
} catch {}
if ($inList) {
    pm2 restart $pm2Name --update-env 2>$null | Out-Null
    Write-Ok "PM2: $pm2Name ری‌استارت شد"
} else {
    pm2 start ecosystem.config.js 2>$null | Out-Null
    pm2 save 2>$null | Out-Null
    Write-Ok "PM2: برنامه از ecosystem.config.js اجرا شد"
}

Write-Host ""
Write-Step "بررسی سلامت"
$healthy = $false
for ($i = 0; $i -lt 15; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/login" -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch { Start-Sleep -Seconds 2 }
}
if ($healthy) {
    Write-Ok "رز هاب روی پورت $Port سالم است"
    Write-Host ""
    Write-Host "================================================================="
    Write-Host "  به‌روزرسانی رز هاب کامل شد"
    Write-Host "================================================================="
    Write-Host "  نشانی            : http://130.185.73.157:$Port"
    Write-Host "  تغییرات این نسخه :"
    Write-Host "    - مدیریت کامل کاربران: افزودن، ویرایش کامل (نام، ایمیل، رمز، نقش،"
    Write-Host "      وضعیت، مجوز سامانه‌ها) و حذف کامل با تأیید"
    Write-Host "    - نام سامانهٔ پورت 8085 از «تکنورز» به «حضور و غیاب» اصلاح شد"
    Write-Host "  نکته: پس از بازکردن صفحه Ctrl+F5 بزنید تا کش مرورگر پاک شود."
    Write-Host "================================================================="
} else {
    Write-Warn2 "برنامه پاسخ نداد — بررسی: pm2 logs rose-hub"
}
