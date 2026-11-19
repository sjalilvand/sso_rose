/**
 * پارس عمومی اکسل — هر فایل با هر ساختاری (فاز ۷۳)
 *
 * برخلاف excel-report.ts که قالب خاص «گزارش خدمات آزاد» را می‌خواند، اینجا:
 *   - همهٔ شیت‌ها خوانده می‌شوند و سطر عنوان به‌صورت خودکار پیدا می‌شود
 *   - ستون‌ها از سطر عنوان ساخته می‌شوند (تکراری‌ها شماره می‌خورند)
 *   - نوع هر ستون تشخیص داده می‌شود: number / date / text
 *   - پروفایل آماری هر ستون محاسبه می‌شود (توصیفی: میانگین، میانه، انحراف، بیشینه…)
 *
 * سقف‌ها برای جلوگیری از سنگین شدن پایگاه داده:
 *   - حداکثر ۵ شیت، هر شیت ۵۰۰۰ سطر و ۱۲۰ ستون ذخیره می‌شود
 */
import * as XLSX from "xlsx";
import { toEnDigits } from "./formula";

export type ColType = "number" | "date" | "text";

export interface UniversalColumn { name: string; type: ColType }
export interface HistogramBin { label: string; count: number }

export interface ColumnProfile {
  name: string;
  type: ColType;
  count: number;      // مقدار غیر خالی
  missing: number;    // مقدار خالی
  unique: number;
  // عددی
  sum?: number; mean?: number; median?: number; std?: number;
  min?: number; max?: number; p25?: number; p75?: number;
  histogram?: HistogramBin[];
  // متنی
  top?: Array<{ value: string; count: number }>;
  // تاریخ
  dateMin?: string; dateMax?: string;
}

export interface UniversalSheetData {
  name: string;
  columns: UniversalColumn[];
  rows: Array<Record<string, unknown>>;
  profile: ColumnProfile[];
  totalRows: number; // قبل از سقف
}

export interface UniversalParsed {
  sheets: UniversalSheetData[];
  activeSheet: string;
  nRowsTotal: number;
}

const MAX_SHEETS = 5;
const MAX_ROWS = 5000;
const MAX_COLS = 120;

// ---------- تشخیص تاریخ شمسی (مثل 1405/02/19 یا ۱۴۰۵-۲-۱۹) ----------
const JALALI_RE = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/;
// فقط سال/ماه (مثل 1405/01 در ستون «ماه») هم تاریخ به حساب می‌آید
const YM_RE = /^(\d{4})[\/\-.](\d{1,2})$/;
export function parseJalali(s: string): { y: number; m: number; d: number } | null {
  const t = toEnDigits(s).trim();
  const m = t.match(JALALI_RE);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (y < 1300 || y > 1500 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { y, m: mo, d };
  }
  const ym = t.match(YM_RE);
  if (ym) {
    const y = +ym[1], mo = +ym[2];
    if (y < 1300 || y > 1500 || mo < 1 || mo > 12) return null;
    return { y, m: mo, d: 1 };
  }
  return null;
}

function looksLikeDate(v: unknown): boolean {
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  const s = String(v ?? "").trim();
  if (!s) return false;
  if (parseJalali(s)) return true;
  // میلادی معقول
  if (/^\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}$/.test(toEnDigits(s))) {
    const d = new Date(s);
    const y = d.getFullYear();
    return !Number.isNaN(d.getTime()) && y >= 1990 && y <= 2100;
  }
  // سال/ماه میلادی
  const ym2 = toEnDigits(s).trim().match(/^19\d{2}[\/\-.]\d{1,2}$|^20\d{2}[\/\-.]\d{1,2}$/);
  if (ym2) {
    const yy = parseInt(ym2[0].slice(0, 4));
    const mm = parseInt(ym2[0].split(/[\/\-.]/)[1]);
    return mm >= 1 && mm <= 12;
  }
  return false;
}

function isNum(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (v === null || v === undefined || v === "") return false;
  const s = toEnDigits(String(v)).replace(/[,،\s]/g, "");
  return s !== "" && !Number.isNaN(parseFloat(s)) && Number.isFinite(parseFloat(s));
}

function numVal(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined || v === "") return null;
  const s = toEnDigits(String(v)).replace(/[,،\s]/g, "");
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

function cellToStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/\u200c/g, " ").replace(/[\n\r]+/g, " ").trim();
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

/** یافتن سطر عنوان: اولین سطر که حداقل ۲ سلول پر متنی دارد و سلول‌های بعدی عمدتاً عددی نیستند */
function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i] || [];
    const filled = r.filter((c) => cellToStr(c) !== "");
    if (filled.length < 2) continue;
    const numeric = filled.filter((c) => isNum(c)).length;
    if (numeric / filled.length <= 0.4) return i;
  }
  return 0;
}

function uniqueName(names: Map<string, number>, raw: string, idx: number): string {
  let name = raw || `ستون ${idx + 1}`;
  const seen = names.get(name) || 0;
  names.set(name, seen + 1);
  if (seen > 0) name = `${name} (${seen + 1})`;
  return name;
}

/** پروفایل آماری یک ستون */
export function profileColumn(name: string, type: ColType, values: unknown[]): ColumnProfile {
  const filled = values.filter((v) => v !== null && v !== undefined && v !== "");
  const p: ColumnProfile = {
    name,
    type,
    count: filled.length,
    missing: values.length - filled.length,
    unique: new Set(filled.map((v) => String(v))).size,
  };
  if (type === "number") {
    const xs = filled.map(numVal).filter((x): x is number => x !== null);
    if (xs.length) {
      xs.sort((a, b) => a - b);
      const sum = xs.reduce((a, b) => a + b, 0);
      const mean = sum / xs.length;
      p.sum = sum;
      p.mean = mean;
      p.min = xs[0];
      p.max = xs[xs.length - 1];
      p.median = quantile(xs, 0.5);
      p.p25 = quantile(xs, 0.25);
      p.p75 = quantile(xs, 0.75);
      p.std = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
      // هیستوگرام ۱۰ سطلی
      const min = p.min, max = p.max;
      if (max > min) {
        const bins = 10;
        const width = (max - min) / bins;
        const hist = Array.from({ length: bins }, (_, i) => ({
          label: fmtBin(min + i * width, min + (i + 1) * width),
          count: 0,
        }));
        for (const x of xs) {
          const idx = Math.min(bins - 1, Math.floor((x - min) / width));
          hist[idx].count++;
        }
        p.histogram = hist;
      } else {
        p.histogram = [{ label: `${round(max)}`, count: xs.length }];
      }
    }
  } else if (type === "text") {
    const counts = new Map<string, number>();
    for (const v of filled) {
      const s = cellToStr(v) || "خالی";
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    p.top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([value, count]) => ({ value, count }));
  } else {
    const ds = filled.map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v))).sort();
    if (ds.length) {
      p.dateMin = ds[0];
      p.dateMax = ds[ds.length - 1];
    }
  }
  return p;
}

function round(n: number): number {
  return Math.abs(n) >= 1000 ? Math.round(n) : Math.round(n * 100) / 100;
}
function fmtBin(a: number, b: number): string {
  return `${round(a)}–${round(b)}`;
}

/** پارس یک شیت به ستون‌ها و سطرهای تایپ‌دار */
function parseSheet(name: string, ws: XLSX.WorkSheet): UniversalSheetData | null {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  if (!raw.length) return null;
  const H = findHeaderRow(raw);
  const headerCells = (raw[H] || []).map(cellToStr);
  const width = Math.min(
    Math.max(...raw.map((r) => (r || []).length), 0),
    MAX_COLS
  );
  if (width === 0) return null;

  // نام ستون‌ها
  const seen = new Map<string, number>();
  const colNames: string[] = [];
  for (let c = 0; c < width; c++) colNames.push(uniqueName(seen, headerCells[c] || `ستون ${c + 1}`, c));

  // سطرهای خام
  const rawRows: Array<Record<string, unknown>> = [];
  for (let i = H + 1; i < raw.length; i++) {
    const r = raw[i] || [];
    const obj: Record<string, unknown> = {};
    let filled = 0;
    for (let c = 0; c < width; c++) {
      const v = r[c];
      if (v !== "" && v !== null && v !== undefined) filled++;
      obj[colNames[c]] = v instanceof Date ? v : v;
    }
    if (filled > 0) rawRows.push(obj);
    if (rawRows.length >= 20000) break; // نمونه‌برداری برای تشخیص نوع — سقف بالا
  }
  if (!rawRows.length) return null;

  // تشخیص نوع ستون‌ها (نمونه ۵۰۰ مقدار)
  const types: ColType[] = colNames.map((_, c) => {
    const vals = rawRows.slice(0, 500).map((r) => r[colNames[c]]).filter((v) => v !== "" && v !== null && v !== undefined);
    if (!vals.length) return "text";
    const nNum = vals.filter(isNum).length / vals.length;
    const nDate = vals.filter(looksLikeDate).length / vals.length;
    if (nDate >= 0.8) return "date";
    if (nNum >= 0.8) return "number";
    return "text";
  });

  // تبدیل مقادیر + سقف ذخیره
  const rows: Array<Record<string, unknown>> = rawRows.slice(0, MAX_ROWS).map((r) => {
    const o: Record<string, unknown> = {};
    for (let c = 0; c < colNames.length; c++) {
      const key = colNames[c];
      const v = r[key];
      if (types[c] === "number") o[key] = numVal(v);
      else if (types[c] === "date") {
        if (v instanceof Date) o[key] = v.toISOString().slice(0, 10);
        else o[key] = cellToStr(v);
      } else o[key] = cellToStr(v);
    }
    return o;
  });

  const columns: UniversalColumn[] = colNames.map((name, c) => ({ name, type: types[c] }));
  const profile = columns.map((col) => profileColumn(col.name, col.type, rows.map((r) => r[col.name])));

  return { name, columns, rows, profile, totalRows: rawRows.length };
}

/** پارس کامل فایل — همهٔ شیت‌ها */
export function parseUniversalWorkbook(buf: ArrayBuffer | Uint8Array, fileName: string): UniversalParsed {
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });

  interface SheetScore { name: string; size: number; data: UniversalSheetData | null }
  const scored: SheetScore[] = [];
  for (const nm of wb.SheetNames) {
    const ws = wb.Sheets[nm];
    if (!ws) continue;
    const ref = ws["!ref"] || "A1:A1";
    const range = XLSX.utils.decode_range(ref);
    const size = (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
    scored.push({ name: nm, size, data: null });
  }
  // فقط ۵ شیت بزرگ را پارس می‌کنیم
  scored.sort((a, b) => b.size - a.size);
  const sheets: UniversalSheetData[] = [];
  for (const s of scored.slice(0, MAX_SHEETS)) {
    const d = parseSheet(s.name, wb.Sheets[s.name]);
    if (d && d.rows.length) sheets.push(d);
  }
  if (!sheets.length) {
    throw new Error("هیچ داده‌ای در این فایل پیدا نشد — فایل خالی یا ناخواناست");
  }
  sheets.sort((a, b) => b.rows.length * Math.max(1, b.columns.length) - a.rows.length * Math.max(1, a.columns.length));
  return {
    sheets,
    activeSheet: sheets[0].name,
    nRowsTotal: sheets.reduce((a, s) => a + s.totalRows, 0),
  };
}

/** ضریب همبستگی پیرسون — برای تحلیل تحلیلی */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]; sy += ys[i]; sxy += xs[i] * ys[i];
    sx2 += xs[i] * xs[i]; sy2 += ys[i] * ys[i];
  }
  const num = n * sxy - sx * sy;
  const den = Math.sqrt((n * sx2 - sx * sx) * (n * sy2 - sy * sy));
  return den === 0 ? null : num / den;
}

/** رگرسیون خطی ساده — y = a + b*x + b*x … خروجی: intercept a و شیب b و R² */
export function linearRegression(xs: number[], ys: number[]): { a: number; b: number; r2: number; n: number } | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]; sy += ys[i]; sxy += xs[i] * ys[i]; sx2 += xs[i] * xs[i];
  }
  const den = n * sx2 - sx * sx;
  if (den === 0) return null;
  const b = (n * sxy - sx * sy) / den;
  const a = (sy - b * sx) / n;
  const meanY = sy / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = a + b * xs[i];
    ssTot += (ys[i] - meanY) ** 2;
    ssRes += (ys[i] - pred) ** 2;
  }
  return { a, b, r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot, n };
}
