"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { SystemIcon } from "@/components/panel/system-icon";
import { ROLE_LABELS, ROLE_COLORS, UNITS } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  Plus,
  MoreHorizontal,
  ShieldCheck,
  ShieldOff,
  UserX,
  KeyRound,
  Loader2,
  Search,
  Grid2X2,
} from "lucide-react";
import { toast } from "sonner";
import { formatShortJalali, faNum } from "@/lib/jalali";

interface U {
  id: string;
  email: string;
  name: string;
  role: string;
  unit: string;
  jobTitle: string;
  phone: string;
  avatarColor: string;
  status: string;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  systemIds?: string[];
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

export default function AdminUsersPage() {
  const [users, setUsers] = useState<U[]>([]);
  const [systems, setSystems] = useState<Sys[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editUser, setEditUser] = useState<U | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // فرم کاربر جدید
  const [fName, setFName] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fPass, setFPass] = useState("");
  const [fRole, setFRole] = useState("STAFF");
  const [fUnit, setFUnit] = useState("پذیرش");
  const [fTitle, setFTitle] = useState("");
  const [fColor, setFColor] = useState(AVATAR_COLORS[2]);
  const [fSystems, setFSystems] = useState<string[]>([]);

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
          u.unit.includes(search)
      ),
    [users, search]
  );

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
          password: fPass,
          role: fRole,
          unit: fUnit,
          jobTitle: fTitle,
          avatarColor: fColor,
          systemIds: fSystems,
        },
      });
      toast.success("کاربر ایجاد شد");
      setCreateOpen(false);
      setFName("");
      setFEmail("");
      setFPass("");
      setFTitle("");
      setFSystems([]);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

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

  async function saveAccess(u: U, systemIds: string[]) {
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", body: { systemIds } });
      toast.success("مجوزهای سامانه به‌روزرسانی شد");
      setEditUser(null);
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
            تعریف، ویرایش، تعلیق کاربران و تعیین دسترسی هر کاربر به هر سامانه
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="جستجوی کاربر…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9 w-44 md:w-56"
            />
          </div>
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
                          {u.email}
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
                      onClick={() => setEditUser(u)}
                      className="flex items-center gap-1 hover:opacity-80"
                      title="ویرایش دسترسی‌ها"
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
                      {u.status === "ACTIVE" ? "فعال" : u.status === "SUSPENDED" ? "معلق" : "غیرفعال"}
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
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditUser(u)} className="cursor-pointer">
                          <Grid2X2 className="size-4 ms-0 me-2" /> مجوزهای سامانه‌ها
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => resetPassword(u)} className="cursor-pointer">
                          <KeyRound className="size-4 ms-0 me-2" /> بازنشانی رمز عبور
                        </DropdownMenuItem>
                        {u.status !== "INACTIVE" && (
                          <DropdownMenuItem
                            onClick={() => toggleStatus(u)}
                            className="cursor-pointer"
                          >
                            {u.status === "ACTIVE" ? (
                              <>
                                <ShieldOff className="size-4 ms-0 me-2" /> تعلیق حساب
                              </>
                            ) : (
                              <>
                                <ShieldCheck className="size-4 ms-0 me-2" /> فعال‌سازی حساب
                              </>
                            )}
                          </DropdownMenuItem>
                        )}
                        {u.status !== "INACTIVE" && (
                          <DropdownMenuItem
                            onClick={async () => {
                              try {
                                await api(`/api/users/${u.id}`, { method: "DELETE" });
                                toast.success("کاربر غیرفعال شد");
                                await load();
                              } catch (err) {
                                toast.error((err as Error).message);
                              }
                            }}
                            className="cursor-pointer text-destructive focus:text-destructive"
                          >
                            <UserX className="size-4 ms-0 me-2" /> غیرفعال‌سازی
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* مجوزهای سامانه‌ها */}
      <Dialog open={!!editUser} onOpenChange={(v) => !v && setEditUser(null)}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          {editUser && (
            <>
              <DialogHeader>
                <DialogTitle>دسترسی {editUser.name} به سامانه‌ها</DialogTitle>
                <DialogDescription>
                  اصل مهم: یک‌بار ورود به معنای دسترسی به همه سایت‌ها نیست؛ مجوز هر سامانه جداگانه تعیین می‌شود.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                {systems.map((s) => {
                  const has = editUser.systemIds?.includes(s.id) || false;
                  return (
                    <div key={s.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5">
                      <SystemIcon name={s.icon} color={s.color} className="size-8" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{s.name}</p>
                        <p dir="ltr" className="text-[10px] text-muted-foreground text-right font-mono">
                          {s.url.replace(/^https?:\/\//, "")}
                        </p>
                      </div>
                      <Switch
                        checked={has}
                        onCheckedChange={(v) => {
                          const cur = editUser.systemIds || [];
                          setEditUser({
                            ...editUser,
                            systemIds: v ? [...cur, s.id] : cur.filter((x) => x !== s.id),
                          });
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <Button
                className="w-full"
                onClick={() => saveAccess(editUser, editUser.systemIds || [])}
                disabled={saving}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : "ذخیره مجوزها"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

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
                <Label>عنوان شغلی</Label>
                <Input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="مثلاً روان‌شناس" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>نقش</Label>
                <Select dir="rtl" value={fRole} onValueChange={setFRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>واحد سازمانی</Label>
                <Select dir="rtl" value={fUnit} onValueChange={setFUnit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>رنگ آواتار</Label>
              <div className="flex gap-2">
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
    </div>
  );
}
