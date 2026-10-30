"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { SystemIcon } from "@/components/panel/system-icon";
import { ROLE_LABELS, ROLE_COLORS, UNITS } from "@/lib/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  Plus,
  MoreHorizontal,
  ShieldCheck,
  ShieldOff,
  Pencil,
  KeyRound,
  Loader2,
  Search,
  Trash2,
  UserX,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { formatShortJalali, faNum } from "@/lib/jalali";

interface U {
  id: string;
  email: string;
  username?: string | null; // کد ملی — نام کاربری ورود
  name: string;
  role: string;
  unit: string;
  jobTitle: string;
  phone: string;
  province?: string;
  education?: string;
  workLicense?: string;
  profRank?: string;
  contractNo?: string;
  provinceCode?: string;
  personalCode?: string;
  bankSheba?: string;
  avatarColor: string;
  status: string;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  systemIds?: string[];
}

interface ImportRowT {
  row: number;
  province: string;
  name: string;
  education: string;
  workLicense: string;
  profRank: string;
  contractNo: string;
  provinceCode: string;
  personalCode: string;
  bankSheba: string;
  nationalId: string;
  phone: string;
  nidValid: boolean;
  action: "create" | "update";
  error?: string;
}

interface ImportSummary {
  total: number;
  create: number;
  update: number;
  error: number;
}

interface CommitResult {
  created: number;
  updated: number;
  failed: Array<{ row: number; name: string; reason: string }>;
  total: number;
  fileName: string;
}

/** ارسال FormData (برای آپلود فایل اکسل) با مدیریت خطای فارسی */
async function apiForm<T = unknown>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: "POST", body: form, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || "خطا در ارتباط با سرور");
  }
  return data as T;
}

interface Sys {
  id: string;
  name: string;
  color: string;
  icon: string;
  connectionLevel: string;
  url: string;
  description: string;
  status: string;
}

const AVATAR_COLORS = ["#9c27b0", "#0f766e", "#c2185b", "#d97706", "#0369a1", "#7c3aed", "#6366f1", "#dc2626"];

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "فعال",
  SUSPENDED: "معلق",
  INACTIVE: "غیرفعال",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<U[]>([]);
  const [systems, setSystems] = useState<Sys[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // دیالوگ ویرایش کامل
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<U | null>(null);
  const [eName, setEName] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eTitle, setETitle] = useState("");
  const [eRole, setERole] = useState("STAFF");
  const [eUnit, setEUnit] = useState("پذیرش");
  const [eStatus, setEStatus] = useState("ACTIVE");
  const [eColor, setEColor] = useState(AVATAR_COLORS[2]);
  const [ePass, setEPass] = useState("");
  const [eSystems, setESystems] = useState<string[]>([]);
  // مشخصات پرونده (مطابق فایل مشاورین)
  const [eNid, setENid] = useState("");
  const [eProvince, setEProvince] = useState("");
  const [eEdu, setEEdu] = useState("");
  const [eLicense, setELicense] = useState("");
  const [eRank, setERank] = useState("");
  const [eContract, setEContract] = useState("");
  const [eProvCode, setEProvCode] = useState("");
  const [ePersonal, setEPersonal] = useState("");
  const [eSheba, setESheba] = useState("");

  // دیالوگ کاربر جدید
  const [createOpen, setCreateOpen] = useState(false);
  const [fName, setFName] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fNid, setFNid] = useState("");
  const [fPass, setFPass] = useState("");
  const [fRole, setFRole] = useState("STAFF");
  const [fUnit, setFUnit] = useState("پذیرش");
  const [fTitle, setFTitle] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fColor, setFColor] = useState(AVATAR_COLORS[2]);
  const [fSystems, setFSystems] = useState<string[]>([]);

  // ورود گروهی از فایل اکسل
  const [importOpen, setImportOpen] = useState(false);
  const [impPhase, setImpPhase] = useState<"pick" | "preview" | "done">("pick");
  const [impFile, setImpFile] = useState<File | null>(null);
  const [impRows, setImpRows] = useState<ImportRowT[]>([]);
  const [impSummary, setImpSummary] = useState<ImportSummary | null>(null);
  const [impRole, setImpRole] = useState("THERAPIST");
  const [impUnit, setImpUnit] = useState("درمان");
  const [impTitle, setImpTitle] = useState("مشاور");
  const [impReset, setImpReset] = useState(true);
  const [impSystems, setImpSystems] = useState<string[]>([]);
  const [impResult, setImpResult] = useState<CommitResult | null>(null);
  const [impBusy, setImpBusy] = useState(false);

  // تأیید حذف کامل
  const [deleteTarget, setDeleteTarget] = useState<U | null>(null);

  const load = useCallback(async () => {
    try {
      const [u, s] = await Promise.all([
        api<{ users: U[] }>("/api/users?withAccess=1"),
        api<{ systems: Sys[] }>("/api/systems"),
      ]);
      setUsers(u.users);
      setSystems(s.systems);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () =>
      users.filter(
        (u) =>
          !search ||
          u.name.includes(search) ||
          u.email.includes(search) ||
          u.unit.includes(search) ||
          (u.phone || "").includes(search) ||
          (u.username || "").includes(search)
      ),
    [users, search]
  );

  // ---------- ایجاد ----------
  async function createUser() {
    if (!fName.trim() || !fEmail.trim() || fPass.length < 8) {
      toast.error("نام، ایمیل و رمز عبور (حداقل ۸ نویسه) الزامی است");
      return;
    }
    setSaving(true);
    try {
      await api("/api/users", {
        method: "POST",
        body: {
          name: fName,
          email: fEmail,
          username: fNid,
          password: fPass,
          role: fRole,
          unit: fUnit,
          jobTitle: fTitle,
          phone: fPhone,
          avatarColor: fColor,
          systemIds: fSystems,
        },
      });
      toast.success("کاربر جدید ایجاد شد");
      setCreateOpen(false);
      setFName("");
      setFEmail("");
      setFNid("");
      setFPass("");
      setFTitle("");
      setFPhone("");
      setFSystems([]);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ---------- ویرایش کامل ----------
  function openEdit(u: U) {
    setEditing(u);
    setEName(u.name);
    setEEmail(u.email);
    setEPhone(u.phone || "");
    setETitle(u.jobTitle || "");
    setERole(u.role);
    setEUnit(u.unit || "عمومی");
    setEStatus(u.status);
    setEColor(u.avatarColor || AVATAR_COLORS[2]);
    setEPass("");
    setESystems(u.systemIds || []);
    setENid(u.username || "");
    setEProvince(u.province || "");
    setEEdu(u.education || "");
    setELicense(u.workLicense || "");
    setERank(u.profRank || "");
    setEContract(u.contractNo || "");
    setEProvCode(u.provinceCode || "");
    setEPersonal(u.personalCode || "");
    setESheba(u.bankSheba || "");
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editing) return;
    if (!eName.trim() || !eEmail.trim()) {
      toast.error("نام و ایمیل الزامی است");
      return;
    }
    if (ePass && ePass.length < 8) {
      toast.error("رمز عبور باید حداقل ۸ نویسه باشد");
      return;
    }
    setSaving(true);
    try {
      await api(`/api/users/${editing.id}`, {
        method: "PATCH",
        body: {
          name: eName,
          email: eEmail,
          username: eNid,
          phone: ePhone,
          jobTitle: eTitle,
          role: eRole,
          unit: eUnit,
          status: eStatus,
          avatarColor: eColor,
          systemIds: eSystems,
          province: eProvince,
          education: eEdu,
          workLicense: eLicense,
          profRank: eRank,
          contractNo: eContract,
          provinceCode: eProvCode,
          personalCode: ePersonal,
          bankSheba: eSheba,
          ...(ePass ? { password: ePass } : {}),
        },
      });
      toast.success("تغییرات کاربر ذخیره شد");
      setEditOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ---------- سایر عملیات ----------
  async function toggleStatus(u: U) {
    const next = u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", body: { status: next } });
      toast.success(next === "ACTIVE" ? "حساب فعال شد" : "حساب به حالت تعلیق درآمد");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function resetPassword(u: U) {
    const newPass = `rose-${Math.floor(100000 + Math.random() * 900000)}`;
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", body: { password: newPass } });
      toast.success(`رمز جدید: ${newPass} — به کاربر اعلام کنید`, { duration: 10000 });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function deactivate(u: U) {
    try {
      await api(`/api/users/${u.id}`, { method: "DELETE" });
      toast.success("کاربر غیرفعال شد (سوابق حفظ شد)");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function hardDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await api(`/api/users/${deleteTarget.id}?hard=1`, { method: "DELETE" });
      toast.success(`کاربر «${deleteTarget.name}» به‌طور کامل حذف شد`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ---------- ورود گروهی از فایل اکسل ----------
  function openImport() {
    setImpPhase("pick");
    setImpFile(null);
    setImpRows([]);
    setImpSummary(null);
    setImpResult(null);
    // پیش‌فرض: سامانه حضور و غیاب (پورت 8085) برای مشاورین انتخاب باشد
    setImpSystems(systems.filter((s) => s.url.includes(":8085")).map((s) => s.id));
    setImportOpen(true);
  }

  async function previewImport() {
    if (!impFile) {
      toast.error("ابتدا فایل اکسل را انتخاب کنید");
      return;
    }
    setImpBusy(true);
    try {
      const form = new FormData();
      form.append("file", impFile);
      form.append("mode", "preview");
      const data = await apiForm<{ rows: ImportRowT[]; summary: ImportSummary }>("/api/users/import", form);
      setImpRows(data.rows);
      setImpSummary(data.summary);
      setImpPhase("preview");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setImpBusy(false);
    }
  }

  async function commitImport() {
    if (!impFile) return;
    setImpBusy(true);
    try {
      const form = new FormData();
      form.append("file", impFile);
      form.append("mode", "commit");
      form.append("role", impRole);
      form.append("unit", impUnit);
      form.append("jobTitle", impTitle);
      form.append("resetPassword", impReset ? "1" : "0");
      form.append("systemIds", JSON.stringify(impSystems));
      const data = await apiForm<CommitResult>("/api/users/import", form);
      setImpResult(data);
      setImpPhase("done");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setImpBusy(false);
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
            <Users className="size-6 text-primary" />
            کاربران و مجوزها
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            افزودن، ورود گروهی از فایل اکسل، ویرایش کامل، تعلیق و حذف کاربران — ورود با کد ملی / ایمیل
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="جستجوی نام، کد ملی، موبایل…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9 w-44 md:w-56"
            />
          </div>
          <Button variant="outline" onClick={openImport} className="gap-2">
            <FileSpreadsheet className="size-4" /> ورود از فایل اکسل
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> کاربر جدید
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table dir="rtl">
            <TableHeader>
              <TableRow>
                <TableHead>کاربر</TableHead>
                <TableHead className="hidden md:table-cell">واحد</TableHead>
                <TableHead>نقش</TableHead>
                <TableHead className="hidden lg:table-cell">دسترسی سامانه‌ها</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead className="hidden md:table-cell">آخرین ورود</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-white text-xs" style={{ backgroundColor: u.avatarColor }}>
                          {u.name.slice(0, 1)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{u.name}</p>
                        <p dir="ltr" className="text-[11px] text-muted-foreground text-right font-mono">
                          {u.username ? `${u.username} · ${u.email}` : u.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs">{u.unit}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px]" style={{ color: ROLE_COLORS[u.role as keyof typeof ROLE_COLORS] }}>
                      {ROLE_LABELS[u.role as keyof typeof ROLE_LABELS]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <button
                      onClick={() => openEdit(u)}
                      className="flex items-center gap-1 hover:opacity-80"
                      title="ویرایش کاربر و دسترسی‌ها"
                    >
                      {systems.map((s) => {
                        const has = u.systemIds?.includes(s.id);
                        return (
                          <span
                            key={s.id}
                            className={`size-2.5 rounded-full ${has ? "" : "opacity-20"}`}
                            style={{ backgroundColor: s.color }}
                            title={`${s.name}: ${has ? "مجاز" : "بدون مجوز"}`}
                          />
                        );
                      })}
                      <span className="text-[10px] text-muted-foreground ms-1">
                        {faNum(u.systemIds?.length || 0)} سامانه
                      </span>
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="text-[10px]"
                      style={{
                        color: u.status === "ACTIVE" ? "#0f766e" : u.status === "SUSPENDED" ? "#dc2626" : "#64748b",
                        backgroundColor:
                          u.status === "ACTIVE" ? "#e0f2f1" : u.status === "SUSPENDED" ? "#fee2e2" : "#f1f5f9",
                      }}
                    >
                      {STATUS_LABELS[u.status] || u.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    {u.lastLoginAt ? formatShortJalali(u.lastLoginAt) : "—"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu dir="rtl">
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onClick={() => openEdit(u)} className="cursor-pointer">
                          <Pencil className="size-4 ms-0 me-2" /> ویرایش کامل کاربر
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => resetPassword(u)} className="cursor-pointer">
                          <KeyRound className="size-4 ms-0 me-2" /> بازنشانی رمز عبور
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {u.status === "ACTIVE" ? (
                          <DropdownMenuItem onClick={() => toggleStatus(u)} className="cursor-pointer">
                            <ShieldOff className="size-4 ms-0 me-2" /> تعلیق حساب
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => toggleStatus(u)} className="cursor-pointer">
                            <ShieldCheck className="size-4 ms-0 me-2" /> فعال‌سازی حساب
                          </DropdownMenuItem>
                        )}
                        {u.status !== "INACTIVE" && (
                          <DropdownMenuItem onClick={() => deactivate(u)} className="cursor-pointer">
                            <UserX className="size-4 ms-0 me-2" /> غیرفعال‌سازی (حفظ سوابق)
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(u)}
                          className="cursor-pointer text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-4 ms-0 me-2" /> حذف کامل کاربر
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                    کاربری با این مشخصات یافت نشد.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ویرایش کامل کاربر */}
      <Dialog open={editOpen} onOpenChange={(v) => { if (!v) { setEditOpen(false); setEditing(null); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto" dir="rtl">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle>ویرایش کامل کاربر</DialogTitle>
                <DialogDescription>
                  همهٔ مشخصات، رمز عبور، وضعیت و مجوز سامانه‌های کاربر از همین‌جا قابل تغییر است.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>نام و نام خانوادگی</Label>
                    <Input value={eName} onChange={(e) => setEName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>ایمیل (نام کاربری ورود)</Label>
                    <Input dir="ltr" className="text-left" type="email" value={eEmail} onChange={(e) => setEEmail(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>شماره تماس</Label>
                    <Input dir="ltr" className="text-left" value={ePhone} onChange={(e) => setEPhone(e.target.value)} placeholder="09xxxxxxxxx" />
                  </div>
                  <div className="space-y-2">
                    <Label>عنوان شغلی</Label>
                    <Input value={eTitle} onChange={(e) => setETitle(e.target.value)} placeholder="مثلاً روان‌شناس" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>نقش</Label>
                    <Select dir="rtl" value={eRole} onValueChange={setERole}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(ROLE_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>واحد سازمانی</Label>
                    <Select dir="rtl" value={eUnit} onValueChange={setEUnit}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {UNITS.map((un) => (
                          <SelectItem key={un} value={un}>{un}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>وضعیت حساب</Label>
                    <Select dir="rtl" value={eStatus} onValueChange={setEStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">مشخصات پرونده (مطابق فایل مشاورین)</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>کد ملی (نام کاربری ورود)</Label>
                      <Input dir="ltr" className="text-left" inputMode="numeric" value={eNid} onChange={(e) => setENid(e.target.value)} placeholder="۱۰ رقم" />
                    </div>
                    <div className="space-y-2">
                      <Label>استان</Label>
                      <Input value={eProvince} onChange={(e) => setEProvince(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>مدرک تحصیلی</Label>
                      <Input value={eEdu} onChange={(e) => setEEdu(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>پروانه اشتغال</Label>
                      <Input value={eLicense} onChange={(e) => setELicense(e.target.value)} placeholder="دارد / ندارد" />
                    </div>
                    <div className="space-y-2">
                      <Label>رتبه حرفه‌ای</Label>
                      <Input value={eRank} onChange={(e) => setERank(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>شماره قرارداد</Label>
                      <Input dir="ltr" className="text-left" value={eContract} onChange={(e) => setEContract(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>کد استان</Label>
                      <Input dir="ltr" className="text-left" value={eProvCode} onChange={(e) => setEProvCode(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>کد تفضیلی شخص</Label>
                      <Input dir="ltr" className="text-left" value={ePersonal} onChange={(e) => setEPersonal(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>شماره شبا بانکی</Label>
                      <Input dir="ltr" className="text-left" value={eSheba} onChange={(e) => setESheba(e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>رمز عبور جدید (اختیاری — خالی بگذارید تا تغییر نکند)</Label>
                  <Input dir="ltr" className="text-left" type="text" value={ePass} onChange={(e) => setEPass(e.target.value)} placeholder="حداقل ۸ نویسه" />
                </div>
                <div className="space-y-2">
                  <Label>رنگ آواتار</Label>
                  <div className="flex gap-2">
                    {AVATAR_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEColor(c)}
                        className={`size-7 rounded-full transition-transform ${eColor === c ? "scale-110 ring-2 ring-offset-2 ring-foreground" : ""}`}
                        style={{ backgroundColor: c }}
                        aria-label={`رنگ ${c}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>دسترسی به سامانه‌ها</Label>
                  <div className="space-y-2">
                    {systems.map((s) => {
                      const has = eSystems.includes(s.id);
                      return (
                        <div key={s.id} className="flex items-center gap-3 rounded-xl border px-3 py-2">
                          <SystemIcon name={s.icon} color={s.color} className="size-7" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{s.name}</p>
                            <p dir="ltr" className="text-[10px] text-muted-foreground text-right font-mono">
                              {s.url.replace(/^https?:\/\//, "")}
                            </p>
                          </div>
                          <Switch
                            checked={has}
                            onCheckedChange={(v) =>
                              setESystems((cur) => (v ? [...cur, s.id] : cur.filter((x) => x !== s.id)))
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <Button className="w-full" onClick={saveEdit} disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : "ذخیره تغییرات"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* تأیید حذف کامل */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف کامل کاربر؟</AlertDialogTitle>
            <AlertDialogDescription>
              کاربر «{deleteTarget?.name}» ({deleteTarget?.email}) به‌همراه نشست‌ها، مجوز سامانه‌ها،
              وظایف، یادداشت‌ها و پیام‌های او برای همیشه حذف می‌شود و قابل بازگشت نیست.
              اگر فقط می‌خواهید دسترسی او را موقتاً قطع کنید، از «تعلیق حساب» یا «غیرفعال‌سازی» استفاده کنید.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                hardDelete();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={saving}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : "حذف کامل"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* کاربر جدید */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعریف کاربر جدید</DialogTitle>
            <DialogDescription>رمز عبور موقت تعیین کنید؛ کاربر می‌تواند بعداً تغییر دهد.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>نام و نام خانوادگی</Label>
                <Input value={fName} onChange={(e) => setFName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>ایمیل سازمانی</Label>
                <Input dir="ltr" className="text-left" type="email" value={fEmail} onChange={(e) => setFEmail(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>رمز عبور (حداقل ۸ نویسه)</Label>
                <Input dir="ltr" className="text-left" type="text" value={fPass} onChange={(e) => setFPass(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>کد ملی (اختیاری — نام کاربری ورود)</Label>
                <Input dir="ltr" className="text-left" inputMode="numeric" value={fNid} onChange={(e) => setFNid(e.target.value)} placeholder="۱۰ رقم" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>شماره تماس</Label>
                <Input dir="ltr" className="text-left" value={fPhone} onChange={(e) => setFPhone(e.target.value)} placeholder="09xxxxxxxxx" />
              </div>
              <div className="space-y-2">
                <Label>عنوان شغلی</Label>
                <Input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="مثلاً روان‌شناس" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>نقش</Label>
                <Select dir="rtl" value={fRole} onValueChange={setFRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>واحد سازمانی</Label>
                <Select dir="rtl" value={fUnit} onValueChange={setFUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map((un) => (
                      <SelectItem key={un} value={un}>{un}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>رنگ آواتار</Label>
              <div className="flex gap-2 h-9 items-center">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFColor(c)}
                    className={`size-7 rounded-full transition-transform ${fColor === c ? "scale-110 ring-2 ring-offset-2 ring-foreground" : ""}`}
                    style={{ backgroundColor: c }}
                    aria-label={`رنگ ${c}`}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>دسترسی اولیه به سامانه‌ها</Label>
              <div className="flex flex-wrap gap-1.5">
                {systems.map((s) => {
                  const selected = fSystems.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setFSystems((cur) => (selected ? cur.filter((x) => x !== s.id) : [...cur, s.id]))
                      }
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        selected ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
                      }`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <Button className="w-full" onClick={createUser} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "ایجاد کاربر"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ورود گروهی کاربران از فایل اکسل */}
      <Dialog open={importOpen} onOpenChange={(v) => { if (!v) setImportOpen(false); }}>
        <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-primary" />
              ورود گروهی کاربران از فایل اکسل
            </DialogTitle>
            <DialogDescription>
              فایل اکسل مشاورین را دریافت و بررسی می‌کنیم؛ «کد ملی» نام کاربری ورود و «شماره تماس»
              رمز عبور اولیه هر کاربر می‌شود. بقیه ستون‌ها در پروفایل کاربر ذخیره می‌شوند.
            </DialogDescription>
          </DialogHeader>

          {impPhase === "pick" && (
            <div className="space-y-4">
              <a
                href="/api/users/import"
                className="flex items-center justify-between rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
                download
              >
                <span className="flex items-center gap-2">
                  <Download className="size-4" />
                  دانلود قالب استاندارد اکسل (همان ستون‌های فایل مشاورین)
                </span>
                <span className="text-xs opacity-70">xlsx</span>
              </a>
              <div className="space-y-2">
                <Label>فایل اکسل دریافت‌شده از کاربر (xlsx / xls / csv)</Label>
                <Input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => setImpFile(e.target.files?.[0] || null)}
                  className="file:ml-2 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:text-primary"
                />
                <p className="text-xs text-muted-foreground leading-6">
                  ستون‌های فایل: استان، نام و نام خانوادگی، مدرک تحصیلی، پروانه اشتغال، رتبه حرفه‌ای،
                  شماره قرارداد، کد استان‌ها، کد تفضیلی شخص، شماره شباء بانکی، کد ملی، شماره تماس
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>نقش کاربران جدید</Label>
                  <Select dir="rtl" value={impRole} onValueChange={setImpRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>واحد سازمانی</Label>
                  <Select dir="rtl" value={impUnit} onValueChange={setImpUnit}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNITS.map((un) => (
                        <SelectItem key={un} value={un}>{un}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>عنوان شغلی</Label>
                  <Input value={impTitle} onChange={(e) => setImpTitle(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">بازنشانی رمز عبور کاربران موجود به شماره تماس</p>
                  <p className="text-xs text-muted-foreground">
                    اگر کد ملی کسی از قبل در سیستم باشد، مشخصاتش بروزرسانی می‌شود
                  </p>
                </div>
                <Switch checked={impReset} onCheckedChange={setImpReset} />
              </div>
              <div className="space-y-2">
                <Label>دسترسی اولیه به سامانه‌ها (برای همه ردیف‌های فایل)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {systems.map((s) => {
                    const selected = impSystems.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() =>
                          setImpSystems((cur) =>
                            selected ? cur.filter((x) => x !== s.id) : [...cur, s.id]
                          )
                        }
                        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                          selected ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
                        }`}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Button className="w-full" onClick={previewImport} disabled={!impFile || impBusy}>
                {impBusy ? <Loader2 className="size-4 animate-spin" /> : "بررسی فایل و نمایش پیش‌نمایش"}
              </Button>
            </div>
          )}

          {impPhase === "preview" && impSummary && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border p-3">
                  <p className="text-lg font-bold" style={{ color: "#0f766e" }}>{faNum(impSummary.create)}</p>
                  <p className="text-xs text-muted-foreground">ایجاد کاربر جدید</p>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-lg font-bold" style={{ color: "#d97706" }}>{faNum(impSummary.update)}</p>
                  <p className="text-xs text-muted-foreground">بروزرسانی موجود</p>
                </div>
                <div className="rounded-xl border p-3">
                  <p className="text-lg font-bold text-destructive">{faNum(impSummary.error)}</p>
                  <p className="text-xs text-muted-foreground">خطا (ثبت نمی‌شوند)</p>
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-xl border">
                <Table dir="rtl">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">سطر</TableHead>
                      <TableHead className="text-xs">وضعیت</TableHead>
                      <TableHead className="text-xs">نام</TableHead>
                      <TableHead className="text-xs">کد ملی</TableHead>
                      <TableHead className="text-xs">موبایل</TableHead>
                      <TableHead className="text-xs">استان</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {impRows.map((r) => (
                      <TableRow key={r.row} className={r.error ? "bg-destructive/5" : ""}>
                        <TableCell className="text-xs text-muted-foreground">{faNum(r.row)}</TableCell>
                        <TableCell>
                          {r.error ? (
                            <Badge variant="secondary" className="text-[10px] text-destructive">خطا</Badge>
                          ) : r.action === "create" ? (
                            <Badge variant="secondary" className="text-[10px]" style={{ color: "#0f766e" }}>ایجاد</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]" style={{ color: "#d97706" }}>بروزرسانی</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="inline-flex items-center gap-1">
                            {r.name}
                            {!r.nidValid && !r.error && (
                              <AlertCircle className="size-3.5 text-amber-500" title="رقم کنترلی کد ملی معتبر نیست — بررسی کنید" />
                            )}
                          </span>
                        </TableCell>
                        <TableCell dir="ltr" className="text-[11px] font-mono text-left">{r.nationalId || "—"}</TableCell>
                        <TableCell dir="ltr" className="text-[11px] font-mono text-left">{r.phone || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.province}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {impSummary.error > 0 && (
                <div className="space-y-1 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive max-h-32 overflow-y-auto">
                  {impRows
                    .filter((r) => r.error)
                    .map((r) => (
                      <p key={r.row}>
                        سطر {faNum(r.row)} — {r.name || "بدون نام"}: {r.error}
                      </p>
                    ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setImpPhase("pick")} disabled={impBusy}>
                  بازگشت
                </Button>
                <Button
                  className="flex-1"
                  onClick={commitImport}
                  disabled={impBusy || impSummary.create + impSummary.update === 0}
                >
                  {impBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    `ثبت نهایی (${faNum(impSummary.create + impSummary.update)} کاربر)`
                  )}
                </Button>
              </div>
            </div>
          )}

          {impPhase === "done" && impResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border p-4 text-sm" style={{ borderColor: "#0f766e55", backgroundColor: "#0f766e0d", color: "#0f766e" }}>
                <CheckCircle2 className="size-5 shrink-0" />
                <span>
                  {faNum(impResult.created)} کاربر جدید ایجاد و {faNum(impResult.updated)} کاربر بروزرسانی شد
                  {impResult.failed.length > 0 ? ` — ${faNum(impResult.failed.length)} ردیف ناموفق` : "."}
                </span>
              </div>
              {impResult.failed.length > 0 && (
                <div className="space-y-1 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive max-h-40 overflow-y-auto">
                  <p className="font-medium">ردیف‌های ناموفق:</p>
                  {impResult.failed.map((f) => (
                    <p key={f.row}>
                      سطر {faNum(f.row)} — {f.name}: {f.reason}
                    </p>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground leading-6">
                نام کاربری ورود هر کاربر «کد ملی» و رمز عبور اولیه او «شماره تماس» ثبت‌شده در فایل است —
                این اطلاعات را به کاربران اعلام کنید.
              </p>
              <Button className="w-full" onClick={() => setImportOpen(false)}>
                پایان
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
