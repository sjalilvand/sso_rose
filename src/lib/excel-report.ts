/**
 * پارس فایل اکسل گزارش خدمات آزاد — بند ۷
 *
 * منطق دقیقاً مطابق داشبورد نمونه (roseClinicStateV3.html):
 * ستون‌های پایه: ردیف | استان | نام و نام خانوادگی | مدرک تحصیلی | پروانه اشتغال |
 * رتبه حرفه‌ای | شماره قرارداد | کد استان‌ها | کد تفضیلی شخص | شباء | کد ملی | تماس
 * سپس برای هر خدمت ۵ ستون: تعداد | مبلغ واریزی | ارزش افزوده | مبلغ خالص | سهم مشارکت
 * و در پایان ۴ ستون جمع: ناخالص پرداختی | مالیات | سایر کسور | خالص پرداختی.
 *
 * ماه و سال از نام فایل (مثال: «خدمات آزاد شهریور 1405 کلی.xlsx») یا سطر عنوان تشخیص
 * داده می‌شود؛ سطرهای جمع استان و جمع کل حذف و رکوردهای سطح «مشاور × ماه» استخراج می‌شوند.
 */
import * as XLSX from "xlsx";

export const JALALI_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

const MONTH_PATTERNS: Array<[string, number]> = [
  ["فروردین", 1], ["فروردين", 1], ["اردیبهشت", 2], ["ارديبهشت", 2], ["خرداد", 3],
  ["تیر", 4], ["تير", 4], ["مرداد", 5], ["امرداد", 5], ["شهریور", 6], ["شهريور", 6],
  ["مهر", 7], ["آبان", 8], ["ابان", 8], ["آذر", 9], ["اذر", 9], ["دی", 10], ["دي", 10],
  ["بهمن", 11], ["اسفند", 12],
];

const SERVICE_FALLBACK = [
  { name: "فردی حضوری (روان‌درمانی)", code: "8201" },
  { name: "زوج‌درمانی", code: "8202" },
  { name: "مشاوره گروهی (گروه‌درمانی)", code: "8203" },
  { name: "کارگاه آموزش پیشگیرانه", code: "8204" },
  { name: "نوروفیدبک", code: "8205" },
  { name: "نقشه مغزی", code: "8206" },
  { name: "آزمون MMPI", code: "8207" },
  { name: "آزمون NEO", code: "8208" },
  { name: "آزمون BAI", code: "8209" },
  { name: "آزمون BDI", code: "8210" },
  { name: "آزمون MBTI", code: "8211" },
  { name: "آزمون وکسلر", code: "8212" },
  { name: "آزمون میلون", code: "8213" },
  { name: "آزمون هالند", code: "8214" },
  { name: "آزمون گاردنر", code: "8215" },
  { name: "آزمون SCL90", code: "8216" },
];

export interface ServiceBlock { name: string; code: string }
export interface ServiceTotals { count: number; gross: number; vat: number; net: number; part: number }
export interface ReportRecord {
  province: string; name: string; degree: string; license: string; rank: string;
  contract: string; stdCode: string; pcode: string; bankSheba: string; phone: string;
  services: ServiceTotals[];
  totals: ServiceTotals & { grossPay: number; tax: number; other: number; netPaid: number };
}
export interface ParsedReport {
  headerRow: number;
  blocks: ServiceBlock[];
  consultants: ReportRecord[];
  provinceTotals: Array<{ province: string; totals: ReportRecord["totals"] }>;
  grand: ReportRecord["totals"] | null;
  month: number;
  year: number;
  sheet: string;
  nConsultants: number;
}

// ---------- نرمال‌سازی (مطابق نمونه) ----------
function toEn(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}
function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const s = toEn(v).replace(/,/g, "").replace(/،/g, "").replace(/\s/g, "");
  if (s === "" || s === "*") return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function clean(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v === "*") return "";
  let s = String(v);
  if (s.trim() === "*") return "";
  return s.replace(/\u200c/g, " ").replace(/[\n\r]+/g, " ").trim();
}

// ---------- تشخیص دورهٔ شمسی ----------
export function detectPeriod(text: string): { month: number; year: number } | null {
  const t = toEn(text || "");
  let year: number | null = null;
  const ym = t.match(/1[34]\d{2}/);
  if (ym) {
    const y = parseInt(ym[0]);
    if (y >= 1390 && y <= 1420) year = y;
  }
  let month: number | null = null;
  for (const [pat, m] of MONTH_PATTERNS) {
    if (t.includes(pat)) { month = m; break; }
  }
  return month && year ? { month, year } : null;
}

// ---------- تشخیص ساختار شیت ----------
interface Layout {
  H: number;
  blocks: Array<ServiceBlock & { col: number }>;
  totalsCols: { g: number; t: number; o: number; n: number };
}

function detectLayout(rows: unknown[][]): Layout {
  let H = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i] || [];
    if (clean(r[0]) === "ردیف" || clean(r[1]) === "استان") { H = i; break; }
  }
  if (H < 0) H = 2;
  let layout: Layout | null = null;
  for (const cand of [H - 1, H - 2, H - 3]) {
    if (cand < 0) continue;
    const row = (rows[cand] || []).map(clean);
    const blocks: Array<ServiceBlock & { col: number }> = [];
    let tc: { g: number; t: number; o: number; n: number } | null = null;
    for (let c = 8; c < row.length; c++) {
      const v = row[c];
      if (!v) continue;
      if (v.includes("ناخالص پرداختی")) { tc = { g: c, t: c + 1, o: c + 2, n: c + 3 }; break; }
      const code = (v.match(/(\d{4})/) || [])[1] || "";
      const name = v.replace(/\s*\d{4}\s*$/, "").trim() || `خدمت ${blocks.length + 1}`;
      blocks.push({ name, code, col: c });
      c += 4;
    }
    if (blocks.length >= 6 && tc) {
      const sub = rows[H] || [];
      const okSub = blocks.every((b) => (clean(sub[b.col]) || "").includes("تعداد"));
      if (okSub || blocks.length >= 8) { layout = { H, blocks, totalsCols: tc }; break; }
    }
  }
  if (!layout) {
    layout = {
      H,
      blocks: SERVICE_FALLBACK.map((s, i) => ({ ...s, col: 12 + i * 5 })),
      totalsCols: { g: 92, t: 93, o: 94, n: 95 },
    };
  }
  return layout;
}

function rowToRecord(norm: string[], layout: Layout, headerCells: string[]): ReportRecord {
  const services = layout.blocks.map((b) => {
    const c = b.col;
    // اگر در شیت این خدمت ۴ ستون داشته باشد (بدون سهم مشارکت) تطبیق هوشمند
    const sub = (clean(headerCells[c]) || "").includes("سهم") ? 5 : 4;
    return {
      count: toNum(norm[c]),
      gross: toNum(norm[c + 1]),
      vat: toNum(norm[c + 2]),
      net: toNum(norm[c + 3]),
      part: sub === 5 ? toNum(norm[c + 4]) : 0,
    };
  });
  const sum = (k: keyof ServiceTotals) => services.reduce((s, x) => s + (x[k] || 0), 0);
  let grossPay = toNum(norm[layout.totalsCols.g]);
  if (!grossPay) grossPay = sum("part");
  const tax = toNum(norm[layout.totalsCols.t]);
  const other = toNum(norm[layout.totalsCols.o]);
  let netPaid = toNum(norm[layout.totalsCols.n]);
  if (!netPaid) netPaid = grossPay - tax - other;
  return {
    province: clean(norm[1]),
    name: clean(norm[2]),
    degree: clean(norm[3]),
    license: clean(norm[4]),
    rank: clean(norm[5]),
    contract: clean(norm[6]),
    stdCode: clean(norm[7]),
    pcode: clean(norm[8]),
    bankSheba: clean(norm[9]),
    phone: clean(norm[10]),
    services,
    totals: {
      count: sum("count"), gross: sum("gross"), vat: sum("vat"), net: sum("net"), part: sum("part"),
      grossPay, tax, other, netPaid,
    },
  };
}

function pickSheet(wb: XLSX.WorkBook): { name: string; ws: XLSX.WorkSheet } {
  let best: { name: string; ws: XLSX.WorkSheet } | null = null;
  let bestScore = -1;
  for (const nm of wb.SheetNames) {
    const ws = wb.Sheets[nm];
    const ref = ws["!ref"] || "A1:A1";
    const range = XLSX.utils.decode_range(ref);
    let score = (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
    if (/مبالغ|محاسبه/.test(nm)) score += 1e7;
    if (score > bestScore) { bestScore = score; best = { name: nm, ws }; }
  }
  return best!;
}

/** پارس کامل یک فایل اکسل گزارش — خروجی آمادهٔ ذخیره در ReportFile */
export function parseReportWorkbook(
  buf: ArrayBuffer | Uint8Array,
  fileName: string
): ParsedReport {
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const pick = pickSheet(wb);
  const json = XLSX.utils.sheet_to_json<unknown[]>(pick.ws, { header: 1, defval: "" });

  let period = detectPeriod(fileName);
  if (!period) {
    const title = (json[0] || []).map(clean).join(" ") + " " + clean((json[1] || [])[0]);
    period = detectPeriod(title);
  }

  const layout = detectLayout(json);
  const headerCells = (json[layout.H] || []).map(clean);
  const consultants: ReportRecord[] = [];
  const provinceTotals: Array<{ province: string; totals: ReportRecord["totals"] }> = [];
  let grand: ReportRecord["totals"] | null = null;

  for (let i = layout.H + 1; i < json.length; i++) {
    const norm = (json[i] || []).map(clean);
    if (!norm.some((v) => v !== "")) continue;
    const rec = rowToRecord(norm, layout, headerCells);
    const t = rec.totals;
    const hasMoney = t.grossPay > 0 || t.netPaid > 0 || t.count > 0 || t.gross > 0 || t.net > 0 || t.tax > 0 || t.other > 0;
    if (!rec.province && !rec.name) {
      if (hasMoney) grand = rec.totals;
      continue;
    }
    if (rec.province && !rec.name && !rec.degree && !rec.rank && !rec.pcode) {
      provinceTotals.push({ province: rec.province, totals: rec.totals });
      continue;
    }
    if (rec.name || rec.pcode || hasMoney) consultants.push(rec);
  }

  return {
    headerRow: layout.H,
    blocks: layout.blocks.map((b) => ({ name: b.name, code: b.code })),
    consultants,
    provinceTotals,
    grand,
    month: period?.month || 0,
    year: period?.year || 0,
    sheet: pick.name,
    nConsultants: consultants.length,
  };
}

/** خلاصهٔ مالی یک فایل برای نمایش در فهرست */
export function summarize(r: ParsedReport) {
  const g = (k: keyof ReportRecord["totals"], key: "consultants" | "provinceTotals" | "grand") => 0;
  const sum = (k: keyof ReportRecord["totals"]) =>
    r.consultants.reduce((s, c) => s + (c.totals[k] || 0), 0);
  return {
    grossPay: sum("grossPay"),
    tax: sum("tax"),
    other: sum("other"),
    netPaid: sum("netPaid"),
    gross: sum("gross"),
    count: sum("count"),
    nConsultants: r.nConsultants,
    month: r.month,
    year: r.year,
  };
}
