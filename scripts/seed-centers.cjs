/**
 * seed-centers.cjs — ثبت اولیهٔ اطلاعات پایهٔ مراکز و کلینیک‌ها (بندهای ۱ و ۵)
 *
 * فهرست مراکز از فایل رسمی «اسامی مشاورین شرکت رز» استخراج شده است:
 * کلینیک ستاد (HQ) + کلینیک هر استان با کد رسمی استان و مختصات مرکز شهر.
 *
 * اجرا روی سرور (پس از آپدیت کد):
 *     node scripts/seed-centers.cjs
 * فقط وقتی جدول مراکز خالی باشد ثبت می‌کند (idempotent)؛ همگام‌سازی از
 * سامانهٔ حضور و غیاب (تکنورز) بعداً همهٔ رکوردها را با دادهٔ اصلی بروز می‌کند.
 */
const path = require("path");
const { resolveDatabaseUrl } = require("./lib-env.cjs");

const ROOT = path.resolve(__dirname, "..");
resolveDatabaseUrl(); // DATABASE_URL با حذف کوتیشن‌ها از .env

const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

const SEED = [{"code": "009003-HQ", "name": "کلینیک ستاد (تهران)", "type": "HQ", "province": "تهران", "city": "تهران", "lat": 35.6892, "lng": 51.389, "radiusM": 300}, {"code": "009004", "name": "کلینیک آذربایجان شرقی", "type": "CLINIC", "province": "آذربایجان شرقی", "city": "", "lat": 38.08, "lng": 46.2919, "radiusM": 300}, {"code": "009005", "name": "کلینیک آذربایجان غربی", "type": "CLINIC", "province": "آذربایجان غربی", "city": "", "lat": 37.5527, "lng": 45.0759, "radiusM": 300}, {"code": "009006", "name": "کلینیک اردبیل", "type": "CLINIC", "province": "اردبیل", "city": "", "lat": 38.2498, "lng": 48.2933, "radiusM": 300}, {"code": "009007", "name": "کلینیک اصفهان", "type": "CLINIC", "province": "اصفهان", "city": "", "lat": 32.6546, "lng": 51.668, "radiusM": 300}, {"code": "009008", "name": "کلینیک البرز", "type": "CLINIC", "province": "البرز", "city": "", "lat": 35.996, "lng": 50.841, "radiusM": 300}, {"code": "009009", "name": "کلینیک ایلام", "type": "CLINIC", "province": "ایلام", "city": "", "lat": 33.6374, "lng": 46.4228, "radiusM": 300}, {"code": "009010", "name": "کلینیک بوشهر", "type": "CLINIC", "province": "بوشهر", "city": "", "lat": 28.9234, "lng": 50.8203, "radiusM": 300}, {"code": "009003", "name": "کلینیک تهران", "type": "CLINIC", "province": "تهران", "city": "", "lat": 35.6892, "lng": 51.389, "radiusM": 300}, {"code": "009012", "name": "کلینیک خراسان جنوبی", "type": "CLINIC", "province": "خراسان جنوبی", "city": "", "lat": 32.8628, "lng": 59.2262, "radiusM": 300}, {"code": "009013", "name": "کلینیک خراسان رضوی", "type": "CLINIC", "province": "خراسان رضوی", "city": "", "lat": 36.2972, "lng": 59.6067, "radiusM": 300}, {"code": "009014", "name": "کلینیک خراسان شمالی", "type": "CLINIC", "province": "خراسان شمالی", "city": "", "lat": 37.476, "lng": 57.331, "radiusM": 300}, {"code": "009016", "name": "کلینیک زنجان", "type": "CLINIC", "province": "زنجان", "city": "", "lat": 36.6736, "lng": 48.4787, "radiusM": 300}, {"code": "009017", "name": "کلینیک سمنان", "type": "CLINIC", "province": "سمنان", "city": "", "lat": 35.5729, "lng": 53.397, "radiusM": 300}, {"code": "009018", "name": "کلینیک سیستان و بلوچستان", "type": "CLINIC", "province": "سیستان و بلوچستان", "city": "", "lat": 29.4963, "lng": 60.8629, "radiusM": 300}, {"code": "009019", "name": "کلینیک فارس", "type": "CLINIC", "province": "فارس", "city": "", "lat": 29.5918, "lng": 52.5837, "radiusM": 300}, {"code": "009020", "name": "کلینیک قزوین", "type": "CLINIC", "province": "قزوین", "city": "", "lat": 36.2797, "lng": 50.0049, "radiusM": 300}, {"code": "009028", "name": "کلینیک لرستان", "type": "CLINIC", "province": "لرستان", "city": "", "lat": 33.4878, "lng": 48.3558, "radiusM": 300}, {"code": "009029", "name": "کلینیک مازندران", "type": "CLINIC", "province": "مازندران", "city": "", "lat": 36.5659, "lng": 53.0586, "radiusM": 300}, {"code": "009030", "name": "کلینیک مرکزی", "type": "CLINIC", "province": "مرکزی", "city": "", "lat": 34.838, "lng": 49.003, "radiusM": 300}, {"code": "009032", "name": "کلینیک همدان", "type": "CLINIC", "province": "همدان", "city": "", "lat": 34.7983, "lng": 48.5148, "radiusM": 300}, {"code": "009023", "name": "کلینیک کرمان", "type": "CLINIC", "province": "کرمان", "city": "", "lat": 30.2839, "lng": 57.0834, "radiusM": 300}, {"code": "009024", "name": "کلینیک کرمانشاه", "type": "CLINIC", "province": "کرمانشاه", "city": "", "lat": 34.3277, "lng": 47.0778, "radiusM": 300}, {"code": "009025", "name": "کلینیک کهگیلویه و بویراحمد", "type": "CLINIC", "province": "کهگیلویه و بویراحمد", "city": "", "lat": 30.6756, "lng": 51.6098, "radiusM": 300}, {"code": "009026", "name": "کلینیک گلستان", "type": "CLINIC", "province": "گلستان", "city": "", "lat": 36.8456, "lng": 54.4393, "radiusM": 300}, {"code": "009027", "name": "کلینیک گیلان", "type": "CLINIC", "province": "گیلان", "city": "", "lat": 37.2808, "lng": 49.5832, "radiusM": 300}, {"code": "009033", "name": "کلینیک یزد", "type": "CLINIC", "province": "یزد", "city": "", "lat": 31.8974, "lng": 54.3569, "radiusM": 300}];

(async () => {
  const count = await db.center.count();
  if (count > 0) {
    console.log("مراکز از قبل ثبت شده‌اند (" + count + " رکورد) — کاری انجام نشد.");
    await db.$disconnect();
    return;
  }
  let created = 0;
  let skipped = 0;
  for (const c of SEED) {
    const code = c.code || ("HUB-" + encodeURIComponent(c.name).slice(0, 12));
    try {
      await db.center.upsert({
        where: { code },
        update: {
          name: c.name, type: c.type, province: c.province, city: c.city,
          lat: c.lat, lng: c.lng, radiusM: c.radiusM,
        },
        create: {
          code, name: c.name, type: c.type, province: c.province, city: c.city,
          lat: c.lat, lng: c.lng, radiusM: c.radiusM, source: "MANUAL",
        },
      });
      created++;
    } catch (e) {
      skipped++;
      console.error("خطا در ثبت", c.name, e.message);
    }
  }
  console.log("ثبت اولیه انجام شد: " + created + " مرکز/کلینیک" + (skipped ? " — خطا: " + skipped : ""));
  console.log("برای دادهٔ دقیق، در رز هاب دکمهٔ «همگام‌سازی از حضور و غیاب» را بزنید.");
  await db.$disconnect();
})();
