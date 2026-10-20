---
Task ID: 1
Agent: main (Z.ai)
Task: پیاده‌سازی کامل سند «رز هاب | Rose Hub» — سامانه ورود یکپارچه و پنل مدیریت کلینیک رز سفید (Next.js 16)

Work Log:
- راه‌اندازی محیط fullstack-dev و نصب jose
- طراحی کامل Prisma schema (User, Session, ClinicSystem, SystemAccess, Announcement, Task, CalendarEvent, Note, Conversation, Message, Notification, AuditLog)
- داده‌ریزی اولیه (scripts/seed.ts): ۷ کاربر با ۶ نقش، ۵ سامانه مجموعه، اطلاعیه/وظیفه/رویداد/یادداشت/گفتگوی نمونه
- کتابخانه‌ها: auth-edge.ts (JWT برای middleware)، auth.ts (scrypt + session + audit + SSO token)، permissions.ts (۶ نقش)، jalali.ts (تقویم شمسی با الگوریتم استاندارد)، client.ts
- middleware.ts برای حفاظت همه مسیرها به‌جز /login
- ۱۷ مسیر API: auth (login/logout/me/otp/sessions/change-password)، users، systems (+sso)، announcements (+ack)، tasks (+comments)، events، notes، conversations (+messages)، notifications، reports، audit، search
- UI: login (SSO gateway)، panel-shell (sidebar RTL + header: جستجوی سراسری Ctrl+K، اعلان‌ها، حالت تاریک، پروفایل)، داشبورد با ابزارک‌ها، سامانه‌ها+SSO dialog، اطلاعیه‌ها، وظایف (فهرست+کانبان)، تقویم شمسی، یادداشت‌ها، گفتگوها، گزارش‌ها، admin/users، admin/systems، admin/audit، profile
- رفع اشکال: جداسازی Edge-safe JWT از crypto، import faNum در admin/users، اصلاح ترتیب تاریخ Intl (MM/DD vs YYYY/MM/DD) با formatToParts
- تست با agent-browser: login، داشبورد، کانبان، تقویم شمسی (مهر ۱۴۰۵)، SSO dialog با توکن، گفتگوها، اطلاعیه‌ها، admin users، حالت تاریک، موبایل
- README.md کامل فارسی نوشته شد

Stage Summary:
- پروژه runnable روی پورت 3000؛ همه صفحات 200؛ lint پاک؛ تعاملات اصلی با مرورگر تأیید شد
- حساب‌های نمایشی: admin@rose.ir / rose1234 (و ۵ حساب دیگر)
- آماده push به github.com/sjalilvand/sso_rose

---
Task ID: 2
Agent: main (Z.ai)
Task: تحویل برنامه به کاربر روی ویندوز (D:\Projects\sso_rose) + push نهایی به GitHub + اسکریپت PowerShell نصب و اجرا

Work Log:
- بررسی وضعیت: پروژه قبلاً کامیت و push شده بود (0b4a66c روی origin/main)؛ توکن کار می‌کند و ریپو public است (کلون بدون توکن)
- رفع دو مشکل سازگاری با ویندوز:
  * .env: DATABASE_URL از مسیر مطلق لینوکسی به «file:../db/custom.db» نسبی تغییر کرد (prisma validate ✓)
  * package.json: حذف tee و cp لینوکسی از اسکریپت‌ها؛ dev/build/start کراس‌پلتفرم؛ اضافه شدن setup؛ نام rose-hub v1.0.0
- باندل فونت وزیرمتن متغیر (241KB) از npm vazirmatn@33.0.3 به src/fonts و مهاجرت layout.tsx از next/font/google به next/font/local برای اجرای کاملاً آفلاین (بدون وابستگی به Google Fonts)
- lint پاک، curl /login = 200، تأیید مرورگری: صفحه ورود + ورود admin@rose.ir + داشبورد کامل (تاریخ شمسی ۲۸ مهر ۱۴۰۵، ۵ کارت سامانه، وظایف با مهلت و وضعیت، اعلان تأیید مطالعه)؛ اسکرین‌شات: scripts/shot-localfont.png و scripts/shot-final.png
- کامیت و push: 6172630 (سازگاری ویندوز) + 7519440 (فونت محلی) → اکنون origin/main = 7519440 با ۴ کامیت
- ساخت download/setup-rose-hub.ps1 (UTF-8 با BOM برای نمایش درست فارسی در PowerShell 5.1 و 7): بررسی پیش‌نیاز، ساخت D:\Projects، کلون ریپو، نمایش git log، npm install، prisma generate، npm run dev

Stage Summary:
- github.com/sjalilvand/sso_rose به‌روز است (public؛ کلون بدون توکن ممکن است)
- اجرای محلی ویندوز: کلون → npm install → npx prisma generate → npm run dev → http://localhost:3000 (admin@rose.ir / rose1234)
- دیتابیس seed شده (db/custom.db) داخل ریپو است؛ نیازی به db push/seed نیست
- تحویل‌شده: download/setup-rose-hub.ps1 برای نصب خودکار روی ویندوز
