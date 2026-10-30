/**
 * ورود گروهی کاربران (مشاورین) از فایل اکسل
 * ستون‌های فایل مطابق قالب رسمی شرکت رز:
 *   استان | نام و نام خانوادگی | مدرک تحصیلی | پروانه اشتغال | رتبه حرفه ای |
 *   شماره قرارداد | کد استانها | کد تفضیلی شخص | شماره شباء بانکی | کد ملی | شماره تماس
 *
 * قواعد تعیین‌شده توسط مدیر:
 *   - کد ملی → نام کاربری (username)
 *   - شماره تماس (موبایل) → رمز عبور اولیه
 */
import * as XLSX from "xlsx";

export const IMPORT_HEADERS = [
  "استان",
  "نام و نام خانوادگی",
  "مدرک تحصیلی",
  "پروانه اشتغال",
  "رتبه حرفه ای",
  "شماره قرارداد",
  "کد استانها",
  "کد تفضیلی شخص",
  "شماره شباء بانکی",
  "کد ملی",
  "شماره تماس",
] as const;

export interface ParsedRow {
  row: number; // شماره ردیف در فایل اکسل (با احتساب هدر)
  province: string;
  name: string;
  education: string;
  workLicense: string;
  profRank: string;
  contractNo: string;
  provinceCode: string;
  personalCode: string;
  bankSheba: string;
  nationalId: string; // کد ملی نرمال‌شده (۱۰ رقم)
  phone: string; // شماره تماس نرمال‌شده
  nidValid: boolean; // اعتبار رقم کنترلی کد ملی
  action: "create" | "update";
  error?: string;
}

export interface ParseResult {
  headers: string[];
  rows: ParsedRow[];
  summary: { total: number; create: number; update: number; error: number };
}

// ---------- نرمال‌سازی ----------

/** تبدیل ارقام فارسی/عربی به لاتین */
export function toLatinDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const fa = "۰۱۲۳۴۵۶۷۸۹".indexOf(ch);
    if (fa >= 0) {
      out += String(fa);
      continue;
    }
    const ar = "٠١٢٣٤٥٦٧٨٩".indexOf(ch);
    out += ar >= 0 ? String(ar) : ch;
  }
  return out;
}

/** استخراج فقط رقم‌ها (برای کد ملی، موبایل، شبا و ...) */
function digits(v: unknown): string {
  return toLatinDigits(cellText(v)).replace(/[^0-9]/g, "");
}

/** متن یک سلول اکسل بدون از دست رفتن ارقام (جلوگیری از نماد علمی برای اعداد بزرگ) */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    return Number.isInteger(v)
      ? v.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 })
      : String(v);
  }
  return String(v);
}

/** متن فارسی نرمال (ی/ک عربی، نیم‌فاصله و فاصله‌های تکراری) */
function faText(v: unknown): string {
  return cellText(v)
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** اعتبارسنجی رقم کنترلی کد ملی ۱۰ رقمی ایران */
export function isValidNationalId(nid: string): boolean {
  if (!/^\d{10}$/.test(nid)) return false;
  if (/^(\d)\1{9}$/.test(nid)) return false;
  const check = Number(nid[9]);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(nid[i]) * (10 - i);
  const rem = sum % 11;
  return rem < 2 ? check === rem : check === 11 - rem;
}

/** کد ملی نرمال: فقط رقم، با بازسازی صفرهای ابتدایی از دست رفتهٔ اکسل */
function normalizeNationalId(v: unknown): string {
  const d = digits(v);
  if (d.length >= 8 && d.length < 10) return d.padStart(10, "0");
  return d;
}

// ---------- تطبیق ستون‌ها ----------

function normHeader(h: string): string {
  return faText(h).replace(/\u200c/g, " ").toLowerCase();
}

/** نگاشت سرستون‌های فایل به فیلدهای سیستم — با پذیرش تفاوت‌های رایج نگارشی */
const HEADER_MATCHERS: Array<{ field: keyof ParsedRow; keys: string[] }> = [
  { field: "province", keys: ["استان"] },
  { field: "name", keys: ["نام و نام خانوادگی", "نام نام خانوادگی", "نام"] },
  { field: "education", keys: ["مدرک تحصیلی", "مدرک"] },
  { field: "workLicense", keys: ["پروانه اشتغال", "پروانه"] },
  { field: "profRank", keys: ["رتبه حرفه ای", "رتبه"] },
  { field: "contractNo", keys: ["شماره قرارداد", "قرارداد"] },
  { field: "provinceCode", keys: ["کد استانها", "کد استان", "کد استان ها"] },
  { field: "personalCode", keys: ["کد تفضیلی شخص", "کد تفضیلی"] },
  { field: "bankSheba", keys: ["شماره شباء بانکی", "شماره شباء", "شماره شبا بانکی", "شماره شبا"] },
  { field: "nationalId", keys: ["کد ملی"] },
  { field: "phone", keys: ["شماره تماس", "شماره موبایل", "موبایل", "شماره همراه", "تلفن همراه", "تلفن"] },
];

function matchHeader(h: string): keyof ParsedRow | null {
  const n = normHeader(h);
  for (const m of HEADER_MATCHERS) {
    if (m.keys.includes(n)) return m.field;
  }
  return null;
}

function pickSheet(wb: XLSX.WorkBook): XLSX.WorkSheet {
  let best: XLSX.WorkSheet | null = null;
  let bestScore = 0;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
    if (!grid.length) continue;
    const score = (grid[0] as unknown[])
      .map((c) => (c === null ? "" : matchHeader(String(c)) ? 1 : 0))
      .reduce<number>((a, b) => a + b, 0);
    if (score > bestScore) {
      best = ws;
      bestScore = score;
    }
  }
  return best || wb.Sheets[wb.SheetNames[0]];
}

// ---------- تجزیه فایل ----------

/** تجزیه فایل اکسل به ردیف‌های نرمال‌شده + اعتبارسنجی هر ردیف */
export function parseConsultantsWorkbook(buf: Buffer): ParseResult {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = pickSheet(wb);
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  if (grid.length < 2) {
    return { headers: [], rows: [], summary: { total: 0, create: 0, update: 0, error: 0 } };
  }

  // نگاشت شماره ستون → فیلد بر اساس سرستون
  const colMap = new Map<keyof ParsedRow, number>();
  const headers: string[] = [];
  (grid[0] as unknown[]).forEach((c, idx) => {
    const h = c === null ? "" : String(c);
    headers.push(h);
    const field = matchHeader(h);
    if (field && !colMap.has(field)) colMap.set(field, idx);
  });

  const seenNids = new Map<string, number>();
  const rows: ParsedRow[] = [];

  for (let r = 1; r < grid.length; r++) {
    const raw = grid[r] as unknown[];
    if (!raw || !raw.some((c) => c !== null && String(c).trim() !== "")) continue;

    const get = (f: keyof ParsedRow): unknown => {
      const idx = colMap.get(f);
      return idx === undefined ? null : raw[idx];
    };

    const name = faText(get("name"));
    const nationalId = normalizeNationalId(get("nationalId"));
    const phone = digits(get("phone"));

    const row: ParsedRow = {
      row: r + 1, // شماره سطر اکسل (۱ = هدر)
      province: faText(get("province")),
      name,
      education: faText(get("education")),
      workLicense: faText(get("workLicense")),
      profRank: faText(get("profRank")),
      contractNo: faText(get("contractNo")),
      provinceCode: faText(get("provinceCode")),
      personalCode: faText(get("personalCode")),
      bankSheba: digits(get("bankSheba")),
      nationalId,
      phone,
      nidValid: isValidNationalId(nationalId),
      action: "create",
    };

    // ---------- اعتبارسنجی ----------
    if (!name) {
      row.error = "نام و نام خانوادگی خالی است";
    } else if (!nationalId) {
      row.error = "کد ملی خالی است";
    } else if (!/^\d{10}$/.test(nationalId)) {
      row.error = `کد ملی باید ۱۰ رقم باشد (ارقام دریافتی: ${nationalId.length})`;
    } else if (seenNids.has(nationalId)) {
      row.error = `کد ملی تکراری در فایل — پیش‌تر در سطر ${seenNids.get(nationalId)} آمده است`;
    } else if (!phone) {
      row.error = "شماره تماس خالی است — رمز عبور اولیه از شماره تماس ساخته می‌شود";
    } else if (phone.length < 8 || phone.length > 15) {
      row.error = "شماره تماس معتبر نیست (باید بین ۸ تا ۱۵ رقم باشد)";
    }
    seenNids.set(nationalId, r + 1);
    rows.push(row);
  }

  const summary = {
    total: rows.length,
    create: rows.filter((x) => !x.error && x.action === "create").length,
    update: rows.filter((x) => !x.error && x.action === "update").length,
    error: rows.filter((x) => x.error).length,
  };
  return { headers, rows, summary };
}
