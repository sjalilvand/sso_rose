/**
 * اتصال سامانه‌ها به نشانی واقعی سرور — یک‌بار پس از استقرار اجرا شود:
 *
 *   cd C:\RoseHub
 *   node scripts/bind-sso-systems.cjs
 *
 * این اسکریپت نشانی سامانه‌های رز هاب را به نمونه‌های در حال اجرا روی سرور
 * تغییر می‌دهد تا دکمه SSO و مسیر /api/sso/launch به درستی کاربر را منتقل کند.
 * Idempotent است — اجرای مکرر مشکلی ندارد.
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const BINDINGS = [
  // سامانه رز سای (Rosepsy) — پورت ۸۰
  { clientId: "rose-psy-5c3f9b", url: "http://130.185.73.157/" },
  // سامانه رز سنتر — پورت ۸۰۸۳
  { clientId: "rose-center-2e8a5c", url: "http://130.185.73.157:8083/" },
  // سامانه حضور و غیاب (تکنورز) — پورت ۸۰۸۵
  { clientId: "rose-techno-8a4e1f", url: "http://130.185.73.157:8085/" },
];

async function main() {
  for (const b of BINDINGS) {
    const s = await prisma.clinicSystem.update({
      where: { clientId: b.clientId },
      data: { url: b.url, connectionLevel: "BASIC", status: "متصل" },
    });
    console.log(`[OK] ${s.name} -> ${s.url} (clientId=${s.clientId})`);
  }
  console.log("اتصال سامانه‌ها کامل شد.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
