"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, TASK_STATUSES } from "@/lib/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/searchable-select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Users, Loader2, ListChecks, Clock, CheckCircle2, AlertTriangle, Network,
  ChevronDown, ChevronLeft, Search, X, UserCog, Crown,
} from "lucide-react";
import { toast } from "sonner";
import { faNum, formatShortJalali } from "@/lib/jalali";
import { normalizeFa } from "@/lib/ir-geo";

/**
 * زیرمجموعه‌های من — بند ۳ (فاز ۷۳ بازطراحی)
 * - نمای درختی: مدیر هر مرکز/واحد بالای گروه قرار می‌گیرد و مشاورها و همکاران
 *   زیر همان مدیر نمایش داده می‌شوند (چندسطحی).
 * - جستجو در نام/عنوان/واحد/مدیریت — هنگام جستجو فهرست سادهٔ نتایج نمایش داده می‌شود.
 * - مدیر کل می‌تواند برای هر نفر «مدیر مستقیم» تعیین کند.
 */

interface Member {
  id: string; name: string; username?: string | null; avatarColor: string; role: string;
  jobTitle: string; unit: string; status: string; lastLoginAt: string | null;
  managementId: string | null; clinic: string; province: string;
  management: { name: string } | null;
  manager: { name: string } | null;
  managerId?: string | null;
  taskStats: { total: number; open: number; done: number; overdue: number };
}

interface Task {
  id: string; title: string; description: string;
  priority: string; status: string; dueDate: string | null;
  createdAt: string;
}

interface UserOption { id: string; name: string; jobTitle: string; unit: string }

const ROLE_LABELS_LOCAL: Record<string, string> = {
  SUPER_ADMIN: "مدیر کل", UNIT_MANAGER: "مدیر واحد", THERAPIST: "درمانگر / مشاور",
  STAFF: "پذیرش و پشتیبانی", TEACHER: "مدرس", EXTERNAL: "بیرونی",
};

/** جمع آمار وظایف یک گره و همهٔ زیرمجموعه‌هایش */
function rollup(m: Member, children: Map<string, Member[]>, depth = 0): Member["taskStats"] & { people: number } {
  const acc = {
    total: m.taskStats.total, open: m.taskStats.open,
    done: m.taskStats.done, overdue: m.taskStats.overdue, people: 1,
  };
  if (depth > 20) return acc;
  for (const c of children.get(m.id) || []) {
    const s = rollup(c, children, depth + 1);
    acc.total += s.total; acc.open += s.open; acc.done += s.done;
    acc.overdue += s.overdue; acc.people += s.people;
  }
  return acc;
}

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [isGlobal, setIsGlobal] = useState(false);
  const [directCount, setDirectCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [canManageOrg, setCanManageOrg] = useState(false);

  const [tasksFor, setTasksFor] = useState<Member | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);

  // تغییر مدیر مستقیم (مدیر کل)
  const [managerFor, setManagerFor] = useState<Member | null>(null);
  const [userOptions, setUserOptions] = useState<UserOption[] | null>(null);
  const [newManagerId, setNewManagerId] = useState("");
  const [savingManager, setSavingManager] = useState(false);

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
  useEffect(() => {
    // مجوز مدیریت سازمان — از سشن
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setCanManageOrg(!!d?.permissions?.["users.manage"]))
      .catch(() => {});
  }, []);

  // ---------- ساخت درخت ----------
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const childrenMap = useMemo(() => {
    const m = new Map<string, Member[]>();
    for (const p of members) {
      if (!p.managerId || !byId.has(p.managerId)) continue;
      if (!m.has(p.managerId)) m.set(p.managerId, []);
      m.get(p.managerId)!.push(p);
    }
    return m;
  }, [members, byId]);

  /** گره‌های ریشه: کسانی که زیرمجموعه دارند (مدیرها) + افراد بدون مدیر */
  const managerRoots = useMemo(
    () => members.filter((m) => (childrenMap.get(m.id) || []).length > 0)
      .sort((a, b) => (childrenMap.get(b.id) || []).length - (childrenMap.get(a.id) || []).length),
    [members, childrenMap]
  );
  const orphans = useMemo(
    () => members.filter((m) => !m.managerId || !byId.has(m.managerId as string))
      .filter((m) => (childrenMap.get(m.id) || []).length === 0),
    [members, byId, childrenMap]
  );

  const isSearching = normalizeFa(search).trim().length > 0;
  const searchResults = useMemo(() => {
    const q = normalizeFa(search).trim();
    if (!q) return [];
    return members.filter((m) =>
      normalizeFa(`${m.name} ${m.jobTitle} ${m.unit} ${m.clinic} ${m.province} ${m.management?.name || ""} ${m.manager?.name || ""}`).includes(q)
    );
  }, [members, search]);

  function toggleCollapse(id: string) {
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

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

  async function openManagerEditor(m: Member) {
    setManagerFor(m);
    setNewManagerId(m.managerId || "");
    if (!userOptions) {
      try {
        const d = await api<{ users: UserOption[] }>("/api/users?limit=1000");
        setUserOptions(d.users);
      } catch {
        setUserOptions([]);
      }
    }
  }

  async function saveManager() {
    if (!managerFor) return;
    setSavingManager(true);
    try {
      await api("/api/team", {
        method: "PATCH",
        body: { userId: managerFor.id, managerId: newManagerId || null },
      });
      toast.success(`مدیر مستقیم «${managerFor.name}» به‌روزرسانی شد`);
      setManagerFor(null);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingManager(false);
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

  /** کارت یک نفر */
  function memberCard(m: Member, indent = 0, isManagerNode = false) {
    const kids = childrenMap.get(m.id) || [];
    return (
      <div key={m.id} style={{ marginInlineStart: indent ? `${indent * 1.25}rem` : undefined }}>
        <Card className={isManagerNode ? "border-primary/40 bg-primary/5" : ""}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              {isManagerNode && kids.length > 0 ? (
                <Button
                  variant="ghost" size="icon" className="size-7 shrink-0"
                  onClick={() => toggleCollapse(m.id)}
                  title={collapsed.has(m.id) ? "نمایش زیرمجموعه‌ها" : "بستن زیرمجموعه‌ها"}
                >
                  {collapsed.has(m.id)
                    ? <ChevronLeft className="size-4" />
                    : <ChevronDown className="size-4" />}
                </Button>
              ) : null}
              <Avatar className="size-10 shrink-0">
                <AvatarFallback className="text-white" style={{ backgroundColor: m.avatarColor }}>
                  {m.name.slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate flex items-center gap-1.5">
                  {m.name}
                  {isManagerNode && (
                    <Badge className="text-[10px] bg-primary/15 text-primary border-0 shrink-0 gap-0.5">
                      <Crown className="size-3" /> مدیر مرکز / واحد
                    </Badge>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {m.jobTitle || ROLE_LABELS_LOCAL[m.role] || "—"} · {m.management?.name || m.unit}
                  {m.clinic ? ` · ${m.clinic}` : ""}
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
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground truncate">
                {kids.length > 0
                  ? `${faNum(kids.length)} زیرمجموعهٔ مستقیم`
                  : m.manager
                    ? `مدیر مستقیم: ${m.manager.name}`
                    : "بدون مدیر مستقیم"}
              </span>
              <span className="flex items-center gap-1 shrink-0">
                {canManageOrg && (
                  <Button size="sm" variant="ghost" className="gap-1 h-8" title="تغییر مدیر مستقیم"
                    onClick={() => openManagerEditor(m)}>
                    <UserCog className="size-3.5" />
                  </Button>
                )}
                <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => openTasks(m)}>
                  <ListChecks className="size-3.5" /> وظایف
                </Button>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  /** رندر بازگشتی زیرمجموعه‌های یک مدیر */
  function renderChildren(m: Member, indent: number) {
    const kids = childrenMap.get(m.id) || [];
    if (!kids.length || collapsed.has(m.id)) return null;
    return (
      <div className="mt-3 space-y-3 border-s-2 border-dashed border-muted ps-3">
        {kids.map((k) => {
          const kIsManager = (childrenMap.get(k.id) || []).length > 0;
          return (
            <div key={k.id}>
              {memberCard(k, indent, kIsManager)}
              {kIsManager && !collapsed.has(k.id) ? null : null}
              {renderChildren(k, indent + 1)}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="animate-fade-up">
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Network className="size-6 text-primary" />
          زیرمجموعه‌های من
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isGlobal
            ? "به‌عنوان مدیر کل، کل سازمان در دسترس شماست — مدیر هر مرکز بالای گروه و مشاورها زیر همان مدیر قرار می‌گیرند."
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
              <Crown className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{faNum(managerRoots.length)}</p>
              <p className="text-xs text-muted-foreground">مدیر مراکز و واحدها</p>
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
              <p className="text-xs text-muted-foreground">وظایف در جریان</p>
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

      {/* جستجو */}
      <div className="relative">
        <Search className="size-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جستجو در نام، عنوان شغلی، مرکز، مدیریت یا نام مدیر…"
          className="ps-9 pe-9 h-11"
        />
        {search && (
          <Button
            variant="ghost" size="icon"
            className="absolute end-1.5 top-1/2 -translate-y-1/2 size-7"
            onClick={() => setSearch("")}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      {isSearching ? (
        /* ---------- نتیجهٔ جستجو: فهرست ساده ---------- */
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {searchResults.map((m) =>
            memberCard(m, 0, (childrenMap.get(m.id) || []).length > 0)
          )}
          {searchResults.length === 0 && (
            <Card className="md:col-span-2 xl:col-span-3">
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                نتیجه‌ای برای «{search}» یافت نشد.
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        /* ---------- نمای درختی: مدیر بالای گروه، مشاورها زیر او ---------- */
        <>
          <div className="space-y-6">
            {managerRoots.map((mgr) => {
              const rs = rollup(mgr, childrenMap);
              const isCollapsed = collapsed.has(mgr.id);
              return (
                <div key={mgr.id}>
                  {memberCard(mgr, 0, true)}
                  {renderChildren(mgr, 0)}
                  {!isCollapsed && (childrenMap.get(mgr.id) || []).length > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-2 ps-4">
                      جمع این گروه: {faNum(rs.people)} نفر · {faNum(rs.total)} وظیفه · {faNum(rs.overdue)} عقب‌افتاده
                    </p>
                  )}
                </div>
              );
            })}
            {managerRoots.length === 0 && (
              <Card>
                <CardContent className="p-10 text-center text-sm text-muted-foreground">
                  هنوز «مدیر مستقیم» برای کسی ثبت نشده است. مدیر سامانه می‌تواند از دکمهٔ
                  <UserCog className="size-4 inline mx-1 align-middle" />
                  برای هر نفر مدیر مستقیم تعیین کند تا ساختار درختی ساخته شود.
                </CardContent>
              </Card>
            )}
          </div>

          {/* افراد بدون مدیر مستقیم */}
          {orphans.length > 0 && (
            <div>
              <Button
                variant="outline" className="gap-2 h-9"
                onClick={() => toggleCollapse("__orphans__")}
              >
                {collapsed.has("__orphans__") ? <ChevronLeft className="size-4" /> : <ChevronDown className="size-4" />}
                بدون مدیر مستقیم
                <Badge variant="secondary" className="text-[10px]">{faNum(orphans.length)} نفر</Badge>
              </Button>
              {!collapsed.has("__orphans__") && (
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mt-3">
                  {orphans.map((m) => memberCard(m, 0, false))}
                </div>
              )}
            </div>
          )}
        </>
      )}

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

      {/* دیالوگ تغییر مدیر مستقیم */}
      <Dialog open={!!managerFor} onOpenChange={(v) => { if (!v) setManagerFor(null); }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تغییر مدیر مستقیم</DialogTitle>
            <DialogDescription>
              مدیر مستقیم «{managerFor?.name}» را انتخاب کنید — جایگاه او در درخت سازمانی
              و دامنهٔ مشاهدهٔ وظایف مدیر به‌صورت خودکار به‌روز می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <SearchableSelect
              value={newManagerId}
              onChange={setNewManagerId}
              noneLabel="— بدون مدیر مستقیم —"
              placeholder="انتخاب مدیر"
              loading={userOptions === null}
              options={(userOptions || [])
                .filter((u) => u.id !== managerFor?.id)
                .map((u) => ({ value: u.id, label: u.name, hint: u.jobTitle || u.unit }))}
            />
            <Button className="w-full" onClick={saveManager} disabled={savingManager}>
              {savingManager ? <Loader2 className="size-4 animate-spin" /> : "ذخیره"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
