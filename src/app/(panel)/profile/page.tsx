"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useSession } from "@/components/providers";
import { ROLE_LABELS } from "@/lib/permissions";
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
  MonitorSmartphone,
  KeyRound,
  ShieldCheck,
  Loader2,
  Trash2,
  LogOut,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { formatDateTime, faNum } from "@/lib/jalali";
import { useRouter } from "next/navigation";

interface Sess {
  id: string;
  device: string;
  ip: string;
  createdAt: string;
  lastSeen: string;
  revoked: boolean;
}

export default function ProfilePage() {
  const { user, refresh } = useSession();
  const router = useRouter();
  const [sessions, setSessions] = useState<Sess[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const data = await api<{ sessions: Sess[] }>("/api/auth/sessions");
      setSessions(data.sessions);
    } catch {
      // بی‌صدا
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  async function changePassword() {
    if (newPassword.length < 8) {
      toast.error("رمز عبور جدید باید حداقل ۸ نویسه باشد");
      return;
    }
    setSaving(true);
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      toast.success("رمز عبور تغییر کرد");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle2FA(enabled: boolean) {
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: { twoFactorEnabled: enabled },
      });
      toast.success(enabled ? "احراز هویت دومرحله‌ای فعال شد" : "احراز هویت دومرحله‌ای غیرفعال شد");
      await refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function revokeSession(id: string) {
    try {
      await api(`/api/auth/sessions?id=${id}`, { method: "DELETE" });
      toast.success("نشست خاتمه یافت");
      await loadSessions();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  if (!user) return <div className="max-w-3xl mx-auto"><Skeleton className="h-96 rounded-2xl" /></div>;

  const activeSessions = sessions.filter((s) => !s.revoked);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* پروفایل */}
      <Card className="animate-fade-up">
        <CardContent className="p-6 flex items-center gap-4 flex-wrap">
          <Avatar className="size-16">
            <AvatarFallback className="text-white text-xl" style={{ backgroundColor: user.avatarColor }}>
              {user.name.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-40">
            <h1 className="text-xl font-bold">{user.name}</h1>
            <p dir="ltr" className="text-sm text-muted-foreground text-right font-mono mt-0.5">
              {user.email}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="secondary">{ROLE_LABELS[user.role as keyof typeof ROLE_LABELS]}</Badge>
              <Badge variant="secondary">{user.unit}</Badge>
              {user.jobTitle && <Badge variant="outline">{user.jobTitle}</Badge>}
            </div>
          </div>
          <Button variant="outline" onClick={logout}>
            <LogOut className="size-4" /> خروج از حساب
          </Button>
        </CardContent>
      </Card>

      {/* امنیت */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            امنیت حساب
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>رمز عبور فعلی</Label>
              <Input
                type="password"
                dir="ltr"
                className="text-left"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>رمز عبور جدید (حداقل ۸ نویسه)</Label>
              <Input
                type="password"
                dir="ltr"
                className="text-left"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={changePassword} disabled={saving || !newPassword}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : "تغییر رمز عبور"}
          </Button>

          <div className="flex items-center justify-between rounded-xl border px-4 py-3">
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-5 text-primary" />
              <div>
                <p className="text-sm font-medium">احراز هویت دومرحله‌ای</p>
                <p className="text-xs text-muted-foreground">
                  برای مدیران و دسترسی‌های حساس توصیه می‌شود (کد نمایشی)
                </p>
              </div>
            </div>
            <Switch checked={user.twoFactorEnabled} onCheckedChange={toggle2FA} />
          </div>
        </CardContent>
      </Card>

      {/* نشست‌های فعال */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MonitorSmartphone className="size-5 text-primary" />
            نشست‌های فعال
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {faNum(activeSessions.length)} نشست فعال — از دستگاه‌های غیرمعمول، خروج بدهید.
          </p>
          {loading && <Skeleton className="h-16 rounded-xl" />}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${s.revoked ? "opacity-40" : ""}`}
            >
              <div className="flex-1">
                <p className="text-sm font-medium flex items-center gap-2">
                  {s.device}
                  {s.revoked && <Badge variant="secondary" className="text-[10px]">خاتمه‌یافته</Badge>}
                </p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Clock className="size-3" />
                  آخرین فعالیت: {formatDateTime(s.lastSeen)}
                  {s.ip && (
                    <span dir="ltr" className="font-mono">
                       · {s.ip}
                    </span>
                  )}
                </p>
              </div>
              {!s.revoked && (
                <Button variant="ghost" size="sm" onClick={() => revokeSession(s.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
