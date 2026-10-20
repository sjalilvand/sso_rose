"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { api, TASK_STATUSES, EVENT_TYPES } from "@/lib/client";
import { useSession } from "@/components/providers";
import { SystemIcon } from "@/components/panel/system-icon";
import {
  formatJalali,
  formatShortJalali,
  formatTime,
  todayJalali,
  JALALI_MONTHS,
  faNum,
  jalaliToDate,
  jalaliFromKey,
} from "@/lib/jalali";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeftCircle,
  CalendarDays,
  Clock,
  ExternalLink,
  ListChecks,
  Megaphone,
  StickyNote,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

interface Sys {
  id: string;
  name: string;
  url: string;
  description: string;
  color: string;
  icon: string;
  connectionLevel: string;
  status: string;
  hasAccess: boolean;
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  isOverdue: boolean;
}

interface Ev {
  id: string;
  title: string;
  type: string;
  start: string;
  end: string | null;
  location: string;
}

interface Ann {
  id: string;
  title: string;
  importance: string;
  requiresAck: boolean;
  acknowledgedAt: string | null;
  publishAt: string;
}

interface Note {
  id: string;
  title: string;
  type: string;
  updatedAt: string;
}

export default function DashboardPage() {
  const { user, unreadConversations } = useSession();
  const [systems, setSystems] = useState<Sys[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [announcements, setAnnouncements] = useState<Ann[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, t, e, a, n] = await Promise.all([
          api<{ systems: Sys[] }>("/api/systems"),
          api<{ tasks: Task[] }>("/api/tasks"),
          api<{ events: Ev[] }>("/api/events"),
          api<{ announcements: Ann[] }>("/api/announcements"),
          api<{ notes: Note[] }>("/api/notes"),
        ]);
        setSystems(s.systems);
        setTasks(t.tasks);
        setEvents(e.events);
        setAnnouncements(a.announcements);
        setNotes(n.notes);
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const today = todayJalali();
  const openTasks = tasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED");
  const overdueTasks = openTasks.filter((t) => t.isOverdue);
  const myAnnouncementsNeedingAck = announcements.filter(
    (a) => a.requiresAck && !a.acknowledgedAt
  );
  const upcoming = events
    .filter((e) => new Date(e.start) >= new Date())
    .sort((a, b) => +new Date(a.start) - +new Date(b.start))
    .slice(0, 4);

  const accessible = systems.filter((s) => s.hasAccess);

  const greeting =
    new Date().getHours() < 12 ? "صبح بخیر" : new Date().getHours() < 17 ? "وقت بخیر" : "عصر بخیر";

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-36 rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* خوش‌آمدگویی */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-[#c2185b] to-[#880e4f] text-white p-6 md:p-8 animate-fade-up">
        <div className="absolute inset-0 opacity-10" aria-hidden>
          <div className="absolute -top-16 -left-16 size-64 rounded-full bg-white blur-2xl" />
        </div>
        <div className="relative flex flex-col md:flex-row md:items-center gap-6 justify-between">
          <div className="flex items-center gap-4">
            <Image src="/logo.svg" alt="رز هاب" width={56} height={56} className="hidden md:block" />
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-shadow-soft">
                {greeting}، {user?.name.split(" ").slice(-1)[0]}!
              </h1>
              <p className="text-white/85 mt-1.5">
                امروز {formatJalali(today, { withWeekday: true, withYear: false })}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-xl bg-white/15 backdrop-blur px-4 py-2 flex items-center gap-2">
              <ListChecks className="size-4" />
              {faNum(openTasks.length)} وظیفه باز
            </span>
            <span className="rounded-xl bg-white/15 backdrop-blur px-4 py-2 flex items-center gap-2">
              <CalendarDays className="size-4" />
              {faNum(upcoming.length)} رویداد پیش‌رو
            </span>
            {unreadConversations > 0 && (
              <Link href="/messages">
                <span className="rounded-xl bg-white/15 backdrop-blur px-4 py-2 flex items-center gap-2 hover:bg-white/25 transition-colors">
                  💬 {faNum(unreadConversations)} گفتگوی خوانده‌نشده
                </span>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* هشدار اطلاعیه‌های نیازمند تأیید */}
      {myAnnouncementsNeedingAck.length > 0 && (
        <Link href="/announcements" className="block animate-fade-up">
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 flex items-center gap-3 text-sm hover:shadow-sm transition-shadow">
            <Megaphone className="size-5 text-amber-600 shrink-0" />
            <span className="flex-1">
              <strong>{faNum(myAnnouncementsNeedingAck.length)} اطلاعیه</strong> نیازمند تأیید مطالعه
              دارید — از جمله «{myAnnouncementsNeedingAck[0].title}»
            </span>
            <ArrowLeftCircle className="size-4 text-amber-600 shrink-0" />
          </div>
        </Link>
      )}

      {/* کارت‌های سامانه‌ها */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            سامانه‌های مجموعه
          </h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/systems">
              همه سامانه‌ها <ArrowLeftCircle className="size-4" />
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {accessible.slice(0, 5).map((s) => (
            <Link key={s.id} href={`/systems?open=${s.id}`} className="system-card">
              <Card className="h-full border-border/70">
                <CardContent className="p-4 flex flex-col gap-2.5">
                  <SystemIcon name={s.icon} color={s.color} className="size-9" />
                  <div>
                    <p className="font-semibold text-sm">{s.name}</p>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1 leading-5">
                      {s.description}
                    </p>
                  </div>
                  <span className="mt-auto text-[10px] rounded-full bg-secondary px-2 py-0.5 w-fit text-secondary-foreground">
                    {s.connectionLevel === "ADVANCED" ? "اتصال پیشرفته" : "اتصال پایه"}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* وظایف من + تقویم و رویدادها */}
      <section className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="size-5 text-primary" />
              وظایف من
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/tasks">مدیریت وظایف</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {openTasks.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                وظیفه بازی ندارید — کارها مرتب است ✓
              </p>
            )}
            {openTasks.slice(0, 5).map((t) => {
              const st = TASK_STATUSES[t.status];
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-xl border px-3 py-2.5 hover:bg-accent/50 transition-colors"
                >
                  <span
                    className="size-2 rounded-full shrink-0"
                    style={{ backgroundColor: st.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t.dueDate && `مهلت: ${formatShortJalali(t.dueDate)}`}
                      {t.isOverdue && (
                        <span className="text-destructive font-medium"> — عقب‌افتاده</span>
                      )}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0" style={{ color: st.color }}>
                    {st.label}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="size-5 text-primary" />
              تقویم و رویدادها
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/calendar">تقویم کامل</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">رویداد پیش‌رویی ندارید</p>
            )}
            {upcoming.map((e) => {
              const et = EVENT_TYPES[e.type] || EVENT_TYPES.OTHER;
              return (
                <div key={e.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5">
                  <span
                    className="rounded-lg px-2 py-1 text-[10px] font-medium shrink-0"
                    style={{ backgroundColor: `${et.color}15`, color: et.color }}
                  >
                    {et.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.title}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="size-3" />
                      {formatShortJalali(e.start)} — {formatTime(e.start)}
                      {e.location && ` · ${e.location}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      {/* پیام‌های مهم + یادداشت‌ها + گزارش */}
      <section className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="size-5 text-primary" />
              اطلاعیه‌های اخیر
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {announcements.slice(0, 3).map((a) => (
              <Link
                key={a.id}
                href="/announcements"
                className="block rounded-xl border px-3 py-2.5 hover:bg-accent/50 transition-colors"
              >
                <p className="text-sm font-medium line-clamp-1">{a.title}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {formatShortJalali(a.publishAt)}
                  {a.importance === "URGENT" && (
                    <span className="text-destructive font-medium"> — فوری</span>
                  )}
                </p>
              </Link>
            ))}
            {announcements.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">اطلاعیه‌ای نیست</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <StickyNote className="size-5 text-primary" />
              یادداشت‌ها
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/notes">همه</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {notes.slice(0, 3).map((n) => (
              <Link
                key={n.id}
                href="/notes"
                className="block rounded-xl border px-3 py-2.5 hover:bg-accent/50 transition-colors"
              >
                <p className="text-sm font-medium line-clamp-1">{n.title}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {n.type === "PERSONAL" ? "شخصی" : "مشترک"} · {formatShortJalali(n.updatedAt)}
                </p>
              </Link>
            ))}
            {notes.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">یادداشتی ندارید</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">وضعیت کارها</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/reports">گزارش‌ها</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {(["NEW", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const).map((st) => {
              const count = tasks.filter((t) => t.status === st).length;
              const pct = tasks.length ? Math.round((count / tasks.length) * 100) : 0;
              return (
                <div key={st}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium">{TASK_STATUSES[st].label}</span>
                    <span className="text-muted-foreground">{faNum(count)} مورد</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
              );
            })}
            {overdueTasks.length > 0 && (
              <p className="text-xs text-destructive font-medium pt-1">
                {faNum(overdueTasks.length)} وظیفه عقب‌افتاده — پیگیری لازم است
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
