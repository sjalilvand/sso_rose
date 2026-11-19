"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ScatterChart, Scatter, ComposedChart, Area,
} from "recharts";
import { api } from "@/lib/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  UploadCloud, FileSpreadsheet, Loader2, Trash2, Search, X, Plus, Lightbulb,
  Calculator, TrendingUp, Filter, Table2, ArrowUpDown, Sparkles, Download, Wand2, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { faNum } from "@/lib/jalali";
import { normalizeFa } from "@/lib/ir-geo";
import {
  parseFormula, evalRow, evalAgg, formulaColumns,
  type Val, type Node,
} from "@/lib/formula";

/**
 * داشبورد عمومی اکسل — هر فایل با هر ساختاری (فاز ۷۳)
 *
 * پنج داشبورد خودکار روی هر داده: توصیفی، تحلیلی، تفسیری، مدل‌سازی، پیشنهادی
 * + جستجوی متنی، فیلتر ستونی، ساخت شاخص (ستون محاسباتی و شاخص کل) و جدول داده.
 */

// ---------- انواع ----------
interface SheetPayload {
  name: string;
  columns: Array<{ name: string; type: string }>;
  rows: Array<Record<string, unknown>>;
  profile: Array<{
    name: string; type: string; count: number; missing: number; unique: number;
    sum?: number; mean?: number; median?: number; std?: number; min?: number; max?: number;
    p25?: number; p75?: number; histogram?: Array<{ label: string; count: number }>;
    top?: Array<{ value: string; count: number }>; dateMin?: string; dateMax?: string;
  }>;
  totalRows: number;
}
interface DatasetMeta {
  id: string; name: string; sheetNames: string[]; activeSheet: string;
  nRows: number; nRowsTotal: number; createdAt: string;
}
interface Indicator {
  id: string; name: string; formula: string; kind: "ROW" | "AGG";
  description: string; createdAt: string;
  createdBy?: { name: string } | null;
}
type Filter =
  | { kind: "text"; values: string[] }
  | { kind: "num"; min?: number; max?: number }
  | { kind: "date"; from?: string; to?: string };

const CHART_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#0ea5e9", "#a855f7"];

function fa(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const s = n.toFixed(digits).replace(/\.0+$/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return faNum(s);
}
function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return fa(n / 1e9, 2) + " میلیارد";
  if (a >= 1e6) return fa(n / 1e6, 2) + " میلیون";
  if (a >= 1e3) return fa(n / 1e3, 1) + " هزار";
  return fa(n, a % 1 === 0 ? 0 : 2);
}
function fmtCell(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "بله" : "خیر";
  if (typeof v === "number") return fmtNum(v);
  return String(v).slice(0, 60);
}

const DASH_TABS = [
  { key: "desc", label: "توصیفی" },
  { key: "ana", label: "تحلیلی" },
  { key: "interp", label: "تفسیری" },
  { key: "model", label: "مدل‌سازی" },
  { key: "sugg", label: "پیشنهادی" },
  { key: "data", label: "داده‌ها" },
] as const;
type DashTab = typeof DASH_TABS[number]["key"];

export function UniversalDashboard() {
  // ---------- داده ----------
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetPayload[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // ---------- فیلتر و جستجو ----------
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, Filter>>({});
  const [filterCol, setFilterCol] = useState<string | null>(null);

  // ---------- شاخص‌ها ----------
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [indOpen, setIndOpen] = useState(false);
  const [indName, setIndName] = useState("");
  const [indFormula, setIndFormula] = useState("");
  const [indKind, setIndKind] = useState<"ROW" | "AGG">("ROW");
  const [indDesc, setIndDesc] = useState("");
  const [indSaving, setIndSaving] = useState(false);
  const [activeAgg, setActiveAgg] = useState<string[]>([]); // شاخص‌های کل فعال روی KPI
  const [activeRows, setActiveRows] = useState<string[]>([]); // شاخص‌های ستونی فعال

  // ---------- نماها ----------
  const [tab, setTab] = useState<DashTab>("desc");
  const [dim, setDim] = useState(""); // ستون دسته‌بندی برای تحلیلی
  const [measure, setMeasure] = useState(""); // ستون عددی برای تحلیلی
  const [agg, setAgg] = useState<"sum" | "avg" | "count" | "min" | "max">("sum");
  const [histCol, setHistCol] = useState("");
  const [catCol, setCatCol] = useState("");
  const [yCol, setYCol] = useState("");
  const [xCol, setXCol] = useState("");
  const [forecastN, setForecastN] = useState(6);
  const [page, setPage] = useState(0);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  // ---------- بارگذاری ----------
  const loadList = useCallback(async () => {
    try {
      const d = await api<{ datasets: Array<DatasetMeta & { sheetNames?: string }> }>("/api/reports/dataset");
      setDatasets(d.datasets.map((x) => ({
        ...x,
        sheetNames: Array.isArray(x.sheetNames) ? x.sheetNames : safeParse(x.sheetNames),
      })));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  const loadIndicators = useCallback(async () => {
    try {
      const d = await api<{ indicators: Indicator[] }>("/api/reports/indicators");
      setIndicators(d.indicators);
    } catch { /* شاخص‌ها اختیاری‌اند */ }
  }, []);
  useEffect(() => { loadList(); loadIndicators(); }, [loadList, loadIndicators]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const d = await api<{ dataset: { sheets: SheetPayload[]; activeSheet: string } }>(`/api/reports/dataset/${id}`);
      setSheets(d.dataset.sheets);
      setSheetName(d.dataset.activeSheet || d.dataset.sheets[0]?.name || "");
      setFilters({});
      setSearch("");
      setActiveAgg([]);
      setActiveRows([]);
      setSelected(id);
      setTab("desc");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  async function upload(fileList: FileList | null) {
    const list = Array.from(fileList || []).filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
    if (!list.length) { toast.error("فرمت فایل پشتیبانی نمی‌شود (xlsx / xls / csv)"); return; }
    setUploading(true);
    try {
      let lastId: string | null = null;
      let okN = 0;
      for (const f of list) {
        const form = new FormData();
        form.append("files", f);
        const r = await api<{ results: Array<{ ok: boolean; id?: string; error?: string }> }>(
          "/api/reports/dataset", { method: "POST", body: form }
        );
        const ok = r.results.find((x) => x.ok);
        if (ok?.id) { lastId = ok.id; okN++; }
        const bad = r.results.find((x) => !x.ok);
        if (bad) toast.error(`${f.name}: ${bad.error}`);
      }
      if (okN) toast.success(`${faNum(okN)} فایل پردازش شد — ستون‌ها به‌صورت خودکار تشخیص داده شدند`);
      await loadList();
      if (lastId) await loadDetail(lastId);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function removeDataset(id: string) {
    try {
      await api(`/api/reports/dataset/${id}`, { method: "DELETE" });
      if (selected === id) { setSelected(null); setSheets([]); }
      toast.success("مجموعه‌داده حذف شد");
      await loadList();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  // ---------- شاخص‌ها ----------
  async function saveIndicator() {
    if (!indName.trim() || !indFormula.trim()) { toast.error("نام و فرمول شاخص الزامی است"); return; }
    setIndSaving(true);
    try {
      parseFormula(indFormula); // اعتبارسنجی سمت کلاینت هم انجام شود
      await api("/api/reports/indicators", {
        method: "POST",
        body: { name: indName.trim(), formula: indFormula.trim(), kind: indKind, description: indDesc.trim() },
      });
      toast.success("شاخص ساخته شد");
      setIndOpen(false);
      setIndName(""); setIndFormula(""); setIndDesc("");
      await loadIndicators();
      if (indKind === "ROW") setActiveRows((a) => [...a, indName.trim()]);
      else setActiveAgg((a) => [...a, indName.trim()]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIndSaving(false);
    }
  }
  async function deleteIndicator(id: string) {
    try {
      await api(`/api/reports/indicators/${id}`, { method: "DELETE" });
      setIndicators((xs) => xs.filter((x) => x.id !== id));
      toast.success("شاخص حذف شد");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  // ---------- دادهٔ فعال ----------
  const sheet = useMemo(
    () => sheets.find((s) => s.name === sheetName) || sheets[0] || null,
    [sheets, sheetName]
  );
  const columns = useMemo(() => sheet?.columns || [], [sheet]);
  const numCols = useMemo(() => columns.filter((c) => c.type === "number").map((c) => c.name), [columns]);
  const textCols = useMemo(() => columns.filter((c) => c.type === "text").map((c) => c.name), [columns]);
  const dateCols = useMemo(() => columns.filter((c) => c.type === "date").map((c) => c.name), [columns]);

  // شاخص‌های فعال: تعریف + AST
  const rowIndDefs = useMemo(() => {
    const defs: Array<{ name: string; formula: string; node: Node }> = [];
    for (const nm of activeRows) {
      const def = indicators.find((i) => i.name === nm && i.kind === "ROW");
      if (!def) continue;
      try { defs.push({ name: def.name, formula: def.formula, node: parseFormula(def.formula) }); } catch { /* بی‌اثر */ }
    }
    return defs;
  }, [activeRows, indicators]);
  const aggIndDefs = useMemo(() => {
    const defs: Array<{ name: string; formula: string; node: Node }> = [];
    for (const nm of activeAgg) {
      const def = indicators.find((i) => i.name === nm && i.kind === "AGG");
      if (!def) continue;
      try { defs.push({ name: def.name, formula: def.formula, node: parseFormula(def.formula) }); } catch { /* بی‌اثر */ }
    }
    return defs;
  }, [activeAgg, indicators]);

  /** فیلتر جستجوی عمومی + فیلترهای ستونی */
  const filteredRows = useMemo(() => {
    if (!sheet) return [];
    let rows = sheet.rows;
    const q = normalizeFa(search).trim();
    if (q) {
      rows = rows.filter((r) =>
        columns.some((c) => normalizeFa(String(r[c.name] ?? "")).includes(q))
      );
    }
    for (const [col, f] of Object.entries(filters)) {
      if (f.kind === "text" && f.values.length) {
        rows = rows.filter((r) => f.values.includes(String(r[col] ?? "")));
      } else if (f.kind === "num") {
        rows = rows.filter((r) => {
          const v = typeof r[col] === "number" ? (r[col] as number) : parseFloat(String(r[col]));
          if (v === null || Number.isNaN(v)) return false;
          if (f.min !== undefined && f.min !== null && v < f.min) return false;
          if (f.max !== undefined && f.max !== null && v > f.max) return false;
          return true;
        });
      } else if (f.kind === "date") {
        rows = rows.filter((r) => {
          const v = String(r[col] ?? "");
          if (!v) return false;
          if (f.from && v < f.from) return false;
          if (f.to && v > f.to) return false;
          return true;
        });
      }
    }
    return rows;
  }, [sheet, columns, search, filters]);

  // ردیف‌ها با ستون‌های محاسباتی (شاخص‌های فعال)
  const enrichedRows = useMemo(() => {
    if (!rowIndDefs.length) return filteredRows;
    return filteredRows.map((r) => {
      const o = { ...r };
      for (const d of rowIndDefs) {
        try {
          o[d.name] = evalRow(d.node, (c) => (c in o ? (o[c] as Val) : null));
        } catch { o[d.name] = null; }
      }
      return o;
    });
  }, [filteredRows, rowIndDefs]);

  const enrichedColumns = useMemo(
    () => [
      ...columns,
      ...rowIndDefs.map((d) => ({ name: d.name, type: "number" as const, derived: true })),
    ],
    [columns, rowIndDefs]
  );
  const enrichedNumCols = useMemo(() => enrichedColumns.filter((c) => c.type === "number").map((c) => c.name), [enrichedColumns]);

  // مقادیر شاخص‌های کل
  const aggValues = useMemo(() => {
    const out: Array<{ name: string; formula: string; value: number | null; error?: string }> = [];
    for (const d of aggIndDefs) {
      try {
        const v = evalAgg(d.node, filteredRows as Array<Record<string, unknown>>);
        out.push({ name: d.name, formula: d.formula, value: typeof v === "number" ? v : null });
      } catch (err) {
        out.push({ name: d.name, formula: d.formula, value: null, error: (err as Error).message });
      }
    }
    return out;
  }, [aggIndDefs, filteredRows]);

  // ---------- انتخاب‌های پیش‌فرض ----------
  useEffect(() => {
    if (!sheet) return;
    const nc = sheet.columns.filter((c) => c.type === "number").map((c) => c.name);
    const tc = sheet.columns.filter((c) => c.type === "text").map((c) => c.name);
    const dc = sheet.columns.filter((c) => c.type === "date").map((c) => c.name);
    if (!dim && tc.length) setDim(tc[0]);
    if (!measure && nc.length) setMeasure(nc[0]);
    if (!histCol && nc.length) setHistCol(nc[0]);
    if (!catCol && tc.length) setCatCol(tc[0]);
    if (!yCol && nc.length) setYCol(nc[0]);
    if (!xCol && (dc.length ? dc[0] : nc[1] || nc[0])) setXCol(dc[0] || nc[1] || nc[0] || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet?.name]);

  // ---------- تجمیع گروهی ----------
  const groupData = useMemo(() => {
    if (!dim) return [];
    const keyOf = (r: Record<string, unknown>) => String(r[dim] ?? "—") || "—";
    const m = new Map<string, Array<Record<string, unknown>>>();
    for (const r of enrichedRows) {
      const k = keyOf(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    const out = [...m.entries()].map(([k, rs]) => {
      let v = 0;
      if (agg === "count") v = rs.length;
      else {
        const xs = rs.map((r) => Number(r[measure])).filter((x) => Number.isFinite(x));
        if (agg === "sum") v = xs.reduce((a, b) => a + b, 0);
        else if (agg === "avg") v = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
        else if (agg === "min") v = xs.length ? Math.min(...xs) : 0;
        else v = xs.length ? Math.max(...xs) : 0;
      }
      return { name: k.length > 18 ? k.slice(0, 18) + "…" : k, value: v, n: rs.length };
    });
    return out.sort((a, b) => b.value - a.value).slice(0, 15);
  }, [dim, measure, agg, enrichedRows]);

  // ---------- همبستگی‌ها ----------
  const correlations = useMemo(() => {
    const cols = enrichedNumCols.slice(0, 8);
    const out: Array<{ a: string; b: string; r: number }> = [];
    const series = cols.map((c) => ({
      c,
      xs: enrichedRows.map((r) => Number(r[c])).filter((x) => Number.isFinite(x)),
    }));
    for (let i = 0; i < series.length; i++) {
      for (let j = i + 1; j < series.length; j++) {
        const xs = series[i].xs, ys = series[j].xs;
        const n = Math.min(xs.length, ys.length);
        if (n < 3) continue;
        let sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0;
        for (let k = 0; k < n; k++) {
          sx += xs[k]; sy += ys[k]; sxy += xs[k] * ys[k]; sx2 += xs[k] * xs[k]; sy2 += ys[k] * ys[k];
        }
        const num = n * sxy - sx * sy;
        const den = Math.sqrt((n * sx2 - sx * sx) * (n * sy2 - sy * sy));
        if (den === 0) continue;
        out.push({ a: series[i].c, b: series[j].c, r: num / den });
      }
    }
    return out.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
  }, [enrichedNumCols, enrichedRows]);

  // ---------- رگرسیون / مدل‌سازی ----------
  const modelData = useMemo(() => {
    if (!yCol || !xCol) return null;
    interface Pt { x: number; y: number; label: string }
    const pts: Pt[] = [];
    for (const r of enrichedRows) {
      const y = Number(r[yCol]);
      let x: number;
      if (dateCols.includes(xCol)) {
        const s = String(r[xCol] ?? "");
        const m2 = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
        if (m2) {
          // شمسی یا میلادی — هر دو به‌صورت ترتیبی استفاده می‌شوند
          x = +m2[1] * 10000 + +m2[2] * 100 + +m2[3];
        } else {
          const t = Date.parse(s);
          if (Number.isNaN(t)) continue;
          x = Math.round(t / 86400000);
        }
      } else {
        x = Number(r[xCol]);
      }
      if (Number.isFinite(x) && Number.isFinite(y)) {
        pts.push({ x, y, label: fmtCell(r[xCol]) });
      }
    }
    if (pts.length < 3) return null;
    // رگرسیون ساده روی (x, y)
    const n = pts.length;
    let sx = 0, sy = 0, sxy = 0, sx2 = 0;
    for (const p of pts) { sx += p.x; sy += p.y; sxy += p.x * p.y; sx2 += p.x * p.x; }
    const den = n * sx2 - sx * sx;
    if (den === 0) return null;
    const b = (n * sxy - sx * sy) / den;
    const a = (sy - b * sx) / n;
    const meanY = sy / n;
    let ssTot = 0, ssRes = 0;
    for (const p of pts) {
      const pred = a + b * p.x;
      ssTot += (p.y - meanY) ** 2;
      ssRes += (p.y - pred) ** 2;
    }
    const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
    // نقاط نمونه برای رسم
    const sorted = [...pts].sort((p1, p2) => p1.x - p2.x);
    const step = Math.max(1, Math.floor(sorted.length / 300));
    const chartPts = sorted.filter((_, i) => i % step === 0).map((p) => ({
      x: p.x, y: p.y, fit: a + b * p.x, label: p.label,
    }));
    // پیش‌بینی N دورهٔ بعدی
    const lastX = sorted[sorted.length - 1].x;
    const xs = sorted.map((p) => p.x);
    const gaps: number[] = [];
    for (let i = 1; i < xs.length; i++) gaps.push(xs[i] - xs[i - 1]);
    const avgGap = gaps.length ? gaps.reduce((s2, g) => s2 + g, 0) / gaps.length : 1;
    const forecasts = Array.from({ length: Math.min(24, Math.max(1, forecastN)) }, (_, i) => {
      const x = lastX + avgGap * (i + 1);
      return { x, y: null as number | null, fit: a + b * x, label: `پیش‌بینی ${faNum(i + 1)}` };
    });
    return {
      a, b, r2, n: pts.length,
      points: [...chartPts, ...forecasts],
      xLabel: xCol, yLabel: yCol,
    };
  }, [yCol, xCol, enrichedRows, dateCols, forecastN]);

  // ---------- بینش‌های تفسیری ----------
  const insights = useMemo(() => {
    if (!sheet) return [];
    const out: Array<{ icon: string; title: string; body: string }> = [];
    const prof = sheet.profile;
    out.push({
      icon: "rows",
      title: "اندازهٔ داده",
      body: `${faNum(filteredRows.length)} ردیف پس از فیلتر از ${faNum(sheet.totalRows)} ردیف فایل، در ${faNum(columns.length)} ستون — ${faNum(numCols.length)} ستون عددی، ${faNum(textCols.length)} متنی و ${faNum(dateCols.length)} تاریخی.`,
    });
    // پرتندارترین ستون متنی
    const topProf = prof.filter((p) => p.type === "text" && p.top?.length).sort((a, b) => (b.top![0].count / Math.max(1, b.count)) - (a.top![0].count / Math.max(1, a.count)))[0];
    if (topProf && topProf.top) {
      const share = Math.round((topProf.top[0].count / Math.max(1, filteredRows.length)) * 100);
      out.push({
        icon: "cat",
        title: `تمرکز داده روی یک دسته در «${topProf.name}»`,
        body: `${share}٪ ردیف‌ها متعلق به «${topProf.top[0].value}» است؛ ${topProf.unique} مقدار یکتا در این ستون وجود دارد.`,
      });
    }
    // ستون‌های عددی: میانگین vs میانه (چولگی)
    for (const p of prof.filter((x) => x.type === "number" && x.mean !== undefined && x.median !== undefined).slice(0, 3)) {
      const skew = p.median !== 0 ? (p.mean! - p.median!) / Math.abs(p.median!) : 0;
      if (Math.abs(skew) > 0.25) {
        out.push({
          icon: "skew",
          title: `توزیع نامتقارن در «${p.name}»`,
          body: `میانگین (${fmtNum(p.mean)}) ${skew > 0 ? "بیشتر" : "کمتر"} از میانه (${fmtNum(p.median)}) است؛ داده به سمت مقادیر ${skew > 0 ? "بالا" : "پایین"} چوله است — تعداد کمی رکورد بزرگ آمار را جابه‌جا می‌کنند.`,
        });
      }
    }
    // همبستگی‌های قوی
    for (const c of correlations.filter((x) => Math.abs(x.r) >= 0.5).slice(0, 3)) {
      out.push({
        icon: "corr",
        title: `ارتباط قوی بین «${c.a}» و «${c.b}»`,
        body: `ضریب همبستگی ${fa(c.r, 2)} — ${c.r > 0 ? "هم‌جهت" : "معکوس"}؛ ${c.r > 0 ? "رشد یکی معمولاً با رشد دیگری همراه است" : "رشد یکی با کاهش دیگری همراه است"}.`,
      });
    }
    // دادهٔ گمشده
    const missing = prof.filter((p) => p.missing > filteredRows.length * 0.2).slice(0, 3);
    for (const m of missing) {
      out.push({
        icon: "miss",
        title: `دادهٔ ناقص در «${m.name}»`,
        body: `${faNum(Math.round((m.missing / Math.max(1, filteredRows.length)) * 100))}٪ ردیف‌ها در این ستون خالی‌اند — پیش از گزارش رسمی باید تکمیل یا از تحلیل حذف شود.`,
      });
    }
    // روند زمانی
    if (dateCols.length && numCols.length) {
      const dCol = dateCols[0], nCol = enrichedNumCols[0];
      const byDate = new Map<string, number>();
      for (const r of enrichedRows) {
        const d = String(r[dCol] ?? "").slice(0, 10);
        const v = Number(r[nCol]);
        if (d && Number.isFinite(v)) byDate.set(d, (byDate.get(d) || 0) + v);
      }
      const ds = [...byDate.entries()].sort((x, y) => x[0].localeCompare(y[0]));
      if (ds.length >= 6) {
        const half = Math.floor(ds.length / 2);
        const first = ds.slice(0, half).reduce((s2, x) => s2 + x[1], 0) / half;
        const last = ds.slice(half).reduce((s2, x) => s2 + x[1], 0) / (ds.length - half);
        if (first > 0) {
          const g = Math.round(((last - first) / first) * 100);
          out.push({
            icon: "trend",
            title: `روند «${nCol}» در طول زمان`,
            body: `میانگین نیمهٔ دوم دوره نسبت به نیمهٔ اول ${g >= 0 ? "رشد" : "کاهش"} ${faNum(Math.abs(g))}٪ داشته است.`,
          });
        }
      }
    }
    return out;
  }, [sheet, filteredRows, columns, numCols, textCols, dateCols, enrichedNumCols, correlations]);

  // ---------- پیشنهادها ----------
  const suggestions = useMemo(() => {
    if (!sheet) return [];
    const out: Array<{ title: string; body: string; action?: { label: string; formula?: string; kind?: "ROW" | "AGG"; name?: string; filterCol?: string } }> = [];
    const prof = sheet.profile;
    // ستون‌های پرهمبستگی → شاخص ترکیبی
    for (const c of correlations.filter((x) => Math.abs(x.r) >= 0.6).slice(0, 2)) {
      out.push({
        title: `ساخت شاخص ترکیبی از «${c.a}» و «${c.b}»`,
        body: `همبستگی ${fa(c.r, 2)} نشان می‌دهد این دو ستون هم‌رفتار هستند؛ یک شاخص نسبت (مثلاً بهره‌وری) می‌سازد.`,
        action: { label: "ساخت شاخص نسبت", formula: `[${c.a}] / [${c.b}]`, kind: "ROW", name: "شاخص نسبت" },
      });
    }
    // دادهٔ گمشده
    const miss = prof.filter((p) => p.missing > 0).sort((a, b) => b.missing - a.missing)[0];
    if (miss && miss.missing > filteredRows.length * 0.1) {
      out.push({
        title: `پاکسازی «${miss.name}»`,
        body: `${faNum(miss.missing)} مقدار خالی در این ستون؛ برای تحلیل دقیق‌تر می‌توانید این ردیف‌ها را فیلتر کنید.`,
        action: { label: `فیلتر ردیف‌های خالی «${miss.name}»`, filterCol: miss.name },
      });
    }
    // ستون عددی با پراکندگی زیاد → شاخص سطح‌بندی
    const spread = prof.filter((p) => p.type === "number" && p.max !== undefined && p.min !== undefined && p.max! > 0)
      .sort((a, b) => (b.max! / Math.max(1e-9, b.min!)) - (a.max! / Math.max(1e-9, a.min!)))[0];
    if (spread && spread.max! / Math.max(1e-9, spread.min!) > 10) {
      out.push({
        title: `سطح‌بندی «${spread.name}»`,
        body: `دامنه از ${fmtNum(spread.min)} تا ${fmtNum(spread.max)} — یک شاخص دودویی برای شناسایی رکوردهای بالاتر از میانه بسازید.`,
        action: {
          label: "شاخص بالای میانه",
          formula: `IF([${spread.name}] > ${Math.round(spread.median || 0)}, 1, 0)`,
          kind: "ROW",
          name: "بالای میانه",
        },
      });
    }
    // پیشنهاد شاخص کل
    const sumCol = numCols[0];
    if (sumCol) {
      out.push({
        title: `شاخص کل برای «${sumCol}»`,
        body: "جمع، میانگین و بیشینهٔ این ستون را به‌عنوان شاخص کل روی داشبورد نگه دارید.",
        action: { label: "ساخت شاخص SUM", formula: `SUM([${sumCol}])`, kind: "AGG", name: `جمع ${sumCol}` },
      });
    }
    // دستهٔ غالب
    const cat = prof.filter((p) => p.type === "text" && p.top?.length && p.top[0].count > filteredRows.length * 0.5)[0];
    if (cat && cat.top) {
      out.push({
        title: `تمرکز روی «${cat.top[0].value}» در «${cat.name}»`,
        body: "بیش از نیمی از داده در یک دسته است — توصیه می‌شود این دسته را به‌صورت جداگانه پایش کنید.",
        action: { label: `فیلتر «${cat.top[0].value}»`, filterCol: cat.name, name: cat.top[0].value },
      });
    }
    return out;
  }, [sheet, correlations, filteredRows, numCols]);

  function applySuggestion(s: { label: string; formula?: string; kind?: "ROW" | "AGG"; name?: string; filterCol?: string }) {
    if (s.filterCol && s.formula === undefined) {
      // فیلتر ستونی: دستهٔ غالب یا غیرخالی
      const col = s.filterCol;
      const existing = filters[col];
      if (!existing) {
        if (s.name) setFilters((f) => ({ ...f, [col]: { kind: "text", values: [s.name!] } }));
        else {
          const prof = sheet?.profile.find((p) => p.name === col);
          if (prof?.top) setFilters((f) => ({ ...f, [col]: { kind: "text", values: prof.top!.slice(0, 3).map((t) => t.value) } }));
        }
      } else {
        setFilters((f) => { const n = { ...f }; delete n[col]; return n; });
      }
      toast.success(`فیلتر «${s.label}» اعمال شد`);
      return;
    }
    if (s.formula) {
      setIndName(s.name || "شاخص جدید");
      setIndFormula(s.formula);
      setIndKind(s.kind || "ROW");
      setIndDesc(s.label);
      setIndOpen(true);
    }
  }

  // ---------- خروجی CSV ----------
  function exportCsv() {
    if (!enrichedRows.length) return;
    const cols2 = enrichedColumns.map((c) => c.name);
    const header = cols2;
    const rows = enrichedRows.slice(0, 10000).map((r) => cols2.map((c) => String(r[c] ?? "")));
    const csv = "\uFEFF" + [header, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `universal-dataset-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("خروجی CSV ردیف‌های فیلترشده آماده شد");
  }

  // ---------- مرتب‌سازی جدول ----------
  const sortedRows = useMemo(() => {
    if (!sortCol) return enrichedRows;
    return [...enrichedRows].sort((a, b) => {
      const va = a[sortCol], vb = b[sortCol];
      const na = typeof va === "number" ? va : parseFloat(String(va));
      const nb = typeof vb === "number" ? vb : parseFloat(String(vb));
      if (Number.isFinite(na) && Number.isFinite(nb)) return (na - nb) * sortDir;
      return String(va ?? "").localeCompare(String(vb ?? ""), "fa") * sortDir;
    });
  }, [enrichedRows, sortCol, sortDir]);

  const PAGE_SIZE = 50;
  const pageRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));

  // ---------- رندر ----------
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  function colSelect(value: string, onChange: (v: string) => void, cols: string[], label: string) {
    return (
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">{label}</Label>
        <select
          className="h-9 rounded-md border bg-background px-2 text-xs max-w-44"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {cols.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* بارگذاری + فهرست مجموعه‌داده‌ها */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <label
              className="block border-2 border-dashed rounded-xl p-5 text-center cursor-pointer hover:bg-primary/5 hover:border-primary transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}
            >
              <input type="file" className="hidden" multiple accept=".xlsx,.xls,.csv" onChange={(e) => upload(e.target.files)} />
              {uploading ? (
                <Loader2 className="size-7 mx-auto animate-spin text-primary" />
              ) : (
                <UploadCloud className="size-7 mx-auto text-primary" />
              )}
              <p className="text-sm font-semibold mt-2">بارگذاری هر فایل اکسل</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                xlsx / xls / csv — هر ساختاری<br />
                ستون‌ها خودکار تشخیص داده می‌شوند و داشبوردها ساخته می‌شوند
              </p>
            </label>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              مجموعه‌داده‌ها
              <Badge variant="secondary">{faNum(datasets.length)} فایل</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-44 overflow-y-auto space-y-1.5">
            {datasets.map((d) => (
              <div key={d.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${selected === d.id ? "border-primary bg-primary/5" : ""}`}>
                <FileSpreadsheet className="size-4 text-emerald-600 shrink-0" />
                <button className="text-xs font-medium truncate flex-1 text-start" onClick={() => loadDetail(d.id)}>
                  {d.name}
                </button>
                <Badge variant="secondary" className="text-[10px] shrink-0">{faNum(d.nRowsTotal)} ردیف</Badge>
                {(d.sheetNames || []).length > 1 && (
                  <Badge variant="secondary" className="text-[10px] shrink-0">{faNum((d.sheetNames || []).length)} شیت</Badge>
                )}
                <Button variant="ghost" size="icon" className="size-6 text-destructive shrink-0" onClick={() => removeDataset(d.id)} title="حذف">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            {datasets.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-6">
                هنوز فایلی بارگذاری نشده — هر فایل اکسلی را بارگذاری کنید تا داشبوردها ساخته شود.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {detailLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {sheet && !detailLoading && (
        <>
          {/* انتخاب شیت + جستجو + شاخص‌ها */}
          <div className="flex flex-wrap items-center gap-2">
            {sheets.length > 1 && (
              <select className="h-9 rounded-md border bg-background px-2 text-xs" value={sheetName} onChange={(e) => { setSheetName(e.target.value); setFilters({}); setSortCol(null); setPage(0); }}>
                {sheets.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            )}
            <div className="relative">
              <Search className="size-4 absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="جستجو در همهٔ ستون‌ها…" className="ps-8 h-9 w-56" />
            </div>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setFilterCol("")}>
              <Filter className="size-3.5" /> فیلتر ستون‌ها {Object.keys(filters).length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1">{faNum(Object.keys(filters).length)}</Badge>
              )}
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setIndOpen(true)}>
              <Calculator className="size-3.5" /> ساخت شاخص
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportCsv}>
              <Download className="size-3.5" /> خروجی CSV
            </Button>
            <span className="text-xs text-muted-foreground ms-auto">
              {faNum(filteredRows.length)} ردیف فیلترشده از {faNum(sheet.rows.length)}
            </span>
          </div>

          {/* فیلترهای فعال + شاخص‌های فعال */}
          {(Object.keys(filters).length > 0 || activeRows.length > 0 || activeAgg.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {Object.entries(filters).map(([col, f]) => (
                <Badge key={col} variant="secondary" className="gap-1 text-[11px] py-1">
                  {col}: {f.kind === "text" ? `${f.values.length} مقدار` : f.kind === "num" ? `${f.min ?? "−"} تا ${f.max ?? "∞"}` : `${f.from ?? "…"} تا ${f.to ?? "…"}`}
                  <button onClick={() => setFilters((fs) => { const n = { ...fs }; delete n[col]; return n; })}>
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              {activeRows.map((nm) => (
                <Badge key={nm} variant="outline" className="gap-1 text-[11px] py-1 border-primary/40">
                  ستون محاسباتی: {nm}
                  <button onClick={() => setActiveRows((a) => a.filter((x) => x !== nm))}><X className="size-3" /></button>
                </Badge>
              ))}
              {activeAgg.map((nm) => (
                <Badge key={nm} variant="outline" className="gap-1 text-[11px] py-1 border-teal-500/40">
                  شاخص کل: {nm}
                  <button onClick={() => setActiveAgg((a) => a.filter((x) => x !== nm))}><X className="size-3" /></button>
                </Badge>
              ))}
              {(Object.keys(filters).length > 0) && (
                <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setFilters({})}>پاک کردن همهٔ فیلترها</Button>
              )}
            </div>
          )}

          {/* KPI شاخص‌های کل + آمار سریع */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {aggValues.map((a) => (
              <Card key={a.name}>
                <CardContent className="p-4">
                  <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                    <Calculator className="size-3 text-teal-600" /> {a.name}
                  </p>
                  <p className="text-lg font-bold mt-1" title={a.formula}>{fmtNum(a.value)}</p>
                  {a.error && <p className="text-[10px] text-destructive mt-0.5">{a.error}</p>}
                </CardContent>
              </Card>
            ))}
            {sheet.profile.filter((p) => p.type === "number" && p.sum !== undefined).slice(0, activeAgg.length ? 4 : 5).map((p) => (
              <Card key={p.name}>
                <CardContent className="p-4">
                  <p className="text-[11px] text-muted-foreground truncate">{p.name}</p>
                  <p className="text-lg font-bold mt-1">{fmtNum(p.sum)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">میانگین: {fmtNum(p.mean)}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* تب‌های داشبورد */}
          <div className="flex flex-wrap gap-1.5">
            {DASH_TABS.map((t) => (
              <button
                key={t.key}
                className={`px-3 h-9 rounded-xl text-xs font-medium border transition-colors ${tab === t.key ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ---------- توصیفی ---------- */}
          {tab === "desc" && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm flex items-center justify-between">
                      توزیع دسته‌بندی
                      {colSelect(catCol, setCatCol, textCols, "")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {catCol && (
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={(sheet.profile.find((p) => p.name === catCol)?.top || []).slice(0, 10).map((t) => ({ name: t.value.length > 14 ? t.value.slice(0, 14) + "…" : t.value, تعداد: t.count }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Bar dataKey="تعداد" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                    {!catCol && <p className="text-xs text-muted-foreground py-10 text-center">ستون متنی وجود ندارد</p>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm flex items-center justify-between">
                      هیستوگرام
                      {colSelect(histCol, setHistCol, enrichedNumCols, "")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {histCol && sheet.profile.find((p) => p.name === histCol)?.histogram && (
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={sheet.profile.find((p) => p.name === histCol)!.histogram!}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-25} textAnchor="end" height={60} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Bar dataKey="count" name="تعداد" fill="#10b981" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-sm">خلاصهٔ آماری ستون‌ها</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b">
                        <th className="text-start py-2 ps-2">ستون</th>
                        <th>نوع</th><th>پر</th><th>خالی</th><th>یکتا</th>
                        <th>جمع</th><th>میانگین</th><th>میانه</th><th>کمینه</th><th>بیشینه</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.profile.map((p) => (
                        <tr key={p.name} className="border-b border-muted/60 hover:bg-muted/40">
                          <td className="py-1.5 ps-2 font-medium truncate max-w-40">{p.name}</td>
                          <td className="text-center">
                            <Badge variant="secondary" className="text-[10px] px-1">
                              {p.type === "number" ? "عدد" : p.type === "date" ? "تاریخ" : "متن"}
                            </Badge>
                          </td>
                          <td className="text-center">{faNum(p.count)}</td>
                          <td className={`text-center ${p.missing > 0 ? "text-amber-600 font-semibold" : ""}`}>{faNum(p.missing)}</td>
                          <td className="text-center">{faNum(p.unique)}</td>
                          <td className="text-center">{p.sum !== undefined ? fmtNum(p.sum) : "—"}</td>
                          <td className="text-center">{p.mean !== undefined ? fmtNum(p.mean) : (p.top ? p.top[0]?.value.slice(0, 12) : "—")}</td>
                          <td className="text-center">{p.median !== undefined ? fmtNum(p.median) : "—"}</td>
                          <td className="text-center">{p.min !== undefined ? fmtNum(p.min) : "—"}</td>
                          <td className="text-center">{p.max !== undefined ? fmtNum(p.max) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ---------- تحلیلی ---------- */}
          {tab === "ana" && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm">گروه‌بندی و مقایسه</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-end gap-3">
                    {colSelect(dim, setDim, textCols, "ستون دسته‌بندی")}
                    {colSelect(measure, setMeasure, enrichedNumCols, "ستون عددی")}
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">نوع تجمیع</Label>
                      <select className="h-9 rounded-md border bg-background px-2 text-xs" value={agg} onChange={(e) => setAgg(e.target.value as typeof agg)}>
                        <option value="sum">جمع</option>
                        <option value="avg">میانگین</option>
                        <option value="count">تعداد ردیف</option>
                        <option value="min">کمینه</option>
                        <option value="max">بیشینه</option>
                      </select>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={groupData} margin={{ top: 6, right: 8, left: 0, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={70} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => fmtNum(v)} />
                      <Bar dataKey="value" name={`${agg === "sum" ? "جمع" : agg === "avg" ? "میانگین" : agg === "count" ? "تعداد" : agg === "min" ? "کمینه" : "بیشینه"} ${measure}`} radius={[6, 6, 0, 0]}>
                        {groupData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="text-sm">ماتریس همبستگی (پیرسون)</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5">
                    {correlations.length === 0 && <p className="text-xs text-muted-foreground py-6 text-center">حداقل دو ستون عددی لازم است</p>}
                    {correlations.slice(0, 10).map((c) => (
                      <div key={c.a + c.b} className="flex items-center gap-2 text-xs">
                        <span className="truncate max-w-32">{c.a}</span>
                        <span className="text-muted-foreground">×</span>
                        <span className="truncate max-w-32">{c.b}</span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{
                            width: `${Math.min(100, Math.abs(c.r) * 100)}%`,
                            backgroundColor: c.r >= 0 ? "#10b981" : "#ef4444",
                          }} />
                        </div>
                        <span className="font-bold w-12 text-center" style={{ color: c.r >= 0 ? "#10b981" : "#ef4444" }}>{fa(c.r, 2)}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm">پراکندگی (Scatter)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap gap-3">
                      {colSelect(xCol, setXCol, [...dateCols, ...enrichedNumCols].filter((c) => c !== yCol), "محور X")}
                      {colSelect(yCol, setYCol, enrichedNumCols.filter((c) => c !== xCol), "محور Y")}
                    </div>
                    {modelData && modelData.n > 2 && modelData.r2 > 0.01 && (
                      <ResponsiveContainer width="100%" height={220}>
                        <ScatterChart>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="x" type="number" tick={{ fontSize: 9 }} />
                          <YAxis dataKey="y" type="number" tick={{ fontSize: 9 }} />
                          <Tooltip />
                          <Scatter data={modelData.points.filter((p) => p.y !== null)} dataKey="y" fill="#3b82f6" />
                        </ScatterChart>
                      </ResponsiveContainer>
                    )}
                    {!modelData && <p className="text-xs text-muted-foreground py-6 text-center">دادهٔ کافی برای رسم وجود ندارد</p>}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ---------- تفسیری ---------- */}
          {tab === "interp" && (
            <div className="grid md:grid-cols-2 gap-4">
              {insights.map((ins, i) => (
                <Card key={i}>
                  <CardContent className="p-4 space-y-1.5">
                    <p className="text-sm font-bold flex items-center gap-2">
                      <Lightbulb className="size-4 text-amber-500 shrink-0" />
                      {ins.title}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{ins.body}</p>
                  </CardContent>
                </Card>
              ))}
              {insights.length === 0 && (
                <Card className="md:col-span-2">
                  <CardContent className="p-10 text-center text-sm text-muted-foreground">
                    داده‌ای برای تفسیر وجود ندارد — ابتدا فایل را بارگذاری کنید.
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* ---------- مدل‌سازی ---------- */}
          {tab === "model" && (
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">رگرسیون خطی و پیش‌بینی روند</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  {colSelect(yCol, setYCol, enrichedNumCols, "متغیر هدف (Y)")}
                  {colSelect(xCol, setXCol, [...dateCols, ...enrichedNumCols].filter((c) => c !== yCol), "متغیر توضیحی (X)")}
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">تعداد دورهٔ پیش‌بینی</Label>
                    <Input dir="ltr" inputMode="numeric" value={forecastN}
                      onChange={(e) => setForecastN(Math.min(24, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="h-9 w-20 text-xs" />
                  </div>
                </div>
                {modelData ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="rounded-xl border p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">تعداد نقاط</p>
                        <p className="text-lg font-bold">{faNum(modelData.n)}</p>
                      </div>
                      <div className="rounded-xl border p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">شیب خط (b)</p>
                        <p className="text-lg font-bold">{fa(modelData.b, 3)}</p>
                      </div>
                      <div className="rounded-xl border p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">عرض از مبدأ (a)</p>
                        <p className="text-lg font-bold">{fa(modelData.a, 2)}</p>
                      </div>
                      <div className="rounded-xl border p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">ضریب توضیح R²</p>
                        <p className="text-lg font-bold" style={{ color: modelData.r2 > 0.5 ? "#10b981" : modelData.r2 > 0.2 ? "#f59e0b" : "#ef4444" }}>
                          {fa(modelData.r2, 3)}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      مدل برازن‌شده: <span dir="ltr" className="font-bold">{yCol} = {fa(modelData.a, 2)} + {fa(modelData.b, 4)} × {xCol}</span>
                      {" "}— {modelData.r2 > 0.5
                        ? "مدل برازش خوبی دارد و برای پیش‌بینی کوتاه‌مدت قابل اتکاست."
                        : modelData.r2 > 0.2
                          ? "برازش متوسط است؛ پیش‌بینی‌ها را با احتیاط تفسیر کنید."
                          : "برازش ضعیف است؛ احتمالاً رابطهٔ خطی بین این دو متغیر وجود ندارد."}
                    </p>
                    <ResponsiveContainer width="100%" height={320}>
                      <ComposedChart data={modelData.points}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="x" type="number" tick={{ fontSize: 9 }} domain={["dataMin", "dataMax"]} />
                        <YAxis tick={{ fontSize: 9 }} />
                        <Tooltip formatter={(v: number) => (v === null ? "—" : fmtNum(v))} labelFormatter={(x) => `${xCol}: ${fa(Number(x), 2)}`} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Scatter dataKey="y" name={`${yCol} (واقعی)`} fill="#3b82f6" />
                        <Line dataKey="fit" name="خط رگرسیون + پیش‌بینی" stroke="#f97316" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground py-8 text-center">دادهٔ کافی برای مدل‌سازی وجود ندارد (حداقل ۳ ردیف با مقدار عددی در هر دو ستون)</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* ---------- پیشنهادی ---------- */}
          {tab === "sugg" && (
            <div className="grid md:grid-cols-2 gap-4">
              {suggestions.map((s, i) => (
                <Card key={i}>
                  <CardContent className="p-4 space-y-2">
                    <p className="text-sm font-bold flex items-center gap-2">
                      <Sparkles className="size-4 text-teal-600 shrink-0" />
                      {s.title}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{s.body}</p>
                    {s.action && (
                      <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => applySuggestion(s.action!)}>
                        <Wand2 className="size-3.5" /> {s.action.label}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
              {suggestions.length === 0 && (
                <Card className="md:col-span-2">
                  <CardContent className="p-10 text-center text-sm text-muted-foreground">
                    فعلاً پیشنهاد ویژه‌ای وجود ندارد — داده به‌خوبی ساختار یافته است.
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* ---------- داده‌ها ---------- */}
          {tab === "data" && (
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Table2 className="size-4" /> جدول داده (فیلترشده)</span>
                  <span className="text-[11px] font-normal text-muted-foreground">
                    صفحهٔ {faNum(page + 1)} از {faNum(pageCount)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="overflow-x-auto max-h-[480px] overflow-y-auto border rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted z-10">
                      <tr>
                        {enrichedColumns.map((c) => (
                          <th key={c.name} className="px-2 py-2 text-start whitespace-nowrap cursor-pointer hover:bg-muted-foreground/10"
                            onClick={() => {
                              if (sortCol === c.name) setSortDir((d) => (d === 1 ? -1 : 1));
                              else { setSortCol(c.name); setSortDir(1); }
                            }}>
                            <span className="flex items-center gap-1">
                              {c.name}
                              {"derived" in c && <Badge variant="secondary" className="text-[9px] px-1">شاخص</Badge>}
                              {sortCol === c.name && <ArrowUpDown className="size-3" />}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r, i) => (
                        <tr key={i} className="border-b border-muted/50 hover:bg-muted/30">
                          {enrichedColumns.map((c) => (
                            <td key={c.name} className="px-2 py-1.5 whitespace-nowrap max-w-56 truncate" title={String(r[c.name] ?? "")}>
                              {fmtCell(r[c.name])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between">
                  <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                    قبلی
                  </Button>
                  <Button size="sm" variant="outline" disabled={page >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
                    بعدی
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ---------- فیلتر ستونی ---------- */}
          <Dialog open={filterCol !== null} onOpenChange={(v) => { if (!v) setFilterCol(null); }}>
            <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto" dir="rtl">
              <DialogHeader>
                <DialogTitle>فیلتر ستون‌ها</DialogTitle>
                <DialogDescription>برای هر ستون می‌توانید مقادیر مشخص یا بازه انتخاب کنید — فیلترها روی همهٔ داشبوردها اثر می‌گذارند.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {columns.map((c) => {
                  const f = filters[c.name];
                  const prof = sheet.profile.find((p) => p.name === c.name);
                  return (
                    <div key={c.name} className="rounded-xl border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold">{c.name}</p>
                        <Badge variant="secondary" className="text-[9px]">{c.type === "number" ? "عدد" : c.type === "date" ? "تاریخ" : "متن"}</Badge>
                      </div>
                      {f && (
                        <Button size="sm" variant="ghost" className="h-6 text-[11px] text-destructive"
                          onClick={() => setFilters((fs) => { const n = { ...fs }; delete n[c.name]; return n; })}>
                          <X className="size-3" /> حذف فیلتر این ستون
                        </Button>
                      )}
                      {c.type === "text" && prof?.top && (
                        <div className="flex flex-wrap gap-1">
                          {prof.top.slice(0, 8).map((t) => {
                            const active = f?.kind === "text" && f.values.includes(t.value);
                            return (
                              <button key={t.value}
                                className={`rounded-full border px-2 py-0.5 text-[11px] ${active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
                                onClick={() => {
                                  setFilters((fs) => {
                                    const cur = fs[c.name]?.kind === "text" ? (fs[c.name] as { kind: "text"; values: string[] }).values : [];
                                    const next = active ? cur.filter((x) => x !== t.value) : [...cur, t.value];
                                    const n = { ...fs };
                                    if (next.length) n[c.name] = { kind: "text", values: next };
                                    else delete n[c.name];
                                    return n;
                                  });
                                }}>
                                {t.value.slice(0, 16)} ({faNum(t.count)})
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {c.type === "number" && prof?.min !== undefined && (
                        <div className="flex items-center gap-2">
                          <Input dir="ltr" className="h-8 text-xs" placeholder={`از ${fa(prof.min)}`}
                            defaultValue={f?.kind === "num" && f.min !== undefined ? String(f.min) : ""}
                            onBlur={(e) => {
                              const min = parseFloat(e.target.value);
                              setFilters((fs) => {
                                const n = { ...fs };
                                const cur = fs[c.name]?.kind === "num" ? fs[c.name] as { kind: "num"; min?: number; max?: number } : { kind: "num" as const };
                                const next = { ...cur, min: Number.isFinite(min) ? min : undefined };
                                if (next.min === undefined && next.max === undefined) delete n[c.name]; else n[c.name] = next;
                                return n;
                              });
                            }} />
                          <span className="text-xs text-muted-foreground">تا</span>
                          <Input dir="ltr" className="h-8 text-xs" placeholder={`تا ${fa(prof.max)}`}
                            defaultValue={f?.kind === "num" && f.max !== undefined ? String(f.max) : ""}
                            onBlur={(e) => {
                              const max = parseFloat(e.target.value);
                              setFilters((fs) => {
                                const n = { ...fs };
                                const cur = fs[c.name]?.kind === "num" ? fs[c.name] as { kind: "num"; min?: number; max?: number } : { kind: "num" as const };
                                const next = { ...cur, max: Number.isFinite(max) ? max : undefined };
                                if (next.min === undefined && next.max === undefined) delete n[c.name]; else n[c.name] = next;
                                return n;
                              });
                            }} />
                        </div>
                      )}
                      {c.type === "date" && prof?.dateMin && (
                        <div className="flex items-center gap-2">
                          <Input dir="ltr" type="date" className="h-8 text-xs" defaultValue={f?.kind === "date" && f.from ? f.from : prof.dateMin}
                            onBlur={(e) => setFilters((fs) => ({ ...fs, [c.name]: { kind: "date", from: e.target.value, to: f?.kind === "date" ? f.to : undefined } }))} />
                          <span className="text-xs text-muted-foreground">تا</span>
                          <Input dir="ltr" type="date" className="h-8 text-xs" defaultValue={f?.kind === "date" && f.to ? f.to : prof.dateMax}
                            onBlur={(e) => setFilters((fs) => ({ ...fs, [c.name]: { kind: "date", from: f?.kind === "date" ? f.from : undefined, to: e.target.value } }))} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>

          {/* ---------- ساخت شاخص + مدیریت ---------- */}
          <Dialog open={indOpen} onOpenChange={setIndOpen}>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
              <DialogHeader>
                <DialogTitle>شاخص‌ها — ساخت و مدیریت</DialogTitle>
                <DialogDescription>
                  ستون محاسباتی (ROW) برای هر ردیف ساخته می‌شود، شاخص کل (AGG) یک عدد روی همهٔ داده است.
                  ارجاع ستون با [نام ستون]. مثال: <span dir="ltr">[درآمد] - [هزینه]</span>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>نام شاخص *</Label>
                    <Input value={indName} onChange={(e) => setIndName(e.target.value)} placeholder="مثلاً حاشیه سود" />
                  </div>
                  <div className="space-y-1">
                    <Label>نوع</Label>
                    <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={indKind} onChange={(e) => setIndKind(e.target.value as "ROW" | "AGG")}>
                      <option value="ROW">ستون محاسباتی (هر ردیف)</option>
                      <option value="AGG">شاخص کل (تجمیعی)</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>فرمول *</Label>
                  <Input dir="ltr" className="text-left font-mono text-xs" value={indFormula} onChange={(e) => setIndFormula(e.target.value)}
                    placeholder={indKind === "AGG" ? "SUM([مبلغ])" : "[درآمد] / [تعداد]"} />
                  <p className="text-[10px] text-muted-foreground">
                    توابع: IF · ABS · ROUND · MIN · MAX · SQRT · POWER — تجمیعی: SUM · AVG · COUNT · MEDIAN · STD
                    {rowIndDefs.length === 0 && textCols.length > 0 && (
                      <> · ستون‌ها: <span dir="ltr">{"[" + textCols.slice(0, 2).join("] [") + "]"}</span></>
                    )}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>توضیح</Label>
                  <Input value={indDesc} onChange={(e) => setIndDesc(e.target.value)} placeholder="اختیاری" />
                </div>
                <Button className="w-full" onClick={saveIndicator} disabled={indSaving}>
                  {indSaving ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4" /> ساخت شاخص</>}
                </Button>

                <div className="border-t pt-3">
                  <p className="text-xs font-bold mb-2 flex items-center gap-1.5">
                    <Pencil className="size-3.5" /> شاخص‌های ساخته‌شده ({faNum(indicators.length)})
                  </p>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {indicators.map((ind) => (
                      <div key={ind.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">
                            {ind.name}
                            <Badge variant="secondary" className="text-[9px] ms-1 px-1">{ind.kind === "ROW" ? "ستون" : "شاخص کل"}</Badge>
                          </p>
                          <p dir="ltr" className="text-[10px] text-muted-foreground truncate text-left font-mono">{ind.formula}</p>
                        </div>
                        <button className="text-[10px] shrink-0 underline"
                          onClick={() => {
                            if (ind.kind === "ROW") setActiveRows((a) => (a.includes(ind.name) ? a : [...a, ind.name]));
                            else setActiveAgg((a) => (a.includes(ind.name) ? a : [...a, ind.name]));
                            toast.success(`«${ind.name}» روی داشبورد فعال شد`);
                          }}>
                          فعال‌سازی
                        </button>
                        <Button variant="ghost" size="icon" className="size-6 text-destructive shrink-0" onClick={() => deleteIndicator(ind.id)}>
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    ))}
                    {indicators.length === 0 && (
                      <p className="text-center text-[11px] text-muted-foreground py-3">هنوز شاخصی ساخته نشده است.</p>
                    )}
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}

      {!sheet && !detailLoading && datasets.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            هر فایل اکسل را بارگذاری کنید — ساختار فایل به‌صورت خودکار تشخیص داده می‌شود و
            داشبوردهای توصیفی، تحلیلی، تفسیری، مدل‌سازی و پیشنهادی ساخته می‌شوند.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function safeParse(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  try {
    const p = JSON.parse(String(v || "[]"));
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}
