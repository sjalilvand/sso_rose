/**
 * seed-org-structure.cjs — ثبت اولیهٔ «مدیریت‌های سازمانی» و اتصال کارکنان (فاز ۷۲ — بند ۴)
 *
 * بر اساس کاربران واردشده از فایل مدیران کلینیک و مسئولین اجرایی:
 *   - «مدیریت کلینیک‌ها»         ← همهٔ کاربران با عنوان «مدیر کلینیک»
 *   - «مدیریت پشتیبانی و اجرایی»  ← همهٔ کاربران با عنوان «مسئول اجرایی»
 *
 * به‌علاوه هر کاربرِ دارای استان به کلینیک همان استان (اطلاعات پایهٔ مراکز)
 * متصل می‌شود و برای کلینیک هر استان که «مدیر کلینیک» دارد، مدیرِ مرکز ثبت می‌شود.
 *
 * Idempotent — قابل اجرای چندباره:
 *   - مدیریت‌های تکراری ساخته نمی‌شوند (بازنویسی نام/توضیحاتِ موجود هم انجام نمی‌شود)
 *   - تخصیص‌های دستی قبلی (managementId / clinicId / managerId) بازنویسی نمی‌شوند
 *
 * اجرا روی سرور (در پوشهٔ نصب رز هاب):
 *   node scripts\seed-org-structure.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let dbUrl = process.env.DATABASE_URL || "";
const envFile = path.join(ROOT, ".env");
if (!dbUrl && fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/);
    if (m) dbUrl = m[1].trim();
  }
}
if (!dbUrl) dbUrl = "file:" + path.join(ROOT, "db", "custom.db");
process.env.DATABASE_URL = dbUrl;

const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

// «مدیریت»های پایهٔ سازمانی — نام‌ها ثابت‌اند تا اجرای دوباره همان رکورد را پیدا کند
const SEED_MANAGEMENTS = [
  {
    key: "clinics",
    name: "مدیریت کلینیک‌ها",
    description: "دبیرخانهٔ مدیران کلینیک استان‌ها — مدیر هر کلینیک استان عضو این مدیریت است.",
    jobTitle: "مدیر کلینیک",
  },
  {
    key: "support",
    name: "مدیریت پشتیبانی و اجرایی",
    description: "مسئولین اجرایی استان‌ها — پشتیبانی و هماهنگی اجرایی کلینیک‌ها.",
    jobTitle: "مسئول اجرایی",
  },
];

// نرمال‌سازی متن برای تطبیق استان‌ها (فاصله/نیم‌فاصله)
function norm(s) {
  return String(s || "")
    .replace(/\u200c/g, " ") // نیم‌فاصله → فاصله
    .replace(/\s+/g, "")
    .trim();
}

(async () => {
  const centers = await db.center.findMany({ select: { id: true, name: true, province: true, type: true, managerId: true } });
  const centersByProvince = new Map();
  for (const c of centers) {
    const p = norm(c.province);
    if (!p) continue;
    // اولویت: CLINIC بعد HQ بعد هر چیز دیگر
    if (!centersByProvince.has(p) || (centersByProvince.get(p).type !== "CLINIC" && c.type === "CLINIC")) {
      centersByProvince.set(p, c);
    }
  }

  console.log("");
  console.log("=================================================================");
  console.log("  ثبت اولیهٔ مدیریت‌های سازمانی — رز هاب (فاز ۷۲ بند ۴)");
  console.log(`  مراکز بارگذاری‌شده: ${centers.length} — با استان: ${centersByProvince.size}`);
  console.log("=================================================================");

  let mgCreated = 0;
  let mgExisted = 0;
  let membersAttached = 0;
  let alreadyMembers = 0;
  let clinicLinked = 0;
  let managersSet = 0;

  for (const def of SEED_MANAGEMENTS) {
    let mg = await db.management.findUnique({ where: { name: def.name } });
    if (!mg) {
      mg = await db.management.create({
        data: { name: def.name, description: def.description },
      });
      mgCreated++;
      console.log(`  [ایجاد]  مدیریت «${def.name}»`);
    } else {
      mgExisted++;
      console.log(`  [موجود]  مدیریت «${def.name}»`);
    }

    // اعضا: کاربران با عنوان شغلی مربوطه
    const users = await db.user.findMany({
      where: { jobTitle: { contains: def.jobTitle }, status: { not: "INACTIVE" } },
      select: { id: true, name: true, province: true, managementId: true, clinicId: true, role: true },
    });

    for (const u of users) {
      if (!u.managementId) {
        await db.user.update({ where: { id: u.id }, data: { managementId: mg.id } });
        membersAttached++;
        console.log(`    [عضو]  ${u.name} — ${u.province || "—"} ← ${def.name}`);
      } else {
        alreadyMembers++;
      }

      // اتصال کلینیک استان (فقط اگر خالی باشد)
      const p = norm(u.province);
      const center = p ? centersByProvince.get(p) : null;
      if (!u.clinicId && center) {
        await db.user.update({ where: { id: u.id }, data: { clinicId: center.id } });
        clinicLinked++;
        console.log(`    [کلینیک] ${u.name} → ${center.name}`);
      }

      // مدیر کلینیک استان = مدیرِ مرکز همان استان (فقط برای مدیر کلینیک و اگر مرکز مدیر ندارد)
      if (def.key === "clinics" && center && !center.managerId) {
        await db.center.update({ where: { id: center.id }, data: { managerId: u.id } });
        center.managerId = u.id; // جلوگیری از تخصیص دوباره در همین اجرا
        managersSet++;
        console.log(`    [مدیر مرکز] ${center.name} → ${u.name}`);
      }
    }
    console.log(`    عنوان «${def.jobTitle}»: ${users.length} کاربر`);
  }

  if (mgCreated > 0 || membersAttached > 0 || clinicLinked > 0 || managersSet > 0) {
    await db.auditLog.create({
      data: {
        userId: null,
        userName: "اسکریپت اطلاعات پایه",
        action: "ثبت اولیهٔ مدیریت‌های سازمانی و اتصال کارکنان",
        entity: "Management",
        details: `مدیریت جدید: ${mgCreated} — عضو جدید: ${membersAttached} — اتصال کلینیک: ${clinicLinked} — مدیر مرکز: ${managersSet}`,
      },
    });
  }

  console.log("");
  console.log("=================================================================");
  console.log(`  نتیجه: مدیریتِ جدید ${mgCreated} | از قبل موجود ${mgExisted}`);
  console.log(`  عضو تخصیص‌شده: ${membersAttached} | عضوِ از قبل تخصیص‌یافته: ${alreadyMembers}`);
  console.log(`  اتصال کاربر به کلینیک استان: ${clinicLinked} | مدیر ثبت‌شدهٔ مرکز: ${managersSet}`);
  console.log("  تخصیص‌های دستی قبلی بازنویسی نشد — در صفحهٔ «مدیریت‌های سازمانی» قابل ویرایش است.");
  console.log("=================================================================");
  await db.$disconnect();
})().catch((e) => {
  console.error("ERROR:", e && e.message ? e.message : e);
  process.exit(1);
});
