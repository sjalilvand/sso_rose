# ==============================================================
#  رز هاب | Rose Hub v1.0 — اسکریپت نصب و اجرا روی ویندوز
#  مسیر نصب: D:\Projects\sso_rose
#  منبع: https://github.com/sjalilvand/sso_rose
#  پیش‌نیاز: Git + Node.js نسخه 20 یا جدیدتر
# ==============================================================

$ErrorActionPreference = "Stop"
$Target = "D:\Projects\sso_rose"
$Repo   = "https://github.com/sjalilvand/sso_rose.git"

Write-Host ""
Write-Host "===== نصب و اجرای رز هاب (Rose Hub) =====" -ForegroundColor Magenta
Write-Host ""

# --- 0) بررسی پیش‌نیازها ---
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[خطا] Git نصب نیست! ابتدا از https://git-scm.com/download/win نصبش کنید." -ForegroundColor Red
    Read-Host "برای بستن Enter بزنید"; exit 1
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[خطا] Node.js نصب نیست! نسخه LTS (20 یا بالاتر) را از https://nodejs.org نصب کنید." -ForegroundColor Red
    Read-Host "برای بستن Enter بزنید"; exit 1
}
Write-Host "[0/5] پیش‌نیازها OK — Node $(node -v) | Git $(git --version)" -ForegroundColor Green

# --- 1) ساخت مسیر D:\Projects ---
New-Item -ItemType Directory -Force -Path "D:\Projects" | Out-Null
Write-Host "[1/5] مسیر D:\Projects آماده است." -ForegroundColor Green

# --- 2) دریافت پروژه از GitHub (پروژه کامیت‌شده است) ---
if (Test-Path "$Target\.git") {
    Write-Host "[2/5] پروژه قبلاً وجود دارد؛ دریافت آخرین نسخه..." -ForegroundColor Yellow
    Set-Location $Target
    git pull origin main
} else {
    Write-Host "[2/5] در حال دریافت (کلون) پروژه از GitHub..." -ForegroundColor Cyan
    git clone $Repo $Target
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[خطا] کلون ناموفق بود؛ اتصال اینترنت و آدرس ریپو را بررسی کنید." -ForegroundColor Red
        Read-Host "برای بستن Enter بزنید"; exit 1
    }
    Set-Location $Target
}

# --- 3) نمایش کامیت‌های پروژه ---
Write-Host "[3/5] تاریخچه کامیت‌های پروژه:" -ForegroundColor Cyan
git log --oneline --decorate -6
Write-Host ""

# --- 4) نصب پکیج‌ها و آماده‌سازی دیتابیس ---
Write-Host "[4/5] نصب پکیج‌ها (بسته به سرعت اینترنت چند دقیقه طول می‌کشد)..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "[خطا] npm install ناموفق بود." -ForegroundColor Red
    Read-Host "برای بستن Enter بزنید"; exit 1
}
npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "[خطا] prisma generate ناموفق بود." -ForegroundColor Red
    Read-Host "برای بستن Enter بزنید"; exit 1
}

# --- 4.5) آماده‌سازی دیتابیس نمایشی (از تمپلیت) ---
if (-not (Test-Path "$Target\db\custom.db")) {
    New-Item -ItemType Directory -Force -Path "$Target\db" | Out-Null
    Copy-Item "$Target\deploy\db-template\custom.db" "$Target\db\custom.db"
    Write-Host "      دیتابیس نمایشی از deploy\db-template ساخته شد." -ForegroundColor Green
} else {
    Write-Host "      دیتابیس موجود حفظ شد (db\custom.db)." -ForegroundColor Green
}
# فایل .env در صورت نبود از مقدار پیش‌فرض ساخته می‌شود
if (-not (Test-Path "$Target\.env")) {
    "DATABASE_URL=file:../db/custom.db" | Out-File -FilePath "$Target\.env" -Encoding ascii
}

# --- 5) اجرای برنامه ---
Write-Host "[5/5] اجرای برنامه..." -ForegroundColor Green
Write-Host ""
Write-Host "  >>> آدرس برنامه   : http://localhost:3000" -ForegroundColor Yellow
Write-Host "  >>> ورود مدیر کل  : admin@rose.ir  |  رمز: rose1234" -ForegroundColor Yellow
Write-Host "  >>> حساب‌های نمایشی دیگر در صفحه ورود کلیک‌شدنی هستند." -ForegroundColor Yellow
Write-Host "  >>> برای توقف برنامه: Ctrl+C" -ForegroundColor Gray
Write-Host ""
npm run dev
