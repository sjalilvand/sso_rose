# راهنمای استقرار رز هاب (Rose Hub) روی ویندوز سرور — بدون داکر

این پوشه شامل همه اسکریپت‌های PowerShell لازم برای نصب، به‌روزرسانی، اجرا و مدیریت
برنامه «رز هاب» روی **Windows Server** است. هیچ نیازی به داکر نیست؛ همه‌چیز با
Git + Node.js + Task Scheduler ویندوز انجام می‌شود.

---

## مشخصات این استقرار

| مورد | مقدار |
|---|---|
| سرور | Windows Server 2025 |
| مسیر نصب | `D:\rose-hub` (اگر درایو D نباشد: `C:\rose-hub`) |
| **فرانت‌اند (ورودی کاربران)** | **پورت 8088** |
| **بک‌اند / API (سرور اصلی Next.js)** | **پورت 3008** |
| سرویس ویندوزی | نام `RoseHub` در Task Scheduler — شروع خودکار با بوت + ری‌استارت خودکار تا ۳ بار در صورت کرش |
| دیتابیس | SQLite — `<مسیر نصب>\app\db\custom.db` (داخل سرور، جدا از گیت) |
| لاگ برنامه | `<مسیر نصب>\logs\rose-hub.log` (چرخش خودکار بعد از 10MB) |

### معماری پورت‌ها (مهم)

این برنامه یک اپلیکیشن **یکپارچه (Monolith)** است: فرانت‌اند و بک‌اند (مسیرهای
`/api/...`) در **یک پروسه Next.js** اجرا می‌شوند. بنابراین:

- سرور واقعی برنامه روی **پورت 3008** بالا می‌آید (بک‌اند).
- پورت **8088** با `netsh portproxy` ویندوز به همان سرور وصل می‌شود (فرانت).
- هر دو آدرس در مرورگر کار می‌کنند و کوکی‌ها/احراز هویت در هر دو سالم است:

```
http://<IP-SERVER>:8088   →  پنل کاربران (فرانت‌اند)
http://<IP-SERVER>:3008   →  بک‌اند / نقطه اتصال API (همان برنامه)
```

---

## نصب — فقط بار اول

### روش ۱: اجرای یک‌خطی (توصیه‌شده)

پنجره **PowerShell با دسترسی Administrator** باز کنید و این ۳ خط را اجرا کنید:

```powershell
[Net.ServicePointManager]::SecurityProtocol='Tls12'
irm https://raw.githubusercontent.com/sjalilvand/sso_rose/main/deploy/bootstrap.ps1 -OutFile "$env:TEMP\rose-hub-bootstrap.ps1"
powershell -ExecutionPolicy Bypass -File "$env:TEMP\rose-hub-bootstrap.ps1"
```

این دستور پروژه را کلون می‌کند و بلافاصله `deploy.ps1` را اجرا می‌کند.

### روش ۲: دستی

```powershell
git clone https://github.com/sjalilvand/sso_rose.git D:\rose-hub\app
cd D:\rose-hub\app\deploy
powershell -ExecutionPolicy Bypass -File deploy.ps1
```

> **دسترسی Administrator لازم است** (فایروال + portproxy + ثبت سرویس).

### اسکریپت نصب به‌طور خودکار این کارها را می‌کند:

1. بررسی دسترسی Administrator
2. ساخت پوشه‌های نصب و لاگ
3. بررسی Git؛ در صورت نبود/قدیمی بودن Node.js: نصب خودکار (اول winget، بعد MSI رسمی nodejs.org)
4. کلون یا همگام‌سازی کد از GitHub (اگر توکن ثبت شده باشد، از آن استفاده می‌کند)
5. ساخت دیتابیس اولیه از تمپلیت (فقط بار اول؛ دیتابیس موجود هرگز بازنویسی نمی‌شود)
6. تولید کلید امنیتی تصادفی `AUTH_SECRET` در `.env.local`
7. `npm install` + `prisma generate`
8. `npm run build` (نسخه Production)
9. قوانین فایروال برای پورت‌های 8088 و 3008 + تنظیم portproxy
10. ثبت سرویس `RoseHub` در Task Scheduler و اجرا + بررسی سلامت

---

## ثبت توکن گیت‌هاب (اختیاری ولی توصیه‌شده)

اگر مخزن خصوصی (Private) شود یا می‌خواهید pull ها احراز هویت داشته باشند:

```powershell
powershell -ExecutionPolicy Bypass -File set-token.ps1 -Token ghp_XXXXX
```

توکن در remote URL و در فایل `deploy\github-token.txt` ذخیره می‌شود (این فایل
gitignore است و هرگز push نمی‌شود).

> ⚠️ **توصیه امنیتی:** توکنی که در گفتگو/چت کپی شده را بعد از اتمام کار از
> GitHub → Settings → Developer settings → Personal access tokens حذف یا
> Regenerate کنید.

---

## به‌روزرسانی برنامه (بعد از push جدید به GitHub)

```powershell
powershell -ExecutionPolicy Bypass -File update.ps1
```

- کد از `main` همگام می‌شود، پکیج‌ها نصب، build جدید گرفته و سرویس ری‌استارت می‌شود.
- **دیتابیس زنده دست نمی‌خورد** (db\custom.db از گیت خارج شده است).
- در طول build، برنامه حدوداً ۲ تا ۵ دقیقه downtime دارد.

---

## مدیریت روزانه

| کار | دستور |
|---|---|
| وضعیت سرویس و پورت‌ها | `powershell -File status.ps1` |
| شروع | `powershell -File start.ps1` |
| توقف | `powershell -File stop.ps1` |
| ری‌استارت | `powershell -File restart.ps1` |
| مشاهده لاگ (آخرین ۸۰ خط) | `powershell -File logs.ps1` |
| مشاهده لاگ زنده | `powershell -File logs.ps1 -Follow` |
| حذف سرویس (نگه‌داشتن فایل‌ها) | `powershell -File uninstall.ps1` |
| حذف کامل (همراه بک‌اپ دیتابیس) | `powershell -File uninstall.ps1 -DeleteFiles` |

همه اسکریپت‌ها را در پوشه `deploy` اجرا کنید.

---

## پشتیبان‌گیری و بازیابی دیتابیس

کل دیتابیس یک فایل SQLite است:

- **پشتیبان‌گیری:** فایل `app\db\custom.db` را کپی کنید (بهتر است اول `stop.ps1` بزنید یا هنگام کم‌ترافیک).
- **بازیابی:** فایل پشتیبان را به جای `app\db\custom.db` بگذارید و `restart.ps1` بزنید.

اگر در آینده `prisma/schema.prisma` تغییر کند، بعد از `update.ps1` این دستور را
یک‌بار از پوشه `app` اجرا کنید:

```powershell
$env:DATABASE_URL="file:" + ((Get-Location).Path + "/db/custom.db"); npx prisma db push
```

---

## رفع اشکال (Troubleshooting)

**برنامه بالا نمی‌آید / پورت پاسخ نمی‌دهد**
1. `status.ps1` را اجرا کنید تا وضعیت سرویس و پورت‌ها معلوم شود.
2. `logs.ps1 -Tail 200` — خطای دقیق در لاگ هست.
3. اگر خطای `EADDRINUSE` بود، پورت اشغال است: `stop.ps1` بزنید و `netstat -ano | findstr :3008` را چک کنید.

**پورت 8088 جواب نمی‌دهد ولی 3008 سالم است**
- portproxy از کار افتاده: `netsh interface portproxy show all` را ببینید یا
  `deploy.ps1` را دوباره اجرا کنید (تنظیمات idempotent است و چیز موجود را خراب نمی‌کند).
- سرویس `IP Helper` (iphlpsvc) باید Running باشد.

**`npm run build` خطای کمبود حافظه داد**
- سرور حداقل 2GB رم داشته باشد؛ اسکریپت‌ها از `--max-old-space-size=4096` استفاده می‌کنند.

**git fetch خطای احراز هویت داد**
- توکن منقضی شده: `set-token.ps1 -Token <توکن-جدید>` را اجرا کنید.

**خواستم دیتابیس را از صفر شروع کنم**
- `stop.ps1` → فایل `app\db\custom.db` را حذف کنید → `start.ps1` (دیتابیس تمپلیت با داده‌های نمایشی دوباره ساخته می‌شود).

---

## نکات امنیتی

- بعد از اولین ورود، رمز حساب `admin@rose.ir` را عوض کنید (پروفایل → تغییر رمز).
- `.env.local` حاوی `AUTH_SECRET` تصادفی است — آن را حذف نکنید؛ حذفش باعث خروج همه کاربران می‌شود.
- فایل `deploy\github-token.txt` و `.env.local` هرگز به گیت push نمی‌شوند (gitignore شده‌اند).
- برای HTTPS، می‌توانید جلوی پورت 8088 یک reverse proxy با IIS یا Caddy بگذارید؛ برنامه نیازی به تغییر ندارد.
