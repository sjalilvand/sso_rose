"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Network, Plus, Loader2, Pencil, Trash2, UserCog, Users, Hospital, Search,
  Building2, X, CheckSquare,
} from "lucide-react";
import { toast } from "sonner";
import { faNum } from "@/lib/jalali";
import { SearchableSelect } from "@/components/searchable-select";
import { normalizeFa } from "@/lib/ir-geo";

/**
 * مدیریت‌های سازمانی — بند ۴ + فاز ۷۴
 * ثبت مدیریت، تعیین مدیر آن، اتصال به هر تعداد مرکز/کلینیکِ فرم «مراکز و کلینیک‌ها»
 * و مشاهدهٔ کارکنان هر مدیریت
 */

interface SimpleCenter { id: string; name: string; type: string; province: string; code: string; county?: string; city?: string }

interface Management {
  id: string; name: string; description: string; centerId: string | null;
  managerId: string | null; isActive: boolean;
  manager: { id: string; name: string; avatarColor: string; jobTitle: string } | null;
  center: { id: string; name: string; type: string } | null;
  centers?: SimpleCenter[] | null;
  members: Array<{ id: string; name: string; avatarColor: string; role: string; jobTitle: string; status: string }>;
  _count: { members: number };
}

interface SimpleUser { id: string; name: string; avatarColor: string; jobTitle: string; unit: string }

const TYPE_LABELS: Record<string, string> = {
  CLINIC: "کلینیک", CENTER: "مرکز", HQ: "ستاد", EMDAD: "کمیته امداد",
};

/** انتخاب چندتایی مراکز — با جستجو، چون فهرست مراکز ممکن است بیش از ۹۰۰ رکورد باشد */
function MultiCenterSelect({
  centers, value, onChange,
}: {
  centers: SimpleCenter[];
  value: string[];
  onChange: (v: string[] ) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const query = normalizeFa(q).trim();
    if (!query) return centers.slice(0, 80);
    return centers
      .filter((c) => normalizeFa(`${c.name} ${c.province} ${c.county || ""} ${c.city || ""} ${c.code}`).includes(query))
      .slice(0, 80);
  }, [centers, q]);
  const selectedSet = useMemo(() => new Set(value), [value]);
  const filteredAllSelected = filtered.length > 0 && filtered.every((c) => selectedSet.has(c.id));

  function toggle(id: string) {
    onChange(selectedSet.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  }
  function toggleFiltered() {
    if (filteredAllSelected) onChange(value.filter((v) => !filtered.some((c) => c.id === v)));
    else onChange([...new Set([...value, ...filtered.map((c) => c.id)])]);
  }

  return (
    <div className="space-y-2 min-w-0">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی مرکز (نام، استان، شهر، کد)…"
            className="h-9 ps-8 text-xs min-w-0"
          />
        </div>
        {filtered.length > 1 && (
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 shrink-0" onClick={toggleFiltered}>
            <CheckSquare className="size-3.5" />
            {filteredAllSelected ? "حذف نتایج" : "انتخاب همهٔ نتایج"}
          </Button>
        )}
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
          {value.map((id) => {
            const c = centers.find((x) => x.id === id);
            return (
              <Badge key={id} variant="secondary" className="gap-1 text-[11px] py-1 max-w-full">
                <span className="truncate max-w-48">{c ? c.name : id}</span>
                <button type="button" onClick={() => toggle(id)}><X className="size-3" /></button>
              </Badge>
            );
          })}
          {value.length > 8 && (
            <span className="text-[11px] text-muted-foreground self-center">{faNum(value.length)} مرکز انتخاب شده</span>
          )}
        </div>
      )}
      <div className="rounded-xl border max-h-56 overflow-y-auto divide-y">
        {filtered.map((c) => {
          const active = selectedSet.has(c.id);
          return (
            <button
              type="button"
              key={c.id}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-start text-xs transition-colors ${active ? "bg-primary/5" : "hover:bg-muted"}`}
              onClick={() => toggle(c.id)}
            >
              <span
                className={`size-4 rounded border flex items-center justify-center shrink-0 ${active ? "bg-primary border-primary text-primary-foreground" : "border-input"}`}
              >
                {active && <CheckSquare className="size-3" />}
              </span>
              <span className="truncate flex-1">{c.name}</span>
              {c.province && <span className="text-[10px] text-muted-foreground shrink-0">{c.province}</span>}
              <Badge variant="outline" className="text-[9px] px-1 shrink-0">{TYPE_LABELS[c.type] || c.type}</Badge>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-[11px] text-muted-foreground py-4">مرکزی با این عبارت پیدا نشد</p>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        {faNum(value.length)} مرکز انتخاب شده از {faNum(centers.length)} مرکز ثبت‌شده
        {(q && centers.length > 80) ? " — برای دیدن نتایج بیشتر جستجو کنید" : ""}
      </p>
    </div>
  );
}

export default function AdminManagementsPage() {
  const [managements, setManagements] = useState<Management[]>([]);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [centers, setCenters] = useState<SimpleCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    id: "", name: "", description: "", centerIds: [] as string[], managerId: "", setManagerOnCenters: false,
  });
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
        centerIds: form.centerIds,
        managerId: form.managerId || null,
        setManagerOnCenters: form.setManagerOnCenters,
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

  const emptyForm = { id: "", name: "", description: "", centerIds: [] as string[], managerId: "", setManagerOnCenters: false };

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
            ثبت مدیریت‌ها، تعیین مدیر هر مدیریت، اتصال به مراکز و کلینیک‌ها و مشاهدهٔ کارکنان هر واحد مدیریتی
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder="جستجوی مدیریت…" value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 w-44" />
          </div>
          <Button onClick={() => { setForm({ ...emptyForm }); setFormOpen(true); }} className="gap-2">
            <Plus className="size-4" /> مدیریت جدید
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((m) => {
          const mCenters = m.centers || (m.center ? [{ id: m.center.id, name: m.center.name, type: m.center.type, province: "", code: "" }] : []);
          return (
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
                          centerIds: mCenters.map((c) => c.id),
                          managerId: m.managerId || "",
                          setManagerOnCenters: false,
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
                    {mCenters.length === 0 ? "مرکز متصل: —" : (
                      <span className="flex flex-wrap items-center gap-1">
                        {mCenters.slice(0, 3).map((c) => (
                          <span key={c.id} className="rounded-full bg-background border px-1.5 text-[11px]">{c.name}</span>
                        ))}
                        {mCenters.length > 3 && (
                          <Badge variant="secondary" className="text-[10px] px-1">+{faNum(mCenters.length - 3)} مرکز دیگر</Badge>
                        )}
                      </span>
                    )}
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
          );
        })}
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
        <DialogContent className="sm:max-w-xl max-h-[92dvh] overflow-y-auto overflow-x-hidden" dir="rtl">
          <DialogHeader>
            <DialogTitle>{form.id ? "ویرایش مدیریت" : "ثبت مدیریت جدید"}</DialogTitle>
            <DialogDescription>
              نام مدیریت را ثبت کنید، مدیر آن را تعیین کنید و مراکز/کلینیک‌های مرتبط (از فرم مراکز و کلینیک‌ها)
              را به آن متصل کنید. مدیر انتخابی به‌صورت خودکار عضو همین مدیریت می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 min-w-0">
            <div className="space-y-1.5 min-w-0">
              <Label>نام مدیریت *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثلاً مدیریت درمان" className="min-w-0" />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label>توضیحات</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-w-0" />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label>مدیر این مدیریت</Label>
              <SearchableSelect
                value={form.managerId}
                onChange={(v) => setForm({ ...form, managerId: v })}
                options={users.map((u) => ({ value: u.id, label: u.name, hint: u.jobTitle || undefined }))}
                noneLabel="— بدون مدیر —"
                placeholder="جستجوی کاربر…"
              />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label className="flex items-center gap-1.5">
                <Building2 className="size-3.5" />
                مراکز و کلینیک‌های مرتبط ({faNum(form.centerIds.length)} انتخاب‌شده)
              </Label>
              <MultiCenterSelect
                centers={centers}
                value={form.centerIds}
                onChange={(v) => setForm((f) => ({ ...f, centerIds: v }))}
              />
            </div>
            {form.managerId && form.centerIds.length > 0 && (
              <div className="flex items-center justify-between rounded-xl border px-3 py-2">
                <div>
                  <Label className="text-xs">ثبت مدیر به‌عنوان مدیرِ مراکز</Label>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    مدیر انتخاب‌شده در فرم مراکز و کلینیک‌ها، مدیرِ همین مراکز هم ثبت می‌شود
                  </p>
                </div>
                <Switch
                  checked={form.setManagerOnCenters}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, setManagerOnCenters: v }))}
                />
              </div>
            )}
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
