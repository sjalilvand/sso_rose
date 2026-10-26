# =====================================================================
#  رز هاب — ثبت/به‌روزرسانی توکن گیت‌هاب روی سرور
#  نحوه اجرا:  powershell -ExecutionPolicy Bypass -File set-token.ps1 -Token ghp_xxxxxxxxxxxx
#
#  توکن در دو جا ثبت می‌شود:
#    1) remote URL کلون موجود (git pull های بعدی بدون رمز کار می‌کنند)
#    2) فایل deploy\github-token.txt  (برای کلون‌های آینده - gitignore شده)
# =====================================================================

param(
    [Parameter(Mandatory = $true)]
    [string]$Token
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "config.ps1")

Write-Host ""
Write-Host "===== ثبت توکن گیت‌هاب =====" -ForegroundColor Magenta

$Token = $Token.Trim()
if (-not $Token) { Write-Host "[خطا] توکن خالی است." -ForegroundColor Red; exit 1 }

# 1) ذخیره در فایل محلی (gitignore شده - هرگز push نمی‌شود)
Set-Content -Path $TokenFile -Value $Token -Encoding ascii
Write-Host ("توکن در فایل ذخیره شد: {0}" -f $TokenFile) -ForegroundColor Green

# 2) به‌روزرسانی remote URL کلون موجود
if (Test-Path (Join-Path $AppDir ".git")) {
    $newUrl = "https://{0}@github.com/{1}/{2}.git" -f $Token, $RepoOwner, $RepoName
    git -C $AppDir remote set-url origin $newUrl
    Write-Host "remote URL کلون موجود به‌روزرسانی شد:" -ForegroundColor Green
    # نمایش با پوشاندم توکن
    $shown = git -C $AppDir remote get-url origin
    Write-Host ("   {0}" -f ($shown -replace [regex]::Escape($Token), "********")) -ForegroundColor Gray
} else {
    Write-Host "کلونی در $AppDir وجود ندارد؛ توکن فقط در فایل ذخیره شد (هنگام deploy.ps1 استفاده می‌شود)." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "توصیه امنیتی: توکن باید حداقل دسترسی (scope) را داشته باشد؛" -ForegroundColor Gray
Write-Host "پس از اتمام کار یا در دوره‌های منظم، توکن را در GitHub حذف/تمدید (Regenerate) کنید." -ForegroundColor Gray
