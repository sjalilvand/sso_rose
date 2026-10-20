"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ScrollText, ShieldAlert } from "lucide-react";
import { formatDateTime, faNum } from "@/lib/jalali";

interface Log {
  id: string;
  userName: string;
  action: string;
  entity: string;
  details: string;
  ip: string;
  createdAt: string;
}

const ENTITY_LABELS: Record<string, string> = {
  auth: "احراز هویت",
  user: "کاربران",
  system: "سامانه‌ها",
  access: "دسترسی‌ها",
  announcement: "اطلاعیه‌ها",
  task: "وظایف",
  sso: "ورود یکپارچه",
};

export default function AuditPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ logs: Log[] }>("/api/audit?take=150")
      .then((d) => setLogs(d.logs))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <Card className="border-destructive/40">
          <CardContent className="py-14 text-center space-y-3">
            <ShieldAlert className="size-10 mx-auto text-destructive" />
            <p className="text-sm font-medium">{error}</p>
            <p className="text-xs text-muted-foreground">
              گزارش رویدادهای حساس فقط برای مدیر کل قابل مشاهده است.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="animate-fade-up">
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <ScrollText className="size-6 text-primary" />
          گزارش فعالیت‌های حساس
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          ثبت رویدادهای ورود، تغییر دسترسی‌ها و عملیات مدیریتی — {faNum(logs.length)} رویداد اخیر
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">رویدادها</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[65vh]">
            <div className="divide-y">
              {logs.map((l) => (
                <div key={l.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {l.action}
                      {l.details && <span className="text-muted-foreground font-normal"> — {l.details}</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      {l.userName && <span>{l.userName}</span>}
                      {l.entity && <span>· {ENTITY_LABELS[l.entity] || l.entity}</span>}
                      {l.ip && (
                        <span dir="ltr" className="font-mono">
                          · {l.ip}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 pt-0.5">
                    {formatDateTime(l.createdAt)}
                  </span>
                </div>
              ))}
              {logs.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-12">رویدادی ثبت نشده است</p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
