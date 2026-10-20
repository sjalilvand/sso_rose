"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { SystemIcon } from "@/components/panel/system-icon";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  Signal,
  Info,
  Loader2,
  Database,
  ArrowUpRight,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { faNum } from "@/lib/jalali";

interface Sys {
  id: string;
  name: string;
  url: string;
  description: string;
  color: string;
  icon: string;
  connectionLevel: string;
  status: string;
  hasAccess: boolean;
  metrics: { id: string; label: string; value: string }[];
}

interface SsoResult {
  launchUrl: string;
  systemName: string;
  connectionLevel: string;
  expiresAt: string;
  token: string;
}

export default function SystemsPage() {
  const searchParams = useSearchParams();
  const [systems, setSystems] = useState<Sys[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState<string | null>(null);
  const [ssoResult, setSsoResult] = useState<SsoResult | null>(null);
  const [noAccess, setNoAccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ systems: Sys[] }>("/api/systems");
      setSystems(data.systems);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // بازشدن خودکار کارت سامانه از داشبورد
  useEffect(() => {
    const id = searchParams.get("open");
    if (id && systems.length > 0 && !launching) {
      launch(id);
    }
  }, [searchParams, systems]);

  async function launch(id: string) {
    setLaunching(id);
    try {
      const data = await api<SsoResult>(`/api/systems/${id}/sso`, { method: "POST", body: {} });
      setSsoResult(data);
    } catch (err) {
      setNoAccess((err as Error).message);
    } finally {
      setLaunching(null);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="rounded-2xl border bg-card p-5 md:p-6 animate-fade-up">
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <GridIcon />
          سامانه‌های مجموعه رز سفید
        </h1>
        <p className="text-sm text-muted-foreground mt-2 leading-7">
          با ورود یکپارچه، به سامانه‌هایی که مجوز آن‌ها را دارید منتقل می‌شوید. اتصال پایه شامل
          انتقال کاربر با توکن موقت است؛ اتصال پیشرفته امکان نمایش اطلاعات و انجام عملیات از داخل
          رز هاب را فراهم می‌کند (نیازمند API سامانه مقصد).
        </p>
        <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground flex-wrap">
          <Info className="size-3.5" />
          توکن ورود یکپارچه ۵ دقیقه اعتبار دارد و هر بار ورود، در گزارش فعالیت‌ها ثبت می‌شود.
          <a
            href="/sso-docs"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <BookOpen className="size-3.5" />
            مستندات اتصال SSO برای تیم‌های فنی
          </a>
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {systems.map((s) => (
          <Card key={s.id} className="system-card overflow-hidden border-border/70">
            <div className="h-1.5 w-full" style={{ backgroundColor: s.color }} />
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <SystemIcon name={s.icon} color={s.color} className="size-11" />
                  <div>
                    <CardTitle className="text-base">{s.name}</CardTitle>
                    <CardDescription dir="ltr" className="text-[11px] text-right mt-0.5 font-mono">
                      {s.url.replace(/^https?:\/\//, "")}
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground leading-6 min-h-10">{s.description}</p>

              {/* آمار اتصال پیشرفته */}
              {s.metrics.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {s.metrics.slice(0, 2).map((m) => (
                    <div key={m.id} className="rounded-lg bg-muted/60 px-2.5 py-1.5">
                      <p className="text-[10px] text-muted-foreground">{m.label}</p>
                      <p className="text-sm font-bold" style={{ color: s.color }}>
                        {m.value}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap text-[10px]">
                <Badge variant="secondary" className="gap-1">
                  {s.connectionLevel === "ADVANCED" ? (
                    <>
                      <Database className="size-3" /> اتصال پیشرفته
                    </>
                  ) : (
                    <>
                      <ExternalLink className="size-3" /> اتصال پایه
                    </>
                  )}
                </Badge>
                <Badge
                  variant="secondary"
                  className="gap-1"
                  style={{
                    color: s.status === "متصل" ? "#0f766e" : "#d97706",
                    backgroundColor: s.status === "متصل" ? "#e0f2f1" : "#fef3c7",
                  }}
                >
                  <Signal className="size-3" /> {s.status}
                </Badge>
                {!s.hasAccess && (
                  <Badge variant="secondary" className="gap-1 text-muted-foreground">
                    <ShieldAlert className="size-3" /> بدون مجوز
                  </Badge>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  size="sm"
                  disabled={!s.hasAccess || launching === s.id}
                  onClick={() => launch(s.id)}
                >
                  {launching === s.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      ورود با رز هاب <ArrowUpRight className="size-4" />
                    </>
                  )}
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* نتیجه SSO */}
      <Dialog open={!!ssoResult} onOpenChange={(v) => !v && setSsoResult(null)}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ExternalLink className="size-5 text-primary" />
              آماده انتقال به {ssoResult?.systemName}
            </DialogTitle>
            <DialogDescription className="leading-7 pt-2">
              توکن ورود یکپارچه برای شما صادر شد. در پیاده‌سازی نهایی، سامانه مقصد این توکن را با
              استاندارد OpenID Connect / OAuth 2.0 تأیید و کاربر را بدون ورود مجدد شناسایی می‌کند.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl bg-muted/70 p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">سامانه مقصد</span>
                <span className="font-medium">{ssoResult?.systemName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">سطح اتصال</span>
                <span className="font-medium">
                  {ssoResult?.connectionLevel === "ADVANCED" ? "پیشرفته" : "پایه"}
                </span>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">توکن موقت (۵ دقیقه):</p>
                <code
                  dir="ltr"
                  className="block text-left text-[10px] bg-background rounded-lg p-2 break-all font-mono text-muted-foreground"
                >
                  {ssoResult?.token.slice(0, 80)}…
                </code>
              </div>
            </div>
            <Button className="w-full" asChild>
              <a href={ssoResult?.launchUrl} target="_blank" rel="noopener noreferrer">
                ادامه و رفتن به {ssoResult?.systemName} <ArrowUpRight className="size-4" />
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* خطای دسترسی */}
      <Dialog open={!!noAccess} onOpenChange={(v) => !v && setNoAccess(null)}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="size-5" /> دسترسی مجاز نیست
            </DialogTitle>
            <DialogDescription className="leading-7 pt-2">{noAccess}</DialogDescription>
          </DialogHeader>
          <Button variant="outline" onClick={() => setNoAccess(null)}>
            متوجه شدم
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GridIcon() {
  return <span className="inline-block size-2.5 rounded-sm bg-primary" aria-hidden />;
}
