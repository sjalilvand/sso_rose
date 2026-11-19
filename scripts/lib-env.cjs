/**
 * lib-env.cjs — خواندن امن DATABASE_URL برای اسکریپت‌های Node
 *
 * مشکل: مقدار DATABASE_URL در .env داخل کوتیشن است
 *   DATABASE_URL="file:../db/custom.db"
 * اگر کوتیشن‌ها حذف نشوند، Prisma خطای
 *   «the URL must start with the protocol file:»
 * می‌دهد (این خطا در update-rosehub.ps1 واجرای دستی دیده شد).
 *
 * استفاده در ابتدای هر اسکریپت:
 *   const { resolveDatabaseUrl } = require("./lib-env.cjs");
 *   resolveDatabaseUrl();               // process.env.DATABASE_URL ست می‌شود
 *   const { PrismaClient } = require("@prisma/client");
 *   const db = new PrismaClient();
 */
const fs = require("fs");
const path = require("path");

/** حذف کوتیشن‌های ابتدا/انتها و فاصله‌های اضافی */
function stripQuotes(v) {
  let s = String(v || "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s.trim();
}

/** خواندن فایل .env — مقادیر موجود در process.env بازنویسی نمی‌شوند */
function loadEnvFile(envPath, overwrite = false) {
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    const val = stripQuotes(m[2]);
    out[key] = val;
    if (overwrite || process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = val;
    }
  }
  return out;
}

/**
 * تعیین DATABASE_URL معتبر برای Prisma:
 *   ۱) مقدار فعلی env اگر file: باشد
 *   ۲) مقدار .env کنار پروژه (ROOT/.env)
 *   ۳) مسیر پیش‌فرض ROOT/db/custom.db
 *
 * مسیر نسبی (مثل file:../db/custom.db که در .env سرور نوشته می‌شود) به مسیر
 * مطلق نسبت به پوشهٔ prisma/ تبدیل می‌شود — دقیقاً همان معنایی CLI پرisma
 * («prisma db push») تا اسکریپت مستقل هم به همان دیتابیس وصل شود.
 */
function resolveDatabaseUrl() {
  let url = stripQuotes(process.env.DATABASE_URL || "");
  if (!/^file:/i.test(url)) {
    loadEnvFile(path.join(__dirname, "..", ".env"));
    url = stripQuotes(process.env.DATABASE_URL || "");
  }
  if (!/^file:/i.test(url)) {
    url = "file:" + path.join(__dirname, "..", "db", "custom.db").split(path.sep).join("/");
  }
  // مسیر نسبی → مطلق (نسبت به prisma/ مانند CLI پرisma)
  const m = url.match(/^file:(?!\/\/)(.+)$/i);
  if (m && !path.isAbsolute(m[1]) && !/^\/|[A-Za-z]:/.test(m[1])) {
    const abs = path.resolve(__dirname, "..", "prisma", m[1]).split(path.sep).join("/");
    url = "file:" + abs;
  }
  process.env.DATABASE_URL = url;
  return url;
}

module.exports = { resolveDatabaseUrl, loadEnvFile, stripQuotes };
