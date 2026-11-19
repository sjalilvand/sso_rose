#!/usr/bin/env node
/**
 * import-officials.cjs — ورود گروهی «مدیران کلینیک» و «مسئولین اجرایی» به رز هاب
 *
 * منبع داده: scripts/officials-data.json (استخراج‌شده از فایل اکسل مدیران و مسئولین)
 *
 * قواعد (هماهنگ با ورود گروهی از پنل مدیریت):
 *   - کد ملی  → نام کاربری (username) + ایمیل خودکار <کدملی>@rose.ir
 *   - شماره همراه → رمز عبور اولیه (مانند ورود گروهی مشاورین)
 *   - کاربری که کد ملی او از قبل در سامانه باشد «رد» می‌شود (هیچ اطلاعاتش عوض نمی‌شود)
 *   - مدیران کلینیک  → نقش UNIT_MANAGER، واحد «مدیریت»، عنوان «مدیر کلینیک»
 *   - مسئولین اجرایی → نقش STAFF، واحد «پشتیبانی»، عنوان «مسئول اجرایی»
 *   - پیش‌فرض: دسترسی همهٔ سامانه‌های متصل به هر کاربر جدید داده می‌شود (--no-systems برای لغو)
 *
 * اجرا روی سرور (در پوشهٔ نصب رز هاب):
 *   node scripts\import-officials.cjs            ← فقط پیش‌نمایش (هیچ چیزی ثبت نمی‌کند)
 *   node scripts\import-officials.cjs --apply    ← ثبت نهایی
 */
const fs = require("fs");
const path = require("path");
const { scryptSync, randomBytes } = require("crypto");

// ---------- DATABASE_URL از .env (حذف کوتیشن‌ها — همان الگوی lib-env.cjs) ----------
const { resolveDatabaseUrl } = require("./lib-env.cjs");
resolveDatabaseUrl();

const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const NO_SYSTEMS = process.argv.includes("--no-systems");

// ---------- منطق مشابه src/lib (import route) ----------
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const AVATAR_COLORS = ["#9c27b0", "#0f766e", "#c2185b", "#d97706", "#0369a1", "#7c3aed", "#6366f1", "#dc2626"];
function colorFor(seed) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function isValidNationalId(nid) {
  if (!/^\d{10}$/.test(nid)) return false;
  if (/^(\d)\1{9}$/.test(nid)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(nid[i]) * (10 - i);
  const rem = sum % 11;
  return rem < 2 ? Number(nid[9]) === rem : Number(nid[9]) === 11 - rem;
}

const ROLE_BY_SHEET = {
  "مدیران کلینیک": { role: "UNIT_MANAGER", unit: "مدیریت", jobTitle: "مدیر کلینیک" },
  "مسئولین اجرایی": { role: "STAFF", unit: "پشتیبانی", jobTitle: "مسئول اجرایی" },
};

(async () => {
  const records = JSON.parse(fs.readFileSync(path.join(__dirname, "officials-data.json"), "utf8"));
  const systems = NO_SYSTEMS ? [] : await db.clinicSystem.findMany({ select: { id: true, name: true } });

  console.log("");
  console.log("=================================================================");
  console.log("  ورود گروهی مدیران کلینیک و مسئولین اجرایی — رز هاب");
  console.log(`  حالت: ${APPLY ? "ثبت نهایی (--apply)" : "پیش‌نمایش (برای ثبت: --apply)"}`);
  console.log(`  رکوردهای فایل: ${records.length}`);
  console.log(`  سامانه‌های متصل برای اعطای دسترسی: ${systems.length ? systems.map((s) => s.name).join(" / ") : "هیچ"}`);
  console.log("=================================================================");
  console.log("");

  let created = 0;
  let skipped = 0;
  let failed = 0;
  const seen = new Set();

  for (const r of records) {
    const nid = String(r.nationalId || "").trim();
    const name = String(r.name || "").trim();
    const phone = String(r.phone || "").trim();
    const conf = ROLE_BY_SHEET[r.sheet] || { role: "STAFF", unit: "پشتیبانی", jobTitle: "مسئول اجرایی" };

    if (!isValidNationalId(nid)) {
      console.log(`  [خطا]    ${name} — کد ملی «${nid}» معتبر نیست`);
      failed++;
      continue;
    }
    if (seen.has(nid)) {
      console.log(`  [تکرار]  ${name} — کد ملی ${nid} دوبار در فایل آمده`);
      failed++;
      continue;
    }
    seen.add(nid);

    // کاربر موجود؟ (کد ملی نباید قبلاً در برنامه باشد — طبق درخواست مدیر)
    const existing = await db.user.findFirst({
      where: { OR: [{ username: nid }, { email: `${nid}@rose.ir` }] },
      select: { id: true, username: true, email: true, name: true },
    });
    if (existing) {
      console.log(`  [رد]     ${name} (${nid}) — از قبل در سامانه موجود است: ${existing.name}`);
      skipped++;
      continue;
    }

    if (!APPLY) {
      console.log(`  [ایجاد]  ${name} — ${r.province} | ${conf.jobTitle} | نام‌کاربری ${nid} | رمز اولیه: شماره همراه`);
      created++;
      continue;
    }

    try {
      let email = `${nid}@rose.ir`;
      if (await db.user.findUnique({ where: { email } })) email = `${nid}@users.rose.ir`;
      if (await db.user.findUnique({ where: { email } })) throw new Error("ایمیل خودکار معتبر تولید نشد");

      const user = await db.user.create({
        data: {
          email,
          username: nid,
          passwordHash: hashPassword(phone || nid),
          name,
          role: conf.role,
          unit: conf.unit,
          jobTitle: conf.jobTitle,
          phone,
          province: String(r.province || ""),
          avatarColor: colorFor(nid),
          status: "ACTIVE",
        },
      });

      if (systems.length) {
        await db.systemAccess.createMany({
          data: systems.map((s) => ({ userId: user.id, systemId: s.id })),
        });
      }
      console.log(`  [ثبت‌شد] ${name} (${nid}) — ${conf.jobTitle}، ${r.province}`);
      created++;
    } catch (e) {
      console.log(`  [خطا]    ${name} (${nid}) — ${e && e.message ? e.message : e}`);
      failed++;
    }
  }

  if (APPLY) {
    await db.auditLog.create({
      data: {
        userId: null,
        userName: "اسکریپت ورود گروهی",
        action: "ورود گروهی مدیران کلینیک و مسئولین اجرایی از فایل اکسل",
        entity: "user",
        details: `ایجاد: ${created} — رد (موجود): ${skipped} — خطا: ${failed}`,
      },
    });
  }

  console.log("");
  console.log("=================================================================");
  console.log(`  نتیجه: ایجاد ${created} | رد (از قبل موجود) ${skipped} | خطا ${failed}`);
  if (!APPLY && created > 0) {
    console.log("  این فقط پیش‌نمایش بود — برای ثبت واقعی اجرا کنید:");
    console.log("    node scripts\\import-officials.cjs --apply");
  }
  if (created > 0 && !NO_SYSTEMS) {
    console.log("  دسترسی همهٔ سامانه‌های متصل به کاربران جدید داده شد (لغو: --no-systems).");
  }
  console.log("  رمز عبور اولیهٔ هر کاربر = شماره همراه او (مثل ورود گروهی مشاورین).");
  console.log("=================================================================");
  await db.$disconnect();
})().catch((e) => {
  console.error("ERROR:", e && e.message ? e.message : e);
  process.exit(1);
});
