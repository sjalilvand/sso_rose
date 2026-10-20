"use client";

import { useCallback, useEffect, useState } from "react";
import { api, IMPORTANCE } from "@/lib/client";
import { useSession } from "@/components/providers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Megaphone,
  Plus,
  Pin,
  CheckCircle2,
  Eye,
  Users,
  Loader2,
  Building,
  UserRound,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";
import { formatShortJalali, formatDateTime, faNum } from "@/lib/jalali";
import { ROLE_LABELS, UNITS } from "@/lib/permissions";

interface Ann {
  id: string;
  title: string;
  content: string;
  importance: string;
  audience: string;
  audienceRef: string;
  requiresAck: boolean;
  pinned: boolean;
  publishAt: string;
  expireAt: string | null;
  authorName: string;
  authorColor: string;
  viewedAt: string | null;
  acknowledgedAt: string | null;
  ackStats: { total: number; acknowledged: number };
}

export default function AnnouncementsPage() {
  const { user, permissions } = useSession();
  const [items, setItems] = useState<Ann[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Ann | null>(null);
  const [ackReport, setAckReport] = useState<{
    totalUsers: number;
    records: { userName: string; unit: string; avatarColor: string; viewedAt: string; acknowledgedAt: string | null }[];
  } | null>(null);

  // فرم انتشار
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [importance, setImportance] = useState("NORMAL");
  const [audience, setAudience] = useState("ALL");
  const [audienceRef, setAudienceRef] = useState("");
  const [requiresAck, setRequiresAck] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ announcements: Ann[] }>("/api/announcements");
      setItems(data.announcements);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ثبت «دیده‌شدن» هنگام بازکردن جزئیات
  async function openDetail(a: Ann) {
    setDetail(a);
    try {
      await api(`/api/announcements/${a.id}/ack`, { method: "POST", body: { action: "view" } });
    } catch {
      // بی‌اهمیت
    }
  }

  async function acknowledge(a: Ann) {
    try {
      await api(`/api/announcements/${a.id}/ack`, { method: "POST", body: { action: "acknowledge" } });
      toast.success("تأیید مطالعه ثبت شد");
      setDetail(null);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function publish() {
    if (!title.trim() || !content.trim()) {
      toast.error("عنوان و متن الزامی است");
      return;
    }
    setSaving(true);
    try {
      await api("/api/announcements", {
        method: "POST",
        body: {
          title,
          content,
          importance,
          audience,
          audienceRef,
          requiresAck,
        },
      });
      toast.success("اطلاعیه منتشر شد");
      setCreateOpen(false);
      setTitle("");
      setContent("");
      setImportance("NORMAL");
      setAudience("ALL");
      setAudienceRef("");
      setRequiresAck(false);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function viewAckReport(a: Ann) {
    try {
      const data = await api<{
        totalUsers: number;
        records: { userName: string; unit: string; avatarColor: string; viewedAt: string; acknowledgedAt: string | null }[];
      }>(`/api/announcements/${a.id}/ack`);
      setAckReport(data);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }

  const canPublish = !!permissions["announcements.publish"];

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Megaphone className="size-6 text-primary" />
            اطلاعیه‌ها و اخبار
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            «دیده‌شدن»، «تأیید مطالعه» و «انجام اقدام» سه وضعیت جداگانه‌اند.
          </p>
        </div>
        {canPublish && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> اطلاعیه جدید
          </Button>
        )}
      </div>

      {items.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            اطلاعیه‌ای برای شما منتشر نشده است
          </CardContent>
        </Card>
      )}

      {items.map((a) => {
        const imp = IMPORTANCE[a.importance] || IMPORTANCE.NORMAL;
        return (
          <Card
            key={a.id}
            className={`overflow-hidden animate-fade-up ${a.importance === "URGENT" ? "border-destructive/40" : ""} ${
              a.requiresAck && !a.acknowledgedAt ? "ring-1 ring-amber-400/60" : ""
            }`}
          >
            <div className="flex">
              <div className="w-1.5 shrink-0" style={{ backgroundColor: imp.color }} />
              <div className="flex-1 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.pinned && <Pin className="size-4 text-primary" />}
                    <h3 className="font-semibold leading-7">{a.title}</h3>
                    <Badge
                      className="text-[10px] border-0"
                      style={{ backgroundColor: imp.bg, color: imp.color }}
                      variant="secondary"
                    >
                      {imp.label}
                    </Badge>
                    {a.requiresAck && (
                      <Badge variant="secondary" className="text-[10px]">
                        نیازمند تأیید مطالعه
                      </Badge>
                    )}
                  </div>
                  {a.authorName && (
                    <div className="hidden sm:flex items-center gap-2 shrink-0">
                      <Avatar className="size-6">
                        <AvatarFallback
                          className="text-[10px] text-white"
                          style={{ backgroundColor: a.authorColor }}
                        >
                          {a.authorName.slice(0, 1)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground">{a.authorName}</span>
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground leading-7 mt-2 line-clamp-2">{a.content}</p>
                <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{formatShortJalali(a.publishAt)}</span>
                    {a.expireAt && <span>· اعتبار تا {formatShortJalali(a.expireAt)}</span>}
                    {a.acknowledgedAt ? (
                      <span className="flex items-center gap-1 text-teal-600 font-medium">
                        <CheckCircle2 className="size-3.5" /> تأیید شده
                      </span>
                    ) : a.viewedAt ? (
                      <span className="flex items-center gap-1">
                        <Eye className="size-3.5" /> دیده‌شده
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {a.authorName === user?.name && (
                      <Button variant="ghost" size="sm" onClick={() => viewAckReport(a)}>
                        <Users className="size-4" /> گزارش مطالعه ({faNum(a.ackStats.acknowledged)}/
                        {faNum(a.ackStats.total)})
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => openDetail(a)}>
                      مشاهده کامل
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        );
      })}

      {/* جزئیات و تأیید */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="leading-8">{detail.title}</DialogTitle>
                <DialogDescription>
                  {detail.authorName} · {formatDateTime(detail.publishAt)}
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm leading-8 whitespace-pre-wrap">{detail.content}</p>
              {detail.requiresAck && !detail.acknowledgedAt && (
                <Button className="w-full" onClick={() => acknowledge(detail)}>
                  <CheckCircle2 className="size-4" /> تأیید مطالعه می‌کنم
                </Button>
              )}
              {detail.acknowledgedAt && (
                <p className="text-xs text-teal-600 flex items-center gap-1.5 justify-center">
                  <CheckCircle2 className="size-4" />
                  تأیید شما در {formatDateTime(detail.acknowledgedAt)} ثبت شده است
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* گزارش مطالعه */}
      <Dialog open={!!ackReport} onOpenChange={(v) => !v && setAckReport(null)}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>گزارش مشاهده و تأیید مطالعه</DialogTitle>
            <DialogDescription>
              {ackReport ? `${faNum(ackReport.records.length)} نفر از ${faNum(ackReport.totalUsers)} کاربر فعال` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto space-y-2">
            {ackReport?.records.map((r, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border px-3 py-2">
                <Avatar className="size-7">
                  <AvatarFallback className="text-[10px] text-white" style={{ backgroundColor: r.avatarColor }}>
                    {r.userName.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm font-medium">{r.userName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.unit} · دیده‌شده: {formatShortJalali(r.viewedAt)}
                  </p>
                </div>
                {r.acknowledgedAt ? (
                  <CheckCircle2 className="size-4 text-teal-600" />
                ) : (
                  <Eye className="size-4 text-muted-foreground" />
                )}
              </div>
            ))}
            {ackReport?.records.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">هنوز کسی اطلاعیه را ندیده است</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* فرم انتشار */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>انتشار اطلاعیه جدید</DialogTitle>
            <DialogDescription>مخاطبان را دقیق انتخاب کنید — اطلاعات محرمانه فقط در فضای محدود منتشر شود.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>عنوان</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان اطلاعیه" />
            </div>
            <div className="space-y-2">
              <Label>متن اطلاعیه</Label>
              <Textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>سطح اهمیت</Label>
                <Select dir="rtl" value={importance} onValueChange={setImportance}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NORMAL">عادی</SelectItem>
                    <SelectItem value="IMPORTANT">مهم</SelectItem>
                    <SelectItem value="URGENT">فوری</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>مخاطبان</Label>
                <Select dir="rtl" value={audience} onValueChange={setAudience}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">
                      <span className="flex items-center gap-2">
                        <Users className="size-4" /> همه کاربران
                      </span>
                    </SelectItem>
                    <SelectItem value="UNIT">
                      <span className="flex items-center gap-2">
                        <Building className="size-4" /> واحدهای مشخص
                      </span>
                    </SelectItem>
                    <SelectItem value="ROLE">
                      <span className="flex items-center gap-2">
                        <UserCog className="size-4" /> نقش‌های مشخص
                      </span>
                    </SelectItem>
                    <SelectItem value="USERS">
                      <span className="flex items-center gap-2">
                        <UserRound className="size-4" /> افراد مشخص
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(audience === "UNIT" || audience === "ROLE" || audience === "USERS") && (
              <div className="space-y-2 animate-fade-up">
                <Label>
                  {audience === "UNIT"
                    ? "واحدها (با , جدا کنید)"
                    : audience === "ROLE"
                      ? "نقش‌ها (با , جدا کنید)"
                      : "شناسه افراد (با , جدا کنید)"}
                </Label>
                {audience === "UNIT" ? (
                  <div className="flex flex-wrap gap-1.5">
                    {UNITS.map((u) => {
                      const selected = audienceRef.split(",").map((s) => s.trim()).filter(Boolean).includes(u);
                      return (
                        <button
                          key={u}
                          type="button"
                          onClick={() => {
                            const cur = audienceRef.split(",").map((s) => s.trim()).filter(Boolean);
                            setAudienceRef(
                              (selected ? cur.filter((x) => x !== u) : [...cur, u]).join(",")
                            );
                          }}
                          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                            selected ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
                          }`}
                        >
                          {u}
                        </button>
                      );
                    })}
                  </div>
                ) : audience === "ROLE" ? (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(ROLE_LABELS).map(([key, label]) => {
                      const selected = audienceRef.split(",").map((s) => s.trim()).filter(Boolean).includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            const cur = audienceRef.split(",").map((s) => s.trim()).filter(Boolean);
                            setAudienceRef(
                              (selected ? cur.filter((x) => x !== key) : [...cur, key]).join(",")
                            );
                          }}
                          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                            selected ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Input
                    dir="ltr"
                    className="text-left"
                    value={audienceRef}
                    onChange={(e) => setAudienceRef(e.target.value)}
                    placeholder="user-id-1,user-id-2"
                  />
                )}
              </div>
            )}
            <div className="flex items-center justify-between rounded-xl border px-4 py-3">
              <div>
                <p className="text-sm font-medium">درخواست تأیید مطالعه</p>
                <p className="text-xs text-muted-foreground">مخاطبان باید مطالعه را صریحاً تأیید کنند</p>
              </div>
              <Switch checked={requiresAck} onCheckedChange={setRequiresAck} />
            </div>
            <Button className="w-full" onClick={publish} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "انتشار اطلاعیه"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
