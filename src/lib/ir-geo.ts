/**
 * ir-geo.ts — دادهٔ جغرافیایی ایران برای جستجوی شهر/استان و پرش مستقیم روی نقشه
 *
 * فهرست ۳۱ استان با مرکز استان (مختصات) برای:
 *   - کمبوباکس استاندارد استان در فرم‌ها (غلط‌نگاری یکدست نام استان‌ها)
 *   - پرش مستقیم نقشه به شهر انتخاب‌شده (بدون نیاز به اینترنت)
 * جستجوی آزاد (آدرس، کمیته امداد، …) در صفحهٔ مراکز با سرویس geocoding انجام می‌شود.
 */

export interface IrCity {
  province: string;
  city: string;
  lat: number;
  lng: number;
}

// مرکز هر ۳۱ استان — مختصات شهرداری/مرکز شهر
export const IR_PROVINCE_CAPITALS: IrCity[] = [
  { province: "تهران", city: "تهران", lat: 35.6892, lng: 51.389 },
  { province: "آذربایجان شرقی", city: "تبریز", lat: 38.08, lng: 46.2919 },
  { province: "آذربایجان غربی", city: "ارومیه", lat: 37.5527, lng: 45.0759 },
  { province: "اردبیل", city: "اردبیل", lat: 38.2498, lng: 48.2933 },
  { province: "اصفهان", city: "اصفهان", lat: 32.6546, lng: 51.668 },
  { province: "البرز", city: "کرج", lat: 35.996, lng: 50.841 },
  { province: "ایلام", city: "ایلام", lat: 33.6374, lng: 46.4228 },
  { province: "بوشهر", city: "بوشهر", lat: 28.9234, lng: 50.8203 },
  { province: "چهارمحال و بختیاری", city: "شهرکرد", lat: 32.3256, lng: 50.8644 },
  { province: "خراسان جنوبی", city: "بیرجند", lat: 32.8628, lng: 59.2262 },
  { province: "خراسان رضوی", city: "مشهد", lat: 36.2605, lng: 59.6168 },
  { province: "خراسان شمالی", city: "بجنورد", lat: 37.476, lng: 57.331 },
  { province: "خوزستان", city: "اهواز", lat: 31.3183, lng: 48.6706 },
  { province: "زنجان", city: "زنجان", lat: 36.6736, lng: 48.4787 },
  { province: "سمنان", city: "سمنان", lat: 35.5729, lng: 53.397 },
  { province: "سیستان و بلوچستان", city: "زاهدان", lat: 29.4963, lng: 60.8629 },
  { province: "فارس", city: "شیراز", lat: 29.5918, lng: 52.5837 },
  { province: "قزوین", city: "قزوین", lat: 36.2797, lng: 50.0049 },
  { province: "قم", city: "قم", lat: 34.6416, lng: 50.8746 },
  { province: "کردستان", city: "سنندج", lat: 35.3126, lng: 46.9964 },
  { province: "کرمان", city: "کرمان", lat: 30.2839, lng: 57.0834 },
  { province: "کرمانشاه", city: "کرمانشاه", lat: 34.3277, lng: 47.0778 },
  { province: "کهگیلویه و بویراحمد", city: "یاسوج", lat: 30.6756, lng: 51.6098 },
  { province: "گلستان", city: "گرگان", lat: 36.8456, lng: 54.4393 },
  { province: "گیلان", city: "رشت", lat: 37.2808, lng: 49.5832 },
  { province: "لرستان", city: "خرم‌آباد", lat: 33.4878, lng: 48.3558 },
  { province: "مازندران", city: "ساری", lat: 36.5659, lng: 53.0586 },
  { province: "مرکزی", city: "اراک", lat: 34.838, lng: 49.003 },
  { province: "هرمزگان", city: "بندرعباس", lat: 27.1865, lng: 56.2808 },
  { province: "همدان", city: "همدان", lat: 34.7983, lng: 48.5148 },
  { province: "یزد", city: "یزد", lat: 31.8974, lng: 54.3569 },
];

// شهرهای پرجمعیت غیر مرکز استان برای جستجوی محلی سریع‌تر
export const IR_MAJOR_CITIES: IrCity[] = [
  { province: "تهران", city: "اسلامشهر", lat: 35.5533, lng: 51.2353 },
  { province: "تهران", city: "شهریار", lat: 35.6606, lng: 51.0581 },
  { province: "تهران", city: "قدس", lat: 35.6972, lng: 51.0897 },
  { province: "تهران", city: "ملارد", lat: 35.6697, lng: 51.0267 },
  { province: "تهران", city: "پاکدشت", lat: 35.4697, lng: 51.6817 },
  { province: "تهران", city: "ورامین", lat: 35.3244, lng: 51.6469 },
  { province: "خوزستان", city: "آبادان", lat: 30.3395, lng: 48.3043 },
  { province: "خوزستان", city: "خرمشهر", lat: 30.4263, lng: 48.1781 },
  { province: "فارس", city: "مرودشت", lat: 29.8742, lng: 52.8025 },
  { province: "اصفهان", city: "کاشان", lat: 33.9831, lng: 51.4364 },
  { province: "اصفهان", city: "نجف‌آباد", lat: 32.6342, lng: 51.3661 },
  { province: "خراسان رضوی", city: "نیشابور", lat: 36.2133, lng: 58.7958 },
  { province: "مازندران", city: "بابل", lat: 36.5513, lng: 52.5601 },
  { province: "مازندران", city: "آمل", lat: 36.4696, lng: 52.3507 },
  { province: "گیلان", city: "انزلی", lat: 37.4708, lng: 49.4619 },
  { province: "آذربایجان شرقی", city: "مراغه", lat: 37.3892, lng: 46.2386 },
  { province: "کرمان", city: "رفسنجان", lat: 30.4067, lng: 56.8375 },
  { province: "هرمزگان", city: "میناب", lat: 27.0869, lng: 57.0847 },
];

export const IR_CITIES: IrCity[] = [...IR_PROVINCE_CAPITALS, ...IR_MAJOR_CITIES];

export const IR_PROVINCES: string[] = [
  ...new Set(IR_PROVINCE_CAPITALS.map((c) => c.province)),
].sort((a, b) => a.localeCompare(b, "fa"));

/**
 * نرمال‌سازی متن فارسی برای جستجو — ي/ی و ك/ک، نیم‌فاصله، فاصلهٔ اضافه
 */
export function normalizeFa(s: string): string {
  return String(s || "")
    .replace(/[\u064A\u0649]/g, "\u06CC") // ي/ى → ی
    .replace(/\u0643/g, "\u06A9") // ك → ک
    .replace(/\u200c/g, " ") // نیم‌فاصله → فاصله
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** یافتن شهر بر اساس متن آزاد (نام شهر یا استان) — برای پرش نقشه */
export function findCity(query: string): IrCity | null {
  const q = normalizeFa(query);
  if (!q) return null;
  return (
    IR_CITIES.find((c) => normalizeFa(c.city) === q) ||
    IR_CITIES.find((c) => normalizeFa(c.province) === q) ||
    IR_CITIES.find((c) => normalizeFa(c.city).includes(q) || q.includes(normalizeFa(c.city))) ||
    IR_CITIES.find((c) => q.includes(normalizeFa(c.province)))
  ) || null;
}
