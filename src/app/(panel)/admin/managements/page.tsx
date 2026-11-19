"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Network, Plus, Loader2, Pencil, Trash2, UserCog, Users, Hospital, Search,
} from "lucide-react";
import { toast } from "sonner";
import { faNum } from "@/lib/jalali";

/**
 * مدیریت‌های سازمانی — بند ۴
 * ثبت مدیریت، تعیین مدیر آن مدیریت و مشاهدهٔ کارکنان هر مدیریت
 */

interface Management {
  id: string; name: string; description: string; centerId: string | null;
  managerId: string | null; isActive: boolean;
  manager: { id: string; name: string; avatarColor: string; jobTitle: string } | null;
  center: { id: string; name: string; type: string } | null;
  members: Array<{ id: string; name: string; avatarColor: string; role: string; jobTitle: string; status: string }>;
  _count: { members: number };
}

interface SimpleUser { id: string; name: string; avatarColor: string; jobTitle: string; unit: string }
interface SimpleCenter { id: string; name: string; type: string; province: string }

export default function AdminManagementsPage() {
  const [managements, setManagements] = useState<Management[]>([]);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [centers, setCenters] = useState<SimpleCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ id: "", name: "", description: "", centerId: "", managerId: "" });
  const [deleteTarget, setDeleteTarget] = useState<Management | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, u, c] = await Promise.all([
        api<{ managements: Management[] }>("/api/admin/managements"),
        api<{ users: SimpleUser[] }>("/api/users"),
        api<{ centers: SimpleCenter[] }>("/api/admin/centers"),
      ]);
      setManagements(m.managements);
      setUsers(u.users);
      setCenters(c.centers);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = managements.filter((m) => !search.trim() || m.name.includes(search.trim()));

  async function save() {
    if (!form.name.trim()) { toast.error("نام مدیریت الزامی است"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        centerId: form.centerId || null,
        managerId: form.managerId || null,
      };
      if (form.id) {
        await api(`/api/admin/managements/${form.id}`, { method: "PATCH", body: payload });
        toast.success("مدیریت ویرایش شد");
      } else {
        await api("/api/admin/managements", { method: "POST", body: payload });
        toast.success("مدیریت جدید ثبت شد");
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    try {
      await api(`/api/admin/managements/${deleteTarget.id}`, { method: "DELETE" });
      toast.success(`مدیریت «${deleteTarget.name}» حذف شد`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
      setDeleteTarget(null);
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

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Network className="size-6 text-primary" />
            مدیریت‌های سازمانی
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ثبت مدیریت‌ها، تعیین مدیر هر مدیریت و مشاهدهٔ کارکنان هر واحد مدیریتی
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder="جستجوی مدیریت…" value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 w-44" />
          </div>
          <Button onClick={() => { setForm({ id: "", name: "", description: "", centerId: "", managerId: "" }); setFormOpen(true); }} className="gap-2">
            <Plus className="size-4" /> مدیریت جدید
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((m) => (
          <Card key={m.id} className={m.isActive ? "" : "opacity-60"}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{m.name}</p>
                  {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="size-7" title="ویرایش"
                    onClick={() => {
                      setForm({
                        id: m.id, name: m.name, description: m.description,
                        centerId: m.centerId || "", managerId: m.managerId || "",
                      });
                      setFormOpen(true);
                    }}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7 text-destructive" title="حذف"
                    onClick={() => setDeleteTarget(m)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>

              <div className="rounded-xl bg-muted/50 p-2.5 space-y-1.5">
                <p className="text-xs flex items-center gap-1.5">
                  <UserCog className="size-3.5 text-primary" />
                  مدیر مدیریت:
                  {m.manager ? (
                    <span className="font-semibold">{m.manager.name}</span>
                  ) : (
                    <span className="text-muted-foreground">تعیین نشده</span>
                  )}
                </p>
                <p className="text-xs flex items-center gap-1.5 text-muted-foreground">
                  <Hospital className="size-3.5" />
                  مرکز: {m.center ? m.center.name : "—"}
                </p>
                <p className="text-xs flex items-center gap-1.5 text-muted-foreground">
                  <Users className="size-3.5" />
                  {faNum(m._count.members)} کارکنان
                </p>
              </div>

              {m.members.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {m.members.slice(0, 8).map((u) => (
                    <span key={u.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]">
                      <span className="size-2 rounded-full" style={{ backgroundColor: u.avatarColor }} />
                      {u.name}
                    </span>
                  ))}
                  {m.members.length > 8 && (
                    <Badge variant="secondary" className="text-[10px]">+{faNum(m.members.length - 8)}</Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              مدیریتی ثبت نشده است — با «مدیریت جدید» شروع کنید.
            </CardContent>
          </Card>
        )}
      </div>

      {/* فرم مدیریت */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{form.id ? "ویرایش مدیریت" : "ثبت مدیریت جدید"}</DialogTitle>
            <DialogDescription>
              نام مدیریت را ثبت کنید، مدیر آن را تعیین کنید و در صورت نیاز به یک مرکز متصل کنید.
              مدیر انتخابی به‌صورت خودکار عضو همین مدیریت می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>نام مدیریت *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثلاً مدیریت درمان" />
            </div>
            <div className="space-y-1.5">
              <Label>توضیحات</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>مدیر این مدیریت</Label>
              <Select dir="rtl" value={form.managerId || "__none__"} onValueChange={(v) => setForm({ ...form, managerId: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="__none__">— بدون مدیر —</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}{u.jobTitle ? ` — ${u.jobTitle}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>مرکز / کلینیک مرتبط</Label>
              <Select dir="rtl" value={form.centerId || "__none__"} onValueChange={(v) => setForm({ ...form, centerId: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="__none__">— بدون مرکز —</SelectItem>
                  {centers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : form.id ? "ذخیرهٔ تغییرات" : "ثبت مدیریت"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* تأیید حذف */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف مدیریت؟</AlertDialogTitle>
            <AlertDialogDescription>
              مدیریت «{deleteTarget?.name}» حذف می‌شود. اگر کارکنانی به آن متصل باشند، حذف انجام نمی‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); doDelete(); }}
              className="bg-destructive text-white hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
