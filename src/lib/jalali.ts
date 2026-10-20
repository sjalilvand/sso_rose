// کتابخانه تقویم شمسی (جلالی) — پیاده‌سازی الگوریتم استاندارد jalaali
// تبدیل دقیق میلادی/شمسی با پشتیبانی از سال کبیسه

function div(a: number, b: number): number {
  return ~~(a / b);
}
function mod(a: number, b: number): number {
  return a - ~~(a / b) * b;
}

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192,
  2262, 2324, 2394, 2456, 3178,
];

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  let leapJ = -14;
  let jp = BREAKS[0];
  const gy = jy + 621;
  let jump = 0;
  for (let i = 1; i < BREAKS.length; i += 1) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number): { jy: number; jm: number; jd: number } {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) {
      return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export function toJalali(gy: number, gm: number, gd: number) {
  return d2j(g2d(gy, gm, gd));
}

export function toGregorian(jy: number, jm: number, jd: number) {
  return d2g(j2d(jy, jm, jd));
}

export function isJalaliLeap(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeap(jy) ? 30 : 29;
}

export const JALALI_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

// شنبه = روز اول هفته
export const WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
export const WEEKDAYS_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

/** استخراج اجزای تاریخ میلادی به وقت تهران (مقاوم در برابر ترتیب MM/DD) */
function gregorianInTehran(date: Date): { gy: number; gm: number; gd: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { gy: get("year"), gm: get("month"), gd: get("day") };
}

/** تاریخ امروز به وقت تهران */
export function todayJalali(): JalaliDate {
  const { gy, gm, gd } = gregorianInTehran(new Date());
  return toJalali(gy, gm, gd);
}

/** تبدیل Date به Jalali به وقت تهران */
export function dateToJalali(date: Date): JalaliDate {
  const { gy, gm, gd } = gregorianInTehran(date);
  return toJalali(gy, gm, gd);
}

/** ساخت Date از تاریخ شمسی (به وقت تهران، نیمروز برای پرهیز از انتقال روز) */
export function jalaliToDate({ jy, jm, jd }: JalaliDate): Date {
  const g = toGregorian(jy, jm, jd);
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd, 8, 30, 0)); // 08:30 UTC = 12:00 تهران
}

/** کلید متنی یکتا برای یک روز: jy-jm-jd */
export function jalaliKey(d: JalaliDate): string {
  return `${d.jy}-${String(d.jm).padStart(2, "0")}-${String(d.jd).padStart(2, "0")}`;
}

/** تاریخ شمسی از کلید متنی */
export function jalaliFromKey(key: string): JalaliDate {
  const [jy, jm, jd] = key.split("-").map(Number);
  return { jy, jm, jd };
}

/** شماره روز هفته (۰=شنبه ... ۶=جمعه) */
export function jalaliWeekday(d: JalaliDate): number {
  const g = toGregorian(d.jy, d.jm, d.jd);
  const jsDay = new Date(Date.UTC(g.gy, g.gm - 1, g.gd)).getUTCDay(); // 0=Sunday
  // شنبه=6 در جاوااسکریپت → ۰
  return (jsDay + 1) % 7;
}

export interface MonthGrid {
  /** هر خانه: null = خالی قبل/بعد ماه */
  days: (JalaliDate | null)[];
}

/** شبکه ۶×۷ روزهای ماه (شنبه تا جمعه) */
export function jalaliMonthGrid(jy: number, jm: number): MonthGrid {
  const len = jalaliMonthLength(jy, jm);
  const first: JalaliDate = { jy, jm, jd: 1 };
  const wd = jalaliWeekday(first);
  const days: (JalaliDate | null)[] = [];
  for (let i = 0; i < wd; i++) days.push(null);
  for (let d = 1; d <= len; d++) days.push({ jy, jm, jd: d });
  while (days.length % 7 !== 0) days.push(null);
  while (days.length < 42) days.push(null);
  return { days };
}

function faNum(n: number | string): string {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** فرمت تاریخ شمسی: «۲۵ مهر ۱۴۰۴» */
export function formatJalali(d: JalaliDate, opts?: { withMonth?: boolean; withYear?: boolean; withWeekday?: boolean }): string {
  const { jy, jm, jd } = d;
  let out = `${faNum(jd)}`;
  if (opts?.withMonth !== false) out += ` ${JALALI_MONTHS[jm - 1]}`;
  if (opts?.withYear !== false) out += ` ${faNum(jy)}`;
  if (opts?.withWeekday) out = `${WEEKDAYS[jalaliWeekday(d)]}، ` + out;
  return out;
}

/** فرمت تاریخ میلادی (DateTime) به شمسی با زمان */
export function formatDateTime(date: Date | string): string {
  const dt = typeof date === "string" ? new Date(date) : date;
  const j = dateToJalali(dt);
  const time = new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
  return `${formatJalali(j)} — ${time}`;
}

export function formatTime(date: Date | string): string {
  const dt = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

export function formatTimeJalali(date: Date | string): string {
  const dt = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

export function formatFullJalali(date: Date | string): string {
  const dt = typeof date === "string" ? new Date(date) : date;
  const j = dateToJalali(dt);
  return formatJalali(j, { withWeekday: true });
}

export function formatShortJalali(date: Date | string): string {
  const dt = typeof date === "string" ? new Date(date) : date;
  return formatJalali(dateToJalali(dt));
}

/** فقط زمان */
export { faNum };

// تعطیلات رسمی ثابت (نمونه — در نسخه تولیدی باید از منبع معتبر دریافت شود)
const OFFICIAL_HOLIDAYS = new Set([
  "1-1", "1-2", "1-3", "1-4", "1-12", "1-13", // نوروز و روز جمهوری
  "3-14", "3-15", // رحلت امام خمینی و قیام ۱۵ خرداد
  "11-22", // پیروزی انقلاب
  "12-29", // ملی شدن نفت
]);

/** بررسی تعطیل بودن رسمی روز (تعطیلات ثابت + جمعه) */
export function isOfficialHoliday(d: JalaliDate): boolean {
  if (jalaliWeekday(d) === 6) return true; // جمعه
  return OFFICIAL_HOLIDAYS.has(`${d.jm}-${d.jd}`);
}
