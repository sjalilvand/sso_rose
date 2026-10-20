"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { useSession } from "@/components/providers";
import { SystemIcon } from "@/components/panel/system-icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Shield,
  Plus,
  Globe,
  Database,
  ExternalLink,
  Loader2,
  Signal,
  KeyRound,
  Copy,
  CheckCircle2,
  Eye,
  EyeOff,
  RefreshCw,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { formatShortJalali } from "@/lib/jalali";

interface Sys {
  id: string;
  name: string;
  url: string;
  description: string;
  color: string;
  icon: string;
  connectionLevel: string;
  status: string;
  sortOrder: number;
  clientId: string | null;
  clientSecret: string | null;
}

const ICON_OPTIONS = ["HeartPulse", "GraduationCap", "Building2", "Brain", "Cpu", "Globe"];
const COLOR_OPTIONS = ["#c2185b", "#0369a1", "#0f766e", "#7c3aed", "#d97706", "#6366f1"];

export default function AdminSystemsPage() {
  const [systems, setSystems] = useState<Sys[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [regenId, setRegenId] = useState<string | null>(null);

  const [fName, setFName] = useState("");
  const [fUrl, setFUrl] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fIcon, setFIcon] = useState("Globe");
  const [fColor, setFColor] = useState(COLOR_OPTIONS[0]);

  const load = async () => {
    try {
      const data = await api<{ systems: Sys[] }>("/api/systems");
      setSystems(data.systems);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  async function updateConnection(s: Sys, connectionLevel: string) {
    try {
      await api(`/api/systems/${s.id}`, { method: "PATCH", body: { connectionLevel } });
      toast.success(`سطح اتصال ${s.name} تغییر کرد`);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function copyValue(id: string, value: string | null, label: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(id + label);
    toast.success(`${label} کپی شد`);
    setTimeout(() => setCopied(null), 1500);
  }

  async function regenerate(s: Sys) {
    if (!confirm(`رمز اتصال «${s.name}» تمدید شود؟ رمز قبلی بلافاصله باطل می‌شود و باید با تیم فنی سامانه هماهنگ شود.`)) return;
    setRegenId(s.id);
    try {
      await api(`/api/systems/${s.id}/credentials`, { method: "POST", body: {} });
      toast.success(`رمز اتصال ${s.name} تمدید شد`);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRegenId(null);
    }
  }

  async function create() {
    if (!fName.trim() || !fUrl.trim()) {
      toast.error("نام و نشانی الزامی است");
      return;
    }
    setSaving(true);
    try {
      await api("/api/systems", {
        method: "POST",
        body: { name: fName, url: fUrl, description: fDesc, icon: fIcon, color: fColor },
      });
      toast.success("سامانه اضافه شد");
      setCreateOpen(false);
      setFName("");
      setFUrl("");
      setFDesc("");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-4">
        <Skeleton className="h-16 rounded-2xl" />
        <div className="grid md:grid-cols-2 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Shield className="size-6 text-primary" />
            مدیریت سامانه‌ها
          </h1>
          <p className="text-sm text-muted-foreground mt-1 leading-7">
            دو سطح اتصال: «پایه» یعنی ورود یکپارچه و انتقال کاربر به مقصد؛ «پیشرفته» یعنی نمایش
            اطلاعات و انجام عملیات از داخل رز هاب با API و مجوزهای مناسب.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/sso-docs">
            <Button variant="outline">
              <BookOpen className="size-4" /> مستندات اتصال SSO
            </Button>
          </Link>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> سامانه جدید
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {systems.map((s) => (
          <Card key={s.id} className="overflow-hidden">
            <div className="h-1.5" style={{ backgroundColor: s.color }} />
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <SystemIcon name={s.icon} color={s.color} className="size-10" />
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base">{s.name}</CardTitle>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    dir="ltr"
                    className="text-[11px] text-muted-foreground hover:text-primary font-mono text-right block truncate"
                  >
                    {s.url}
                  </a>
                </div>
                <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                  <Signal className="size-3" /> {s.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground leading-6">{s.description}</p>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">سطح اتصال:</span>
                  <Select dir="rtl" value={s.connectionLevel} onValueChange={(v) => updateConnection(s, v)}>
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BASIC">
                        <span className="flex items-center gap-1.5">
                          <ExternalLink className="size-3.5" /> پایه (SSO)
                        </span>
                      </SelectItem>
                      <SelectItem value="ADVANCED">
                        <span className="flex items-center gap-1.5">
                          <Database className="size-3.5" /> پیشرفته (API)
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm">
                    <Globe className="size-4" /> مشاهده سایت
                  </Button>
                </a>
              </div>

              {/* مشخصات اتصال SSO */}
              <div className="rounded-xl border border-dashed p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium flex items-center gap-1.5 text-foreground">
                    <KeyRound className="size-3.5 text-primary" /> مشخصات اتصال (Client ID / Secret)
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-[11px] text-muted-foreground"
                    onClick={() => regenerate(s)}
                    disabled={regenId === s.id}
                  >
                    {regenId === s.id ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                    تمدید رمز
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground w-20 shrink-0">Client ID</span>
                    <code dir="ltr" className="flex-1 text-left text-[10px] bg-muted/70 rounded-lg px-2 py-1 font-mono truncate">
                      {s.clientId ?? "—"}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0"
                      aria-label="کپی Client ID"
                      onClick={() => copyValue(s.id, s.clientId, "Client ID")}
                    >
                      {copied === s.id + "Client ID" ? <CheckCircle2 className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                    </Button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground w-20 shrink-0">Secret</span>
                    <code dir="ltr" className="flex-1 text-left text-[10px] bg-muted/70 rounded-lg px-2 py-1 font-mono truncate">
                      {s.clientSecret ? (revealed[s.id] ? s.clientSecret : "••••••••••••••••••••••••") : "—"}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0"
                      aria-label="نمایش/پنهان رمز"
                      onClick={() => setRevealed((r) => ({ ...r, [s.id]: !r[s.id] }))}
                    >
                      {revealed[s.id] ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0"
                      aria-label="کپی Secret"
                      onClick={() => copyValue(s.id, s.clientSecret, "Secret")}
                    >
                      {copied === s.id + "Secret" ? <CheckCircle2 className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                    </Button>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground leading-5">
                  این دو مقدار را با تیم فنی سامانه هماهنگ کنید؛ راهنمای کامل پیاده‌سازی در صفحه
                  <Link href="/sso-docs" className="text-primary hover:underline mx-1">مستندات اتصال</Link>
                  است.
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground leading-7 rounded-xl border border-dashed p-4">
        یادآوری سند: نمایش سایت‌ها داخل یک قاب (iframe) جایگزین یکپارچه‌سازی واقعی نیست و ممکن است
        محدودیت امنیتی یا فنی داشته باشد. پیاده‌سازی اتصال پیشرفته نیازمند هماهنگی فنی و توافق API با
        هر سامانه است. آخرین بررسی: {formatShortJalali(new Date())}
      </p>

      {/* سامانه جدید */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>افزودن سامانه جدید</DialogTitle>
            <DialogDescription>نشانی سامانه و مشخصات نمایشی آن را وارد کنید.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>نام سامانه</Label>
              <Input value={fName} onChange={(e) => setFName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>نشانی</Label>
              <Input dir="ltr" className="text-left" placeholder="https://" value={fUrl} onChange={(e) => setFUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>توضیح کوتاه</Label>
              <Input value={fDesc} onChange={(e) => setFDesc(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>آیکون</Label>
              <div className="flex gap-2 flex-wrap">
                {ICON_OPTIONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setFIcon(ic)}
                    className={`p-2 rounded-xl border transition-colors ${fIcon === ic ? "border-primary bg-primary/5" : "hover:bg-accent"}`}
                  >
                    <SystemIcon name={ic} color={fColor} className="size-5" />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>رنگ</Label>
              <div className="flex gap-2">
                {COLOR_OPTIONS.map((c) => (
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
            <Button className="w-full" onClick={create} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "افزودن سامانه"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
