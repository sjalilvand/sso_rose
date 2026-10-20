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
