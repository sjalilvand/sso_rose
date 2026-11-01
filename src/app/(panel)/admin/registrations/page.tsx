"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, UserCheck, UserX, RefreshCw, ClipboardList, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { formatFullJalali } from "@/lib/jalali";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface RegistrationRequest {
  id: string;
  fullName: string;
  nationalId: string;
  mobile: string;
  province: string;
  clinic: string;
  jobTitle: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  PENDING: { label: "در انتظار تأیید", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  APPROVED: { label: "تأیید شده", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  REJECTED: { label: "رد شده", className: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30" },
};

export default function AdminRegistrationsPage() {
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [noteFor, setNoteFor] = useState<{ id: string; name: string; action: "approve" | "reject" } | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ requests: RegistrationRequest[]; counts: typeof counts }>(
        "/api/admin/registrations"
      );
      setRequests(data.requests);
      setCounts(data.counts);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در دریافت درخواست‌ها");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function review(action: "approve" | "reject", id: string, noteText: string) {
    setBusyId(id);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/admin/registrations", {
        method: "POST",
        body: JSON.stringify({ id, action, note: noteText }),
      });
      toast.success(res.message);
      setNoteFor(null);
      setNote("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "بررسی درخواست ناموفق بود");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-11 rounded-2xl bg-primary/10 flex items-center justify-center">
          <ClipboardList className="size-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">درخواست‌های ثبت‌نام</h1>
          <p className="text-sm text-muted-foreground">
            بررسی و تأیید حساب‌های جدید — ورود فقط پس از تأیید شما فعال می‌شود
          </p>
        </div>
        <Button variant="outline" size="sm" className="ms-auto" onClick={load} disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          بازخوانی
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <ClipboardList className="size-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xl font-bold leading-none">{counts.pending}</p>
              <p className="text-xs text-muted-foreground mt-1">در انتظار تأیید</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <UserCheck className="size-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xl font-bold leading-none">{counts.approved}</p>
              <p className="text-xs text-muted-foreground mt-1">تأیید شده</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-9 rounded-xl bg-rose-500/15 flex items-center justify-center">
              <UserX className="size-5 text-rose-600" />
            </div>
            <div>
              <p className="text-xl font-bold leading-none">{counts.rejected}</p>
              <p className="text-xs text-muted-foreground mt-1">رد شده</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <ShieldCheck className="size-10 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">هنوز درخواست ثبت‌نامی ثبت نشده است</p>
            </div>
          ) : (
            <div className="divide-y">
              {requests.map((r) => {
                const meta = STATUS_META[r.status] || STATUS_META.PENDING;
                const busy = busyId === r.id;
                return (
                  <div key={r.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{r.fullName}</p>
                        <Badge variant="outline" className={`text-[10px] ${meta.className}`}>
                          {meta.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-6" dir="rtl">
                        کد ملی: <span dir="ltr" className="font-mono">{r.nationalId}</span>
                        {" · "}موبایل: <span dir="ltr" className="font-mono">{r.mobile}</span>
                        {r.province && ` · ${r.province}`}
                        {r.clinic && ` · ${r.clinic}`}
                        {r.jobTitle && ` · ${r.jobTitle}`}
                      </p>
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                        درخواست: {formatFullJalali(new Date(r.createdAt))}
                        {r.reviewNote && ` — یادداشت: ${r.reviewNote}`}
                      </p>
                    </div>
                    {r.status === "PENDING" && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          disabled={busy}
                          onClick={() => review("approve", r.id, "")}
                        >
                          {busy ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />}
                          تأیید
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-rose-600 hover:text-rose-700 border-rose-200"
                          disabled={busy}
                          onClick={() => {
                            setNote("");
                            setNoteFor({ id: r.id, name: r.fullName, action: "reject" });
                          }}
                        >
                          <UserX className="size-4" />
                          رد
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!noteFor} onOpenChange={(open) => !open && setNoteFor(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>رد درخواست {noteFor?.name}</DialogTitle>
            <DialogDescription>
              دلیل رد را (اختیاری) بنویسید — این متن در سابقهٔ درخواست ثبت می‌شود و کاربر می‌تواند
              بعداً دوباره درخواست بدهد.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="مثلاً: اطلاعات هویتی ناقص است" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteFor(null)}>
              انصراف
            </Button>
            <Button
              className="bg-rose-600 hover:bg-rose-700"
              disabled={!!busyId}
              onClick={() => noteFor && review("reject", noteFor.id, note)}
            >
              {busyId ? <Loader2 className="size-4 animate-spin" /> : <UserX className="size-4" />}
              رد درخواست
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
