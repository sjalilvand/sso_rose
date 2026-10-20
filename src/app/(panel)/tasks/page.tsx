"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, PRIORITIES, TASK_STATUSES } from "@/lib/client";
import { useSession } from "@/components/providers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  ListChecks,
  Plus,
  KanbanSquare,
  Columns3,
  CheckCircle2,
  CircleDot,
  MessageSquareText,
  Loader2,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { formatShortJalali, faNum, jalaliToDate } from "@/lib/jalali";

interface T {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  assignee: { id: string; name: string; avatarColor: string; unit: string };
  creator: { name: string };
  commentCount: number;
  isOverdue: boolean;
}

interface UserLite {
  id: string;
  name: string;
  avatarColor: string;
  unit: string;
  jobTitle: string;
}

export default function TasksPage() {
  const { permissions, user } = useSession();
  const [tasks, setTasks] = useState<T[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<T | null>(null);
  const [comments, setComments] = useState<{ id: string; content: string; createdAt: string; user: { name: string; avatarColor: string } }[]>([]);
  const [newComment, setNewComment] = useState("");
  const [filterMine, setFilterMine] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);

  // فرم وظیفه جدید
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fPriority, setFPriority] = useState("MEDIUM");
  const [fAssignee, setFAssignee] = useState("");
  const [fDue, setFDue] = useState("");
  const [saving, setSaving] = useState(false);

  const canManageAll = !!permissions["tasks.manageAll"];

  const load = useCallback(async () => {
    try {
      const [t, u] = await Promise.all([
        api<{ tasks: T[] }>("/api/tasks"),
        canManageAll ? api<{ users: UserLite[] }>("/api/users") : Promise.resolve({ users: [] }),
      ]);
      setTasks(t.tasks);
      setUsers(u.users);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [canManageAll]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () => (mineOnly ? tasks.filter((t) => t.assignee.id === user?.id) : tasks),
    [tasks, mineOnly, user]
  );

  async function createTask() {
    if (!fTitle.trim()) {
      toast.error("عنوان وظیفه الزامی است");
      return;
    }
    setSaving(true);
    try {
      await api("/api/tasks", {
        method: "POST",
        body: {
          title: fTitle,
          description: fDesc,
          priority: fPriority,
          assigneeId: fAssignee || undefined,
          dueDate: fDue ? jalaliStringToDate(fDue) : undefined,
        },
      });
      toast.success("وظیفه تعریف شد");
      setCreateOpen(false);
      setFTitle("");
      setFDesc("");
      setFPriority("MEDIUM");
      setFAssignee("");
      setFDue("");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(t: T, status: string) {
    try {
      await api(`/api/tasks/${t.id}`, { method: "PATCH", body: { status } });
      await load();
      toast.success(`وضعیت به «${TASK_STATUSES[status].label}» تغییر کرد`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function openDetail(t: T) {
    setDetail(t);
    try {
      const data = await api<{ comments: typeof comments }>(`/api/tasks/${t.id}/comments`);
      setComments(data.comments);
    } catch {
      setComments([]);
    }
  }

  async function sendComment() {
    if (!newComment.trim() || !detail) return;
    try {
      await api(`/api/tasks/${detail.id}/comments`, {
        method: "POST",
        body: { content: newComment },
      });
      setNewComment("");
      const data = await api<{ comments: typeof comments }>(`/api/tasks/${detail.id}/comments`);
      setComments(data.comments);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function removeTask(t: T) {
    try {
      await api(`/api/tasks/${t.id}`, { method: "DELETE" });
      toast.success("وظیفه حذف شد");
      setDetail(null);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-4">
        <Skeleton className="h-14 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const doneCount = tasks.filter((t) => t.status === "DONE").length;
  const overdueCount = tasks.filter((t) => t.isOverdue).length;
  const kanbanColumns: { key: string; label: string; color: string }[] = [
    { key: "NEW", label: TASK_STATUSES.NEW.label, color: TASK_STATUSES.NEW.color },
    { key: "IN_PROGRESS", label: TASK_STATUSES.IN_PROGRESS.label, color: TASK_STATUSES.IN_PROGRESS.color },
    { key: "IN_REVIEW", label: TASK_STATUSES.IN_REVIEW.label, color: TASK_STATUSES.IN_REVIEW.color },
    { key: "DONE", label: TASK_STATUSES.DONE.label, color: TASK_STATUSES.DONE.color },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <ListChecks className="size-6 text-primary" />
            مدیریت وظایف
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {faNum(doneCount)} تکمیل‌شده از {faNum(tasks.length)} ·{" "}
            {overdueCount > 0 ? (
              <span className="text-destructive font-medium">{faNum(overdueCount)} عقب‌افتاده</span>
            ) : (
              "بدون عقب‌افتادگی"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={mineOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setMineOnly((v) => !v)}
          >
            فقط وظایف من
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> وظیفه جدید
          </Button>
        </div>
      </div>

      <Tabs defaultValue="list" dir="rtl">
        <TabsList>
          <TabsTrigger value="list" className="gap-1.5">
            <ListChecks className="size-4" /> فهرست
          </TabsTrigger>
          <TabsTrigger value="kanban" className="gap-1.5">
            <Columns3 className="size-4" /> برد کانبان
          </TabsTrigger>
        </TabsList>

        {/* فهرست */}
        <TabsContent value="list" className="mt-4 space-y-2">
          {visible.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                وظیفه‌ای یافت نشد
              </CardContent>
            </Card>
          )}
          {visible.map((t) => {
            const pr = PRIORITIES[t.priority];
            const st = TASK_STATUSES[t.status];
            return (
              <Card key={t.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => setStatus(t, t.status === "DONE" ? "IN_PROGRESS" : "DONE")}
                    className="shrink-0"
                    aria-label="تغییر وضعیت تکمیل"
                  >
                    {t.status === "DONE" ? (
                      <CheckCircle2 className="size-5 text-teal-600" />
                    ) : (
                      <CircleDot className="size-5 text-muted-foreground hover:text-primary transition-colors" />
                    )}
                  </button>
                  <button onClick={() => openDetail(t)} className="flex-1 min-w-52 text-right">
                    <p className={`text-sm font-medium ${t.status === "DONE" ? "line-through text-muted-foreground" : ""}`}>
                      {t.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1">
                        <span className="size-2 rounded-full" style={{ backgroundColor: t.assignee.avatarColor }} />
                        {t.assignee.name}
                      </span>
                      {t.dueDate && (
                        <span className={t.isOverdue ? "text-destructive font-medium" : ""}>
                          مهلت: {formatShortJalali(t.dueDate)}
                          {t.isOverdue ? " (عقب‌افتاده)" : ""}
                        </span>
                      )}
                      {t.commentCount > 0 && (
                        <span className="flex items-center gap-0.5">
                          <MessageSquareText className="size-3" /> {faNum(t.commentCount)}
                        </span>
                      )}
                    </p>
                  </button>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]" style={{ color: pr.color, backgroundColor: `${pr.color}15` }}>
                      {pr.label}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]" style={{ color: st.color, backgroundColor: `${st.color}15` }}>
                      {st.label}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* کانبان */}
        <TabsContent value="kanban" className="mt-4">
          <div className="grid md:grid-cols-4 gap-3">
            {kanbanColumns.map((col) => {
              const items = visible.filter((t) => t.status === col.key);
              return (
                <div key={col.key} className="rounded-2xl bg-muted/50 p-3 space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-sm font-semibold flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ backgroundColor: col.color }} />
                      {col.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{faNum(items.length)}</span>
                  </div>
                  <ScrollArea className="h-[60vh]">
                    <div className="space-y-2 pe-2">
                      {items.map((t) => {
                        const pr = PRIORITIES[t.priority];
                        return (
                          <button
                            key={t.id}
                            onClick={() => openDetail(t)}
                            className="w-full text-right rounded-xl border bg-card p-3 space-y-2 hover:shadow-sm transition-shadow"
                          >
                            <p className={`text-sm font-medium leading-6 ${t.status === "DONE" ? "line-through text-muted-foreground" : ""}`}>
                              {t.title}
                            </p>
                            <div className="flex items-center justify-between">
                              <Badge variant="secondary" className="text-[10px]" style={{ color: pr.color, backgroundColor: `${pr.color}15` }}>
                                {pr.label}
                              </Badge>
                              <div className="flex items-center gap-1.5">
                                {t.dueDate && t.isOverdue && (
                                  <AlertTriangle className="size-3.5 text-destructive" />
                                )}
                                <Avatar className="size-5">
                                  <AvatarFallback className="text-[9px] text-white" style={{ backgroundColor: t.assignee.avatarColor }}>
                                    {t.assignee.name.slice(0, 1)}
                                  </AvatarFallback>
                                </Avatar>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                      {items.length === 0 && (
                        <p className="text-center text-xs text-muted-foreground py-6">خالی</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* جزئیات وظیفه */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="leading-8">{detail.title}</DialogTitle>
                <DialogDescription>
                  مسئول: {detail.assignee.name} · تعیین‌کننده: {detail.creator.name}
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm leading-7 text-muted-foreground">{detail.description}</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-muted/60 p-3 space-y-1">
                  <p className="text-muted-foreground">اولویت</p>
                  <p className="font-semibold" style={{ color: PRIORITIES[detail.priority].color }}>
                    {PRIORITIES[detail.priority].label}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/60 p-3 space-y-1">
                  <p className="text-muted-foreground">مهلت</p>
                  <p className="font-semibold">{detail.dueDate ? formatShortJalali(detail.dueDate) : "—"}</p>
                </div>
              </div>

              {/* تغییر وضعیت */}
              {canManageAll && (
                <div className="space-y-1.5">
                  <Label className="text-xs">تغییر وضعیت</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(TASK_STATUSES).map(([key, val]) => (
                      <button
                        key={key}
                        onClick={() => setStatus(detail, key)}
                        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                          detail.status === key ? "text-white border-transparent" : "hover:bg-accent"
                        }`}
                        style={detail.status === key ? { backgroundColor: val.color } : {}}
                      >
                        {val.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* گفتگوی وظیفه */}
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1.5">
                  <MessageSquareText className="size-3.5" /> گفتگو و پیگیری
                </Label>
                <div className="max-h-44 overflow-y-auto space-y-2 rounded-xl border p-3">
                  {comments.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground py-4">گفتگویی ثبت نشده</p>
                  )}
                  {comments.map((c) => (
                    <div key={c.id} className="flex gap-2">
                      <Avatar className="size-6 shrink-0">
                        <AvatarFallback className="text-[9px] text-white" style={{ backgroundColor: c.user.avatarColor }}>
                          {c.user.name.slice(0, 1)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 rounded-lg bg-muted/60 px-3 py-1.5">
                        <p className="text-[11px] font-medium">{c.user.name}</p>
                        <p className="text-xs leading-6">{c.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="پیام خود را بنویسید…"
                    onKeyDown={(e) => e.key === "Enter" && sendComment()}
                  />
                  <Button size="sm" onClick={sendComment}>
                    ارسال
                  </Button>
                </div>
              </div>

              {(detail.creator.name && (canManageAll || detail.status)) && (
                <Button variant="destructive" size="sm" className="w-fit" onClick={() => removeTask(detail)}>
                  <Trash2 className="size-4" /> حذف وظیفه
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* وظیفه جدید */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعریف وظیفه جدید</DialogTitle>
            <DialogDescription>مسئول اصلی را مشخص کنید تا اعلان دریافت کند.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>عنوان</Label>
              <Input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="عنوان روشن کار مورد انتظار" />
            </div>
            <div className="space-y-2">
              <Label>شرح</Label>
              <Textarea rows={3} value={fDesc} onChange={(e) => setFDesc(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>اولویت</Label>
                <Select dir="rtl" value={fPriority} onValueChange={setFPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITIES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>مسئول اصلی</Label>
                <Select dir="rtl" value={fAssignee || "me"} onValueChange={setFAssignee}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="me">خودم</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} — {u.jobTitle || u.unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>مهلت انجام (شمسی)</Label>
              <Input
                dir="ltr"
                className="text-left"
                placeholder="۱۴۰۴/۰۸/۲۵ یا 1404/08/25"
                value={fDue}
                onChange={(e) => setFDue(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={createTask} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "ثبت وظیفه"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** تبدیل رشته تاریخ شمسی (۱۴۰۴/۰۸/۲۵) به Date با استفاده از تقویم جلالی */
function jalaliStringToDate(s: string): string | undefined {
  const cleaned = s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\//g, "-");
  const parts = cleaned.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return undefined;
  const [jy, jm, jd] = parts;
  return jalaliToDate({ jy, jm, jd }).toISOString();
}
