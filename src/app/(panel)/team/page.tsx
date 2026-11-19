"use client";

import { useCallback, useEffect, useState } from "react";
import { api, TASK_STATUSES } from "@/lib/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Users, Loader2, ListChecks, Clock, CheckCircle2, AlertTriangle, Network,
} from "lucide-react";
import { toast } from "sonner";
import { faNum, formatShortJalali } from "@/lib/jalali";

/**
 * زیرمجموعه‌های من — بند ۳
 * هر مدیر فهرست زیرمجموعه‌هایش (مستقیم و چندسطحی) را می‌بیند و
 * وظایف هر زیرمجموعه برای خودش است و مدیر به آن‌ها دسترسی دارد.
 */

interface Member {
  id: string; name: string; username?: string | null; avatarColor: string; role: string;
  jobTitle: string; unit: string; status: string; lastLoginAt: string | null;
  managementId: string | null; clinic: string; province: string;
  management: { name: string } | null;
  manager: { name: string } | null;
  taskStats: { total: number; open: number; done: number; overdue: number };
}

interface Task {
  id: string; title: string; description: string;
  priority: string; status: string; dueDate: string | null;
  createdAt: string;
}

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [isGlobal, setIsGlobal] = useState(false);
  const [directCount, setDirectCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [tasksFor, setTasksFor] = useState<Member | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ members: Member[]; isGlobal: boolean; directCount: number }>("/api/team");
      setMembers(data.members);
      setIsGlobal(data.isGlobal);
      setDirectCount(data.directCount);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function openTasks(m: Member) {
    setTasksFor(m);
    setTasks(null);
    setTasksLoading(true);
    try {
      const data = await api<{ tasks: Task[] }>(`/api/tasks?userId=${m.id}`);
      setTasks(data.tasks);
    } catch (err) {
      toast.error((err as Error).message);
      setTasksFor(null);
    } finally {
      setTasksLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-4">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const totals = members.reduce(
    (acc, m) => ({
      total: acc.total + m.taskStats.total,
      open: acc.open + m.taskStats.open,
      overdue: acc.overdue + m.taskStats.overdue,
    }),
    { total: 0, open: 0, overdue: 0 }
  );

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="animate-fade-up">
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Network className="size-6 text-primary" />
          زیرمجموعه‌های من
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isGlobal
            ? "به‌عنوان مدیر کل، کل سازمان در دسترس شماست — وظایف هر نفر برای خودش است."
            : `مدیر مستقیم ${faNum(directCount)} نفر هستید و ${faNum(members.length)} نفر در کل سلسله‌مراتب زیرمجموعهٔ شما هستند.`}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Users className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{faNum(members.length)}</p>
              <p className="text-xs text-muted-foreground">زیرمجموعه</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-11 rounded-xl bg-sky-600/10 text-sky-600 flex items-center justify-center">
              <ListChecks className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{faNum(totals.total)}</p>
              <p className="text-xs text-muted-foreground">وظایف زیرمجموعه‌ها</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-11 rounded-xl bg-amber-600/10 text-amber-600 flex items-center justify-center">
              <Clock className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{faNum(totals.open)}</p>
              <p className="text-xs text-muted-foreground">در جریان</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-11 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{faNum(totals.overdue)}</p>
              <p className="text-xs text-muted-foreground">عقب‌افتاده</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {members.map((m) => (
          <Card key={m.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Avatar className="size-10">
                  <AvatarFallback className="text-white" style={{ backgroundColor: m.avatarColor }}>
                    {m.name.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{m.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {m.jobTitle || "—"} · {m.management?.name || m.unit}
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {m.status === "ACTIVE" ? "فعال" : m.status === "SUSPENDED" ? "معلق" : "غیرفعال"}
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-1.5 text-center">
                <div className="rounded-lg bg-muted/60 py-1.5">
                  <p className="text-sm font-bold">{faNum(m.taskStats.total)}</p>
                  <p className="text-[10px] text-muted-foreground">کل</p>
                </div>
                <div className="rounded-lg bg-sky-50 py-1.5">
                  <p className="text-sm font-bold text-sky-700">{faNum(m.taskStats.open)}</p>
                  <p className="text-[10px] text-muted-foreground">جریان</p>
                </div>
                <div className="rounded-lg bg-emerald-50 py-1.5">
                  <p className="text-sm font-bold text-emerald-700">{faNum(m.taskStats.done)}</p>
                  <p className="text-[10px] text-muted-foreground">انجام</p>
                </div>
                <div className="rounded-lg bg-red-50 py-1.5">
                  <p className="text-sm font-bold text-red-700">{faNum(m.taskStats.overdue)}</p>
                  <p className="text-[10px] text-muted-foreground">تأخیر</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {m.manager ? `مدیر مستقیم: ${m.manager.name}` : "بدون مدیر مستقیم"}
                </span>
                <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => openTasks(m)}>
                  <ListChecks className="size-3.5" /> وظایف
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {members.length === 0 && (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              زیرمجموعه‌ای برای شما ثبت نشده است. مدیر سامانه می‌تواند از بخش «کاربران و مجوزها»
              برای هر کاربر «مدیر مستقیم» تعیین کند.
            </CardContent>
          </Card>
        )}
      </div>

      {/* دیالوگ وظایف زیرمجموعه */}
      <Dialog open={!!tasksFor} onOpenChange={(v) => { if (!v) { setTasksFor(null); setTasks(null); } }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>وظایف {tasksFor?.name}</DialogTitle>
            <DialogDescription>وظایف این زیرمجموعه — هر وظیفه متعلق به خودِ کاربر است.</DialogDescription>
          </DialogHeader>
          {tasksLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {(tasks || []).map((t) => (
                <div key={t.id} className="rounded-xl border p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{t.title}</p>
                    <Badge variant="secondary" className="text-[10px] shrink-0"
                      style={{ color: TASK_STATUSES[t.status]?.color }}>
                      {TASK_STATUSES[t.status]?.label || t.status}
                    </Badge>
                  </div>
                  {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                  <p className="text-[11px] text-muted-foreground flex items-center gap-3">
                    <span>مهلت: {t.dueDate ? formatShortJalali(t.dueDate) : "—"}</span>
                    <span>ثبت: {formatShortJalali(t.createdAt)}</span>
                  </p>
                </div>
              ))}
              {tasks && tasks.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">
                  <CheckCircle2 className="size-5 inline align-middle me-1 text-emerald-600" />
                  وظیفه‌ای برای این کاربر ثبت نشده است.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
