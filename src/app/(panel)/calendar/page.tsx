"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, EVENT_TYPES } from "@/lib/client";
import { useSession } from "@/components/providers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  CalendarDays,
  ChevronRight,
  ChevronLeft,
  Plus,
  Clock,
  MapPin,
  Loader2,
  Trash2,
  PartyPopper,
} from "lucide-react";
import { toast } from "sonner";
import {
  JALALI_MONTHS,
  WEEKDAYS_SHORT,
  dateToJalali,
  formatJalali,
  formatShortJalali,
  formatTime,
  jalaliKey,
  jalaliMonthGrid,
  jalaliToDate,
  todayJalali,
  isOfficialHoliday,
  faNum,
  type JalaliDate,
} from "@/lib/jalali";

interface Ev {
  id: string;
  title: string;
  description: string;
  type: string;
  start: string;
  end: string | null;
  location: string;
  owner: { id: string; name: string; avatarColor: string };
  attendees: { user: { id: string; name: string }; response: string }[];
}

const RESPONSE_LABELS: Record<string, string> = {
  YES: "حاضر",
  NO: "غایب",
  MAYBE: "احتمالاً",
  PENDING: "بی‌پاسخ",
};

export default function CalendarPage() {
  const { user } = useSession();
  const today = todayJalali();
  const [view, setView] = useState({ jy: today.jy, jm: today.jm });
  const [selectedDay, setSelectedDay] = useState<JalaliDate>(today);
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Ev | null>(null);

  // فرم رویداد
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fType, setFType] = useState("MEETING");
  const [fTime, setFTime] = useState("10:00");
  const [fLocation, setFLocation] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ events: Ev[] }>("/api/events");
      setEvents(data.events);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grid = useMemo(() => jalaliMonthGrid(view.jy, view.jm), [view]);

  // گروه‌بندی رویدادها بر اساس کلید روز
  const eventsByDay = useMemo(() => {
    const map = new Map<string, Ev[]>();
    for (const e of events) {
      const key = jalaliKey(dateToJalali(new Date(e.start)));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);

  const dayEvents = eventsByDay.get(jalaliKey(selectedDay)) || [];

  function prevMonth() {
    setView((v) => (v.jm === 1 ? { jy: v.jy - 1, jm: 12 } : { ...v, jm: v.jm - 1 }));
  }
  function nextMonth() {
    setView((v) => (v.jm === 12 ? { jy: v.jy + 1, jm: 1 } : { ...v, jm: v.jm + 1 }));
  }

  async function createEvent() {
    if (!fTitle.trim()) {
      toast.error("عنوان رویداد الزامی است");
      return;
    }
    setSaving(true);
    try {
      const [h, m] = fTime.split(":").map(Number);
      const base = jalaliToDate(selectedDay);
      base.setUTCHours(base.getUTCHours() + h - 12, m, 0, 0);
      await api("/api/events", {
        method: "POST",
        body: {
          title: fTitle,
          description: fDesc,
          type: fType,
          start: base.toISOString(),
          location: fLocation,
        },
      });
      toast.success("رویداد ثبت شد");
      setCreateOpen(false);
      setFTitle("");
      setFDesc("");
      setFLocation("");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent(e: Ev) {
    try {
      await api(`/api/events/${e.id}`, { method: "DELETE" });
      toast.success("رویداد حذف شد");
      setDetail(null);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-[480px] rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="size-6 text-primary" />
            تقویم {JALALI_MONTHS[view.jm - 1]} {faNum(view.jy)}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            تقویم شخصی و سازمانی — تعطیلات رسمی و جمعه‌ها مشخص شده‌اند
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border overflow-hidden">
            <Button variant="ghost" size="icon" onClick={prevMonth} aria-label="ماه قبل">
              <ChevronRight className="size-4" />
            </Button>
            <button
              onClick={() => {
                setView({ jy: today.jy, jm: today.jm });
                setSelectedDay(today);
              }}
              className="px-3 text-xs hover:bg-accent h-9"
            >
              امروز
            </button>
            <Button variant="ghost" size="icon" onClick={nextMonth} aria-label="ماه بعد">
              <ChevronLeft className="size-4" />
            </Button>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> رویداد جدید
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* شبکه ماه */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <div className="grid grid-cols-7 gap-1 mb-2">
              {WEEKDAYS_SHORT.map((w, i) => (
                <div
                  key={w}
                  className={`text-center text-xs font-medium py-2 ${i === 6 ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {grid.days.map((d, i) => {
                if (!d) return <div key={`e-${i}`} className="min-h-16 rounded-lg" />;
                const key = jalaliKey(d);
                const dayEventsList = eventsByDay.get(key) || [];
                const isToday = d.jy === today.jy && d.jm === today.jm && d.jd === today.jd;
                const isSelected =
                  d.jy === selectedDay.jy && d.jm === selectedDay.jm && d.jd === selectedDay.jd;
                const holiday = isOfficialHoliday(d);
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(d)}
                    className={`min-h-16 rounded-lg border p-1.5 text-right transition-colors relative hover:bg-accent/60 ${
                      isSelected ? "ring-2 ring-primary bg-primary/5" : ""
                    } ${holiday ? "bg-destructive/5" : ""}`}
                  >
                    <span
                      className={`text-sm ${isToday ? "inline-flex items-center justify-center size-6 rounded-full bg-primary text-white font-bold" : holiday ? "text-destructive" : ""}`}
                    >
                      {faNum(d.jd)}
                    </span>
                    {dayEventsList.length > 0 && (
                      <div className="absolute bottom-1 right-1 left-1 flex gap-0.5 flex-wrap">
                        {dayEventsList.slice(0, 3).map((e) => (
                          <span
                            key={e.id}
                            className="h-1.5 rounded-full flex-1 min-w-3"
                            style={{ backgroundColor: (EVENT_TYPES[e.type] || EVENT_TYPES.OTHER).color }}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* برنامه روز انتخابی */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              برنامه {formatJalali(selectedDay, { withWeekday: true })}
            </CardTitle>
            {isOfficialHoliday(selectedDay) && (
              <p className="text-xs text-destructive flex items-center gap-1.5">
                <PartyPopper className="size-3.5" /> تعطیل رسمی
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-2 max-h-[480px] overflow-y-auto">
            {dayEvents.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                رویدادی برای این روز ثبت نشده است
              </p>
            )}
            {dayEvents.map((e) => {
              const et = EVENT_TYPES[e.type] || EVENT_TYPES.OTHER;
              return (
                <button
                  key={e.id}
                  onClick={() => setDetail(e)}
                  className="w-full text-right rounded-xl border p-3 space-y-1.5 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{e.title}</span>
                    <Badge
                      variant="secondary"
                      className="text-[10px]"
                      style={{ color: et.color, backgroundColor: `${et.color}15` }}
                    >
                      {et.label}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {formatTime(e.start)}
                      {e.end ? ` تا ${formatTime(e.end)}` : ""}
                    </span>
                    {e.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" /> {e.location}
                      </span>
                    )}
                  </p>
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* جزئیات رویداد */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.title}</DialogTitle>
                <DialogDescription>
                  برگزارکننده: {detail.owner.name}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                {detail.description && <p className="leading-7 text-muted-foreground">{detail.description}</p>}
                <div className="rounded-xl bg-muted/60 p-3 space-y-1.5 text-xs">
                  <p className="flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" /> {formatShortJalali(detail.start)} — {formatTime(detail.start)}
                    {detail.end && ` تا ${formatTime(detail.end)}`}
                  </p>
                  {detail.location && (
                    <p className="flex items-center gap-1.5">
                      <MapPin className="size-3.5" /> {detail.location}
                    </p>
                  )}
                </div>
                {detail.attendees.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1.5">دعوت‌شدگان:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {detail.attendees.map((a) => (
                        <Badge key={a.user.id} variant="secondary" className="text-[10px]">
                          {a.user.name} — {RESPONSE_LABELS[a.response]}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {detail.owner.id === user?.id && (
                  <Button variant="destructive" size="sm" onClick={() => removeEvent(detail)}>
                    <Trash2 className="size-4" /> حذف رویداد
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* رویداد جدید */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>ثبت رویداد جدید</DialogTitle>
            <DialogDescription>
              برای روز {formatJalali(selectedDay)} ثبت می‌شود
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>عنوان</Label>
              <Input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="مثلاً جلسه هماهنگی تیم" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>نوع</Label>
                <Select dir="rtl" value={fType} onValueChange={setFType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EVENT_TYPES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>ساعت</Label>
                <Input dir="ltr" type="time" value={fTime} onChange={(e) => setFTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>محل برگزاری (اختیاری)</Label>
              <Input value={fLocation} onChange={(e) => setFLocation(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>توضیحات (اختیاری)</Label>
              <Textarea rows={2} value={fDesc} onChange={(e) => setFDesc(e.target.value)} />
            </div>
            <Button className="w-full" onClick={createEvent} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "ثبت رویداد"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
