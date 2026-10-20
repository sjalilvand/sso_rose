"use client";

import { useEffect, useState } from "react";
import { api, PRIORITIES, TASK_STATUSES } from "@/lib/client";
import { useSession } from "@/components/providers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3,
  ListChecks,
  CheckCircle2,
  AlertTriangle,
  Users,
  Megaphone,
  CalendarDays,
  Database,
  Clock,
  Loader2,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { formatShortJalali, faNum } from "@/lib/jalali";

interface ReportData {
  taskStats: {
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    overdue: number;
    completedThisMonth: number;
  };
  userStats: {
    total: number;
    active: number;
    suspended: number;
    inactive: number;
    byRole: Record<string, number>;
    accessCount: number;
    announcementsThisMonth: number;
    announcementAckRate: number;
  } | null;
  upcomingEvents: number;
  dataSource: string;
  lastUpdated: string;
  scopeNote: string;
}

export default function ReportsPage() {
  const { permissions } = useSession();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<ReportData>("/api/reports")
      .then(setData)
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  /** خروجی CSV (قابل بازکردن در Excel) با رعایت مجوز کاربر */
  function exportCsv() {
    if (!data) return;
    const rows: string[][] = [
      ["بخش", "مورد", "تعداد"],
      ["وظایف", "کل", String(data.taskStats.total)],
      ...Object.entries(data.taskStats.byStatus).map(([k, v]) => ["وظایف", TASK_STATUSES[k]?.label || k, String(v)]),
      ...Object.entries(data.taskStats.byPriority).map(([k, v]) => ["وظایف", PRIORITIES[k]?.label || k, String(v)]),
      ["وظایف", "عقب‌افتاده", String(data.taskStats.overdue)],
      ["وظایف", "تکمیل‌شده این ماه", String(data.taskStats.completedThisMonth)],
      ["تقویم", "رویدادهای پیش‌رو", String(data.upcomingEvents)],
    ];
    if (data.userStats) {
      rows.push(["کاربران", "کل", String(data.userStats.total)]);
      rows.push(["کاربران", "فعال", String(data.userStats.active)]);
      rows.push(["دسترسی‌ها", "کل مجوزهای سامانه", String(data.userStats.accessCount)]);
      rows.push(["اطلاعیه‌ها", "انتشار این ماه", String(data.userStats.announcementsThisMonth)]);
      rows.push(["اطلاعیه‌ها", "نرخ تأیید مطالعه", `${data.userStats.announcementAckRate}%`]);
    }
    const csv = "\uFEFF" + rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rose-hub-report-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("خروجی CSV آماده شد (قابل بازکردن در Excel)");
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (!data) return null;

  const ts = data.taskStats;
  const maxStatus = Math.max(...Object.values(ts.byStatus), 1);

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="size-6 text-primary" />
            گزارش‌ها و داشبورد {data.userStats ? "مدیریتی" : "شخصی"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data.scopeNote} · گزارش بالینی و اطلاعات مراجعان از گزارش‌های عمومی تفکیک شده است.
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="size-4" /> خروجی Excel (CSV)
        </Button>
      </div>

      {/* شاخص‌های کلی */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <ListChecks className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{faNum(ts.total)}</p>
              <p className="text-xs text-muted-foreground">وظایف کل</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-11 rounded-xl bg-teal-600/10 text-teal-600 flex items-center justify-center">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{faNum(ts.completedThisMonth)}</p>
              <p className="text-xs text-muted-foreground">تکمیل‌شده این ماه</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-11 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{faNum(ts.overdue)}</p>
              <p className="text-xs text-muted-foreground">عقب‌افتاده</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-11 rounded-xl bg-amber-600/10 text-amber-600 flex items-center justify-center">
              <CalendarDays className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{faNum(data.upcomingEvents)}</p>
              <p className="text-xs text-muted-foreground">رویداد پیش‌رو</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* نمودار وضعیت وظایف */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">وظایف بر اساس وضعیت</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(ts.byStatus).map(([k, v]) => (
              <div key={k}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ backgroundColor: TASK_STATUSES[k].color }} />
                    {TASK_STATUSES[k].label}
                  </span>
                  <span className="text-muted-foreground">{faNum(v)}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(v / maxStatus) * 100}%`, backgroundColor: TASK_STATUSES[k].color }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">وظایف بر اساس اولویت</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {Object.entries(ts.byPriority).map(([k, v]) => (
              <div
                key={k}
                className="rounded-xl border p-3 text-center"
                style={{ borderColor: `${PRIORITIES[k].color}30` }}
              >
                <p className="text-2xl font-bold" style={{ color: PRIORITIES[k].color }}>
                  {faNum(v)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{PRIORITIES[k].label}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* گزارش سازمانی */}
      {data.userStats && permissions["reports.view"] && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Users className="size-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{faNum(data.userStats.active)}</p>
                  <p className="text-xs text-muted-foreground">کاربر فعال</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="size-11 rounded-xl bg-teal-600/10 text-teal-600 flex items-center justify-center">
                  <Database className="size-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{faNum(data.userStats.accessCount)}</p>
                  <p className="text-xs text-muted-foreground">مجوز سامانه‌ها</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="size-11 rounded-xl bg-amber-600/10 text-amber-600 flex items-center justify-center">
                  <Megaphone className="size-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{faNum(data.userStats.announcementsThisMonth)}</p>
                  <p className="text-xs text-muted-foreground">اطلاعیه این ماه</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <CheckCircle2 className="size-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{faNum(data.userStats.announcementAckRate)}٪</p>
                  <p className="text-xs text-muted-foreground">نرخ تأیید مطالعه</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">ترکیب کاربران بر اساس نقش</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {Object.entries(data.userStats.byRole).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-muted/50 p-3 text-center">
                  <p className="text-xl font-bold">{faNum(v)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{ROLE_LABELS_SAFE[k]}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {/* منبع داده */}
      <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
        <Database className="size-3" />
        منبع داده: {data.dataSource} · آخرین به‌روزرسانی: {formatShortJalali(data.lastUpdated)}
      </p>
    </div>
  );
}

const ROLE_LABELS_SAFE: Record<string, string> = {
  SUPER_ADMIN: "مدیر کل",
  UNIT_MANAGER: "مدیر واحد",
  THERAPIST: "درمانگر",
  STAFF: "پذیرش",
  TEACHER: "مدرس",
  EXTERNAL: "بیرونی",
};
