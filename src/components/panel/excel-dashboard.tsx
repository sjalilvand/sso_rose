"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { api } from "@/lib/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  UploadCloud, FileSpreadsheet, Loader2, Trash2, TrendingUp, TrendingDown,
  Wallet, ReceiptText, Coins, Users, Activity, Lightbulb, Download, ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { faNum } from "@/lib/jalali";

/**
 * داشبورد اکسل چندماهه — بند ۷
 * بارگذاری چند فایل اکسل گزارش خدمات، و ساخت داشبورد توصیفی (KPI و جدول)،
 * تحلیلی (روند و مقایسه) و تفسیری (گزارش خودکار) — مطابق نمونهٔ داشبورد کلینیک رز.
 */

const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

interface ServiceTotals { count: number; gross: number; vat: number; net: number; part: number }
interface RecordTotals extends ServiceTotals { grossPay: number; tax: number; other: number; netPaid: number }
interface ExcelRecord {
  province: string; name: string; degree: string; license: string; rank: string;
  contract: string; stdCode: string; pcode: string;
  services: ServiceTotals[];
  totals: RecordTotals;
}
interface ExcelFileMeta {
  id: string; name: string; month: number; year: number; sheet: string;
  services: string; summary: string; nConsultants: number; createdAt: string;
}
interface FileDetail extends ExcelFileMeta {
  serviceBlocks: Array<{ name: string; code: string }>;
  records: ExcelRecord[];
  summary: { grossPay: number; tax: number; other: number; netPaid: number; gross: number; count: number };
}

const CHART_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1"];

function fa(x: number): string {
  const r = Math.round(x);
  return faNum(r.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","));
}
function fmtShort(n: number): string {
  const a = Math.abs(n || 0);
  if (a >= 1e9) return `${faNum((n / 1e9).toFixed(2))} میلیارد`;
  if (a >= 1e6) return `${faNum((n / 1e6).toFixed(1))} میلیون`;
  if (a >= 1e3) return `${faNum((n / 1e3).toFixed(1))} هزار`;
  return fa(n);
}
function monthLabel(key: number): string {
  const y = Math.floor(key / 100), m = key % 100;
  return `${MONTHS[m - 1] || "?"} ${faNum(y)}`;
}
function monthShort(key: number): string {
  const y = Math.floor(key / 100) % 100, m = key % 100;
  return `${MONTHS[m - 1] || "?"}${faNum(y)}`;
}

interface Agg { key: string; label: string; n: number; active: number; t: RecordTotals; avgPrice: number }

function sumTotals(recs: ExcelRecord[]): RecordTotals {
  const t: RecordTotals = { count: 0, gross: 0, vat: 0, net: 0, part: 0, grossPay: 0, tax: 0, other: 0, netPaid: 0 };
  for (const r of recs) {
    t.count += r.totals.count || 0; t.gross += r.totals.gross || 0; t.vat += r.totals.vat || 0;
    t.net += r.totals.net || 0; t.part += r.totals.part || 0;
    t.grossPay += r.totals.grossPay || 0; t.tax += r.totals.tax || 0;
    t.other += r.totals.other || 0; t.netPaid += r.totals.netPaid || 0;
  }
  return t;
}
function aggEntry(key: string, label: string, recs: ExcelRecord[]): Agg {
  const t = sumTotals(recs);
  return {
    key, label, n: recs.length,
    active: recs.filter((r) => r.totals.count > 0 || r.totals.gross > 0).length,
    t,
    avgPrice: t.count ? t.gross / t.count : 0,
  };
}
function groupAgg(recs: ExcelRecord[], keyFn: (r: ExcelRecord) => string, labelFn?: (k: string) => string): Agg[] {
  const m = new Map<string, ExcelRecord[]>();
  for (const r of recs) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return [...m.entries()]
    .map(([k, rs]) => aggEntry(k, labelFn ? labelFn(k) : k || "نامشخص", rs))
    .sort((a, b) => b.t.gross - a.t.gross);
}

export function ExcelDashboard() {
  const [files, setFiles] = useState<ExcelFileMeta[]>([]);
  const [details, setDetails] = useState<FileDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [fYear, setFYear] = useState("all");
  const [fMonth, setFMonth] = useState("all");
  const [search, setSearch] = useState("");
  const [fProvince, setFProvince] = useState("all");

  const load = useCallback(async () => {
    try {
      const data = await api<{ files: ExcelFileMeta[] }>("/api/reports/excel");
      setFiles(data.files);
      const dts = await Promise.all(
        data.files.map(async (f) => {
          try {
            const d = await api<{ file: Omit<FileDetail, "serviceBlocks"> & { services: unknown } }>(`/api/reports/excel/${f.id}`);
            return {
              ...f,
              serviceBlocks: (d.file.services as Array<{ name: string; code: string }>) || [],
              records: (d.file.records as ExcelRecord[]) || [],
              summary: d.file.summary,
            };
          } catch {
            return null;
          }
        })
      );
      setDetails(dts.filter(Boolean) as FileDetail[]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ---------- بارگذاری چند فایل ----------
  async function upload(fileList: FileList | null) {
    const list = Array.from(fileList || []).filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
    if (!list.length) { toast.error("فرمت فایل پشتیبانی نمی‌شود (xlsx / xls / csv)"); return; }
    setUploading(true);
    try {
      for (const f of list) {
        const form = new FormData();
        form.append("files", f);
        await api("/api/reports/excel", { method: "POST", body: form });
      }
      toast.success(`${faNum(list.length)} فایل پردازش شد — ماه تکراری با فایل جدید جایگزین شد`);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(id: string) {
    try {
      await api(`/api/reports/excel/${id}`, { method: "DELETE" });
      toast.success("فایل گزارش حذف شد");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  // ---------- دادهٔ فیلترشده ----------
  const scopedDetails = useMemo(
    () => details.filter((d) => {
      if (fYear !== "all" && d.year !== +fYear) return false;
      if (fMonth !== "all" && d.month !== +fMonth) return false;
      return true;
    }),
    [details, fYear, fMonth]
  );

  const allRecords = useMemo(
    () => scopedDetails.flatMap((d) => d.records.map((r) => ({ ...r }))),
    [scopedDetails]
  );

  const years = useMemo(() => [...new Set(details.map((d) => d.year).filter((y) => y > 0))].sort((a, b) => a - b), [details]);
  const provinces = useMemo(
    () => [...new Set(allRecords.map((r) => r.province).filter(Boolean))].sort(),
    [allRecords]
  );

  // ---------- تجمیع‌ها ----------
  const grand = useMemo(() => sumTotals(allRecords), [allRecords]);
  const monthsAgg = useMemo(() => {
    const m = new Map<number, ExcelRecord[]>();
    for (const d of scopedDetails) {
      const key = d.year * 100 + d.month;
      if (!key) continue;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(...d.records);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, rs]) => ({
      key: k, label: monthShort(k),
      ...aggEntry(String(k), monthLabel(k), rs),
    }));
  }, [scopedDetails]);

  const provinceAgg = useMemo(
    () => groupAgg(allRecords, (r) => r.province || "نامشخص").slice(0, 12),
    [allRecords]
  );
  const degreeAgg = useMemo(() => groupAgg(allRecords, (r) => r.degree || "نامشخص"), [allRecords]);
  const rankAgg = useMemo(() => groupAgg(allRecords, (r) => r.rank || "نامشخص"), [allRecords]);

  const serviceBlocks = useMemo(() => {
    const d = [...scopedDetails].sort((a, b) => b.serviceBlocks.length - a.serviceBlocks.length)[0];
    return d?.serviceBlocks || [];
  }, [scopedDetails]);

  const servicesAgg = useMemo(() => {
    const out: Array<{ name: string; count: number; gross: number }> = [];
    for (const d of scopedDetails) {
      for (const r of d.records) {
        (r.services || []).forEach((s, i) => {
          const name = d.serviceBlocks[i]?.name || serviceBlocks[i]?.name || `خدمت ${i + 1}`;
          const cur = (out[i] ||= { name, count: 0, gross: 0 });
          cur.count += s.count || 0;
          cur.gross += s.gross || 0;
        });
      }
    }
    return out.filter((s) => s.gross > 0 || s.count > 0).sort((a, b) => b.gross - a.gross);
  }, [scopedDetails, serviceBlocks]);

  const personAgg = useMemo(() => {
    const m = new Map<string, ExcelRecord[]>();
    for (const r of allRecords) {
      const k = r.pcode ? `p:${r.pcode}` : `n:${r.name}|${r.province}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return [...m.entries()]
      .map(([k, rs]) => {
        const e = aggEntry(k, rs[0].name || `کد ${rs[0].pcode}`, rs);
        return { ...e, province: rs[0].province, degree: rs[0].degree, rank: rs[0].rank };
      })
      .sort((a, b) => b.t.gross - a.t.gross);
  }, [allRecords]);

  const filteredRecords = useMemo(
    () => allRecords.filter((r) =>
      (fProvince === "all" || r.province === fProvince) &&
      (!search.trim() ||
        r.name.includes(search.trim()) ||
        r.province.includes(search.trim()) ||
        r.pcode.includes(search.trim()) ||
        r.contract.includes(search.trim()))
    ),
    [allRecords, search, fProvince]
  );

  const trendData = monthsAgg.map((m) => ({
    name: m.label,
    درآمد: Math.round(m.t.gross / 1e6),
    پرداختی: Math.round(m.t.grossPay / 1e6),
    خالص: Math.round(m.t.netPaid / 1e6),
  }));

  const lastMonth = monthsAgg[monthsAgg.length - 1];
  const prevMonth = monthsAgg[monthsAgg.length - 2];
  const growth = lastMonth && prevMonth && prevMonth.t.gross > 0
    ? ((lastMonth.t.gross - prevMonth.t.gross) / prevMonth.t.gross) * 100
    : null;

  // ---------- خروجی CSV ----------
  function exportCsv() {
    const header = ["استان", "نام", "مدرک", "رتبه", "قرارداد", "کد تفضیلی", "تعداد جلسات", "درآمد خدمات", "ناخالص پرداختی", "مالیات", "سایر کسور", "خالص پرداختی"];
    const rows = filteredRecords.map((r) => [
      r.province, r.name, r.degree, r.rank, r.contract, r.pcode,
      String(r.totals.count), String(r.totals.gross), String(r.totals.grossPay),
      String(r.totals.tax), String(r.totals.other), String(r.totals.netPaid),
    ]);
    const csv = "\uFEFF" + [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rose-excel-dashboard-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("خروجی CSV آماده شد");
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* بارگذاری و فهرست فایل‌ها */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardContent className="p-4">
            <label
              className="block border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:bg-primary/5 hover:border-primary transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}
            >
              <input
                type="file" className="hidden" multiple accept=".xlsx,.xls,.csv"
                onChange={(e) => upload(e.target.files)}
              />
              {uploading ? (
                <Loader2 className="size-8 mx-auto animate-spin text-primary" />
              ) : (
                <UploadCloud className="size-8 mx-auto text-primary" />
              )}
              <p className="text-sm font-semibold mt-2">بارگذاری فایل‌های اکسل گزارش</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                چند فایل هم‌زمان — xlsx / xls / csv<br />
                ماه و سال از نام فایل تشخیص داده می‌شود<br />
                (مثال: «خدمات آزاد شهریور 1405 کلی.xlsx»)
              </p>
            </label>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              فایل‌های بارگذاری‌شده
              <Badge variant="secondary">{faNum(files.length)} فایل</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-40 overflow-y-auto space-y-1.5">
            {files.map((f) => (
              <div key={f.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
                <FileSpreadsheet className="size-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-medium truncate flex-1">{f.name}</span>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {f.month ? `${MONTHS[f.month - 1]} ${faNum(f.year)}` : "بدون دوره"}
                </Badge>
                <span className="text-[10px] text-muted-foreground shrink-0">{faNum(f.nConsultants)} مشاور</span>
                <Button variant="ghost" size="icon" className="size-6 text-destructive shrink-0"
                  onClick={() => removeFile(f.id)} title="حذف">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            {files.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-6">
                هنوز فایلی بارگذاری نشده — فایل نمونهٔ گزارش خدمات آزاد را بارگذاری کنید.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {allRecords.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            داشبورد پس از بارگذاری فایل اکسل به‌صورت خودکار ساخته می‌شود — توصیفی، تحلیلی و تفسیری.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* فیلتر دوره */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">دوره:</span>
            <select className="h-8 rounded-md border bg-background px-2 text-xs" value={fYear} onChange={(e) => setFYear(e.target.value)}>
              <option value="all">همه سال‌ها</option>
              {years.map((y) => <option key={y} value={y}>{faNum(y)}</option>)}
            </select>
            <select className="h-8 rounded-md border bg-background px-2 text-xs" value={fMonth} onChange={(e) => setFMonth(e.target.value)}>
              <option value="all">همه ماه‌ها</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1"
              onClick={() => { setFYear("all"); setFMonth("all"); }}>
              پاک کردن فیلتر
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1 ms-auto" onClick={exportCsv}>
              <Download className="size-3.5" /> خروجی CSV
            </Button>
          </div>

          {/* ---------- توصیفی: KPI ---------- */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {[
              { icon: Wallet, label: "درآمد خدمات (ناخالص)", value: fmtShort(grand.gross), color: "#10b981" },
              { icon: Coins, label: "ناخالص پرداختی به مشاوران", value: fmtShort(grand.grossPay), color: "#3b82f6" },
              { icon: ReceiptText, label: "مالیات و کسور", value: fmtShort(grand.tax + grand.other), color: "#ef4444" },
              { icon: Activity, label: "خالص پرداختی", value: fmtShort(grand.netPaid), color: "#8b5cf6" },
              { icon: ListChecks, label: "کل جلسات", value: fa(grand.count), color: "#f59e0b" },
              { icon: Users, label: "مشاوران فعال", value: faNum(personAgg.filter((p) => p.active > 0).length), color: "#ec4899" },
            ].map((k, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <k.icon className="size-5 mb-2" style={{ color: k.color }} />
                  <p className="text-lg font-bold leading-tight">{k.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{k.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ---------- تحلیلی: روند و مقایسه ---------- */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm">روند درآمد و پرداختی در طول زمان (میلیون تومان)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={trendData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => fa(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="درآمد" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="پرداختی" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="خالص" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 3" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm">درآمد به تفکیک استان (میلیون تومان)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={provinceAgg.map((p) => ({ name: p.label, درآمد: Math.round(p.t.gross / 1e6) }))}
                    margin={{ top: 6, right: 8, left: 0, bottom: 0 }} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                    <Tooltip formatter={(v: number) => `${fa(v)} میلیون`} />
                    <Bar dataKey="درآمد" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm">سهم خدمات از کل درآمد</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={servicesAgg.slice(0, 10).map((s) => ({ name: s.name, value: Math.round(s.gross) }))}
                      dataKey="value" nameKey="name" innerRadius={55} outerRadius={95}
                      label={(d: { name?: string; percent?: number }) =>
                        `${(d.name || "").slice(0, 12)} ${(100 * (d.percent || 0)).toFixed(0)}٪`}
                      labelLine={false}
                    >
                      {servicesAgg.slice(0, 10).map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmtShort(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm">تعداد جلسات به تفکیک خدمت</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={servicesAgg.slice(0, 10).map((s) => ({ name: s.name.slice(0, 14), جلسات: s.count }))}
                    margin={{ top: 6, right: 8, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => fa(v)} />
                    <Bar dataKey="جلسات" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* ---------- تفسیری: گزارش خودکار ---------- */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Lightbulb className="size-4 text-amber-500" />
                تفسیر و گزارش خودکار (تحلیل توصیفی، تحلیلی و تفسیری)
              </CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3 text-[13px] leading-7">
              <div className="rounded-xl border-r-4 p-3 bg-muted/40" style={{ borderColor: "#10b981" }}>
                <p className="font-bold mb-1">۱) توصیف دوره</p>
                <p>
                  در {faNum(monthsAgg.length)} دورهٔ ثبت‌شده، {faNum(personAgg.length)} مشاور شامل گزارش شده‌اند؛
                  مجموع درآمد خدمات {fmtShort(grand.gross)} تومان و ناخالص پرداختی {fmtShort(grand.grossPay)} تومان است.
                  میانگین ارزش هر جلسه {fmtShort(grand.count ? grand.gross / grand.count : 0)} تومان محاسبه می‌شود
                  و در کل {fa(grand.count)} جلسهٔ خدمت ارائه شده است.
                </p>
              </div>
              <div className="rounded-xl border-r-4 p-3 bg-muted/40" style={{ borderColor: "#3b82f6" }}>
                <p className="font-bold mb-1 flex items-center gap-2">
                  ۲) تحلیل روند
                  {growth !== null && (
                    <Badge variant="secondary" className="text-[11px] gap-1"
                      style={{ color: growth >= 0 ? "#166534" : "#991b1b", backgroundColor: growth >= 0 ? "#dcfce7" : "#fee2e2" }}>
                      {growth >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                      {faNum(Math.abs(growth).toFixed(1))}٪ نسبت به دورهٔ قبل
                    </Badge>
                  )}
                </p>
                <p>
                  {lastMonth && prevMonth ? (
                    <>
                      درآمد «{lastMonth.label}» برابر {fmtShort(lastMonth.t.gross)} تومان و دورهٔ قبل آن
                      «{prevMonth.label}» {fmtShort(prevMonth.t.gross)} تومان بوده است
                      {growth !== null && (growth >= 0 ? " — روند صعودی مشاهده می‌شود." : " — افت درآمد نیازمند بررسی است.")}
                    </>
                  ) : (
                    "برای تحلیل روند، حداقل دو دورهٔ متوالی را بارگذاری کنید."
                  )}
                </p>
              </div>
              <div className="rounded-xl border-r-4 p-3 bg-muted/40" style={{ borderColor: "#f59e0b" }}>
                <p className="font-bold mb-1">۳) تمرکز جغرافیایی و خدماتی</p>
                {provinceAgg[0] && (
                  <p>
                    پردرآمدترین استان «{provinceAgg[0].label}» با سهم {faNum(((provinceAgg[0].t.gross / (grand.gross || 1)) * 100).toFixed(1))}٪
                    از کل درآمد است
                    {provinceAgg[0].t.gross / (grand.gross || 1) > 0.4 && " — تمرکز بالای درآمد در یک استان ریسک ایجاد می‌کند."}
                    {servicesAgg[0] && (
                      <>
                        {" "}خدمت اصلی نیز «{servicesAgg[0].name}» با سهم {faNum(((servicesAgg[0].gross / (grand.gross || 1)) * 100).toFixed(1))}٪ است.
                      </>
                    )}
                  </p>
                )}
              </div>
              <div className="rounded-xl border-r-4 p-3 bg-muted/40" style={{ borderColor: "#ec4899" }}>
                <p className="font-bold mb-1">۴) مشاوران برتر</p>
                {personAgg[0] && (
                  <p>
                    «{personAgg[0].label}» ({personAgg[0].province}) با {fmtShort(personAgg[0].t.gross)} تومان در صدر است
                    و {faNum(personAgg.filter((p) => p.t.gross / (grand.gross || 1) > 0.1).length)} نفر بیش از ۱۰٪ کل درآمد را دارند
                    {" — "}{faNum(personAgg.filter((p) => p.active === 0).length)} نفر بدون فعالیت ثبت‌شده هستند.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* برترین مشاوران + توزیع مدرک/رتبه */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm">۱۰ مشاور برتر بر اساس درآمد (میلیون تومان)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={personAgg.slice(0, 10).map((p) => ({ name: p.label.slice(0, 18), درآمد: Math.round(p.t.gross / 1e6) }))}
                    margin={{ top: 6, right: 8, left: 0, bottom: 60 }} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={120} />
                    <Tooltip formatter={(v: number) => `${fa(v)} میلیون`} />
                    <Bar dataKey="درآمد" fill="#ec4899" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm">توزیع مدرک تحصیلی و رتبهٔ حرفه‌ای</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie data={degreeAgg.map((d) => ({ name: d.label, value: d.n }))}
                      dataKey="value" nameKey="name" outerRadius={52} label={(d: { name?: string }) => d.name || ""} labelLine={false}>
                      {degreeAgg.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => `${fa(v)} نفر`} />
                  </PieChart>
                </ResponsiveContainer>
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie data={rankAgg.map((d) => ({ name: d.label, value: d.n }))}
                      dataKey="value" nameKey="name" outerRadius={52} label={(d: { name?: string }) => d.name || ""} labelLine={false}>
                      {rankAgg.map((_, i) => <Cell key={i + 5} fill={CHART_COLORS[(i + 5) % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => `${fa(v)} نفر`} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* جدول داده‌ها */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                داده‌های تفصیلی
                <span className="text-xs font-normal text-muted-foreground">
                  {faNum(filteredRecords.length)} رکورد از {faNum(allRecords.length)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input placeholder="جستجوی نام، کد ملی، قرارداد…" value={search}
                  onChange={(e) => setSearch(e.target.value)} className="w-56 h-8 text-xs" />
                <select className="h-8 rounded-md border bg-background px-2 text-xs" value={fProvince}
                  onChange={(e) => setFProvince(e.target.value)}>
                  <option value="all">همه استان‌ها</option>
                  {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="overflow-x-auto rounded-xl border max-h-80 overflow-y-auto">
                <table className="w-full text-xs" dir="rtl">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      {["استان", "نام", "مدرک", "رتبه", "قرارداد", "جلسات", "درآمد خدمات", "ناخالص", "مالیات", "خالص پرداختی"].map((h) => (
                        <th key={h} className="px-2 py-2 text-center font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.slice(0, 200).map((r, i) => (
                      <tr key={i} className="border-t hover:bg-muted/40">
                        <td className="px-2 py-1.5 text-center whitespace-nowrap">{r.province}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{r.name}</td>
                        <td className="px-2 py-1.5 text-center whitespace-nowrap">{r.degree || "—"}</td>
                        <td className="px-2 py-1.5 text-center whitespace-nowrap">{r.rank || "—"}</td>
                        <td className="px-2 py-1.5 text-center whitespace-nowrap" dir="ltr">{r.contract}</td>
                        <td className="px-2 py-1.5 text-center">{fa(r.totals.count)}</td>
                        <td className="px-2 py-1.5 text-center">{fmtShort(r.totals.gross)}</td>
                        <td className="px-2 py-1.5 text-center">{fmtShort(r.totals.grossPay)}</td>
                        <td className="px-2 py-1.5 text-center">{fmtShort(r.totals.tax)}</td>
                        <td className="px-2 py-1.5 text-center">{fmtShort(r.totals.netPaid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredRecords.length > 200 && (
                <p className="text-[11px] text-muted-foreground text-center">
                  نمایش ۲۰۰ رکورد اول — خروجی CSV شامل همهٔ {faNum(filteredRecords.length)} رکورد است.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
