"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useSession } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { StickyNote, Plus, Lock, Users, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatShortJalali } from "@/lib/jalali";

interface Note {
  id: string;
  title: string;
  content: string;
  type: string;
  color: string;
  tags: string;
  authorId: string;
  updatedAt: string;
  author: { name: string; avatarColor: string };
  shares: { user: { id: string; name: string } }[];
}

interface UserLite {
  id: string;
  name: string;
  unit: string;
  jobTitle: string;
}

const COLORS = ["#fde7ef", "#e0f2f1", "#fff8e1", "#e3f2fd", "#f3e5f5", "#efebe9"];

export default function NotesPage() {
  const { user } = useSession();
  const [notes, setNotes] = useState<Note[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Note | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");

  // فرم
  const [fTitle, setFTitle] = useState("");
  const [fContent, setFContent] = useState("");
  const [fType, setFType] = useState("PERSONAL");
  const [fColor, setFColor] = useState(COLORS[0]);
  const [fTags, setFTags] = useState("");
  const [fShares, setFShares] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [n, u] = await Promise.all([
        api<{ notes: Note[] }>("/api/notes"),
        api<{ users: UserLite[] }>("/api/users"),
      ]);
      setNotes(n.notes);
      setUsers(u.users.filter((x) => x.id !== user?.id));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    if (!fTitle.trim()) {
      toast.error("عنوان یادداشت الزامی است");
      return;
    }
    setSaving(true);
    try {
      await api("/api/notes", {
        method: "POST",
        body: { title: fTitle, content: fContent, type: fType, color: fColor, tags: fTags, shareIds: fShares },
      });
      toast.success("یادداشت ثبت شد");
      setCreateOpen(false);
      setFTitle("");
      setFContent("");
      setFTags("");
      setFShares([]);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveDetail() {
    if (!detail) return;
    try {
      await api(`/api/notes/${detail.id}`, {
        method: "PATCH",
        body: { title: detail.title, content: detail.content },
      });
      toast.success("یادداشت به‌روزرسانی شد");
      setDetail(null);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function remove(n: Note) {
    try {
      await api(`/api/notes/${n.id}`, { method: "DELETE" });
      toast.success("یادداشت حذف شد");
      setDetail(null);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    );
  }

  const filtered = notes.filter((n) => {
    if (typeFilter !== "ALL" && n.type !== typeFilter) return false;
    if (search && !(n.title.includes(search) || n.content.includes(search))) return false;
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <StickyNote className="size-6 text-primary" />
            یادداشت‌ها
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <Lock className="size-3.5" /> یادداشت شخصی فقط برای خودتان قابل مشاهده است
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="جستجو در یادداشت‌ها…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-40 md:w-56"
          />
          <Select dir="rtl" value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">همه</SelectItem>
              <SelectItem value="PERSONAL">شخصی</SelectItem>
              <SelectItem value="SHARED">مشترک</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> یادداشت جدید
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          یادداشتی یافت نشد
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((n) => (
            <button
              key={n.id}
              onClick={() => setDetail(n)}
              className="text-right rounded-2xl border p-4 space-y-2 hover:shadow-md transition-all system-card"
              style={{ backgroundColor: n.color }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-sm leading-6 line-clamp-2">{n.title}</p>
                {n.type === "SHARED" ? (
                  <Users className="size-4 shrink-0 opacity-60" />
                ) : (
                  <Lock className="size-4 shrink-0 opacity-60" />
                )}
              </div>
              <p className="text-xs leading-6 text-foreground/70 line-clamp-3">{n.content}</p>
              {n.tags && (
                <div className="flex flex-wrap gap-1">
                  {n.tags.split(",").filter(Boolean).map((t) => (
                    <span key={t} className="rounded-full bg-white/60 px-2 py-0.5 text-[10px]">
                      #{t.trim()}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between text-[10px] text-foreground/60 pt-1">
                <span>{n.author.name}</span>
                <span>{formatShortJalali(n.updatedAt)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* مشاهده/ویرایش */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>ویرایش یادداشت</DialogTitle>
                <DialogDescription>
                  {detail.type === "SHARED"
                    ? `مشترک با: ${detail.shares.map((s) => s.user.name).join("، ") || "—"}`
                    : "یادداشت شخصی — فقط شما می‌بینید"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Input value={detail.title} onChange={(e) => setDetail({ ...detail, title: e.target.value })} />
                <Textarea rows={6} value={detail.content} onChange={(e) => setDetail({ ...detail, content: e.target.value })} />
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={saveDetail}>
                    ذخیره تغییرات
                  </Button>
                  {detail.authorId === user?.id && (
                    <Button variant="destructive" onClick={() => remove(detail)}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* یادداشت جدید */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>یادداشت جدید</DialogTitle>
            <DialogDescription>
              یادداشت شخصی پیش‌فرض برای مدیران هم قابل مشاهده نیست.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>عنوان</Label>
              <Input value={fTitle} onChange={(e) => setFTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>متن</Label>
              <Textarea rows={4} value={fContent} onChange={(e) => setFContent(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>نوع</Label>
                <Select dir="rtl" value={fType} onValueChange={setFType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERSONAL">شخصی (محرمانه)</SelectItem>
                    <SelectItem value="SHARED">مشترک</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>برچسب‌ها (با , جدا کنید)</Label>
                <Input value={fTags} onChange={(e) => setFTags(e.target.value)} placeholder="جلسه,برنامه" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>رنگ کارت</Label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFColor(c)}
                    className={`size-8 rounded-lg border-2 transition-transform ${fColor === c ? "scale-110 border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    aria-label={`رنگ ${c}`}
                  />
                ))}
              </div>
            </div>
            {fType === "SHARED" && (
              <div className="space-y-2 animate-fade-up">
                <Label>اشتراک با</Label>
                <div className="max-h-40 overflow-y-auto rounded-xl border p-2 space-y-1">
                  {users.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent cursor-pointer text-sm">
                      <Checkbox
                        checked={fShares.includes(u.id)}
                        onCheckedChange={(v) =>
                          setFShares((cur) => (v ? [...cur, u.id] : cur.filter((x) => x !== u.id)))
                        }
                      />
                      {u.name}
                      <span className="text-[10px] text-muted-foreground">{u.unit}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <Button className="w-full" onClick={create} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "ثبت یادداشت"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
