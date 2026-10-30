/**
 * اتصال و نام‌گذاری سامانه‌ها در رز هاب — یک‌بار پس از استقرار اجرا شود:
 *
 *   cd C:\RoseHub
 *   node scripts/bind-sso-systems.cjs
 *
 * این اسکریپت نشانی و نام رسمی سامانه‌های رز هاب را با نمونه‌های در حال اجرا
 * روی سرور همگام می‌کند تا دکمه SSO و مسیر /api/sso/launch درست کار کند.
 * Idempotent است — اجرای مکرر مشکلی ندارد.
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const BINDINGS = [
  // سامانه رز سای (Rosepsy) — پورت ۸۰
  {
    clientId: "rose-psy-5c3f9b",
    url: "http://130.185.73.157/",
  },
  // سامانه رز سنتر — پورت ۸۰۸۳
  {
    clientId: "rose-center-2e8a5c",
    url: "http://130.185.73.157:8083/",
  },
  // سامانه حضور و غیاب — پورت ۸۰۸۵ (قبلاً اشتباهاً «تکنورز» ثبت شده بود)
  {
    clientId: "rose-techno-8a4e1f",
    url: "http://130.185.73.157:8085/",
    name: "حضور و غیاب",
    description: "سامانه ثبت و مدیریت حضور، غیاب و کارکرد پرسنل",
    icon: "CalendarCheck",
  },
];

async function main() {
  for (const b of BINDINGS) {
    const data = { url: b.url, connectionLevel: "BASIC", status: "متصل" };
    if (b.name) data.name = b.name;
    if (b.description) data.description = b.description;
    if (b.icon) data.icon = b.icon;
    const s = await prisma.clinicSystem.update({
      where: { clientId: b.clientId },
      data,
    });
    console.log(`[OK] ${s.name} -> ${s.url} (clientId=${s.clientId})`);
  }
  console.log("اتصال و نام‌گذاری سامانه‌ها کامل شد.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
