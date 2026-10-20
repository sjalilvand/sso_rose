"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { useSession } from "@/components/providers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MessagesSquare,
  Send,
  Hash,
  Users,
  Plus,
  MessageCircle,
  Loader2,
  Megaphone,
  Pin,
} from "lucide-react";
import { toast } from "sonner";
import { formatShortJalali, formatTime, faNum } from "@/lib/jalali";

interface Conv {
  id: string;
  type: string;
  title: string;
  members: { id: string; name: string; avatarColor: string; jobTitle: string }[];
  lastMessage: { content: string; createdAt: string; senderId: string } | null;
  unread: number;
}

interface Msg {
  id: string;
  content: string;
  createdAt: string;
  senderId: string;
  sender: { id: string; name: string; avatarColor: string };
  pinned: boolean;
}

export default function MessagesPage() {
  const { user } = useSession();
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<Conv | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newType, setNewType] = useState("DIRECT");
  const [newTitle, setNewTitle] = useState("");
  const [newMembers, setNewMembers] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; name: string; unit: string; jobTitle: string; avatarColor: string }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConvs = useCallback(async () => {
    try {
      const data = await api<{ conversations: Conv[] }>("/api/conversations");
      setConvs(data.conversations);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    try {
      const data = await api<{ messages: Msg[] }>(`/api/conversations/${id}/messages`);
      setMessages(data.messages);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, []);

  useEffect(() => {
    loadConvs();
    api<{ users: typeof allUsers }>("/api/users").then((d) => setAllUsers(d.users)).catch(() => {});
  }, [loadConvs]);

  // پرس‌وجوی دوره‌ای برای پیام‌های جدید (نمونه اولیه — نسخه نهایی با WebSocket)
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => loadMessages(active.id), 5000);
    return () => clearInterval(t);
  }, [active, loadMessages]);

  async function openConv(c: Conv) {
    setActive(c);
    await loadMessages(c.id);
    await loadConvs();
  }

  async function send() {
    if (!text.trim() || !active) return;
    setSending(true);
    try {
      await api(`/api/conversations/${active.id}/messages`, {
        method: "POST",
        body: { content: text },
      });
      setText("");
      await loadMessages(active.id);
      await loadConvs();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function createConv() {
    try {
      if (newType === "DIRECT") {
        if (newMembers.length !== 1) {
          toast.error("برای گفتگوی خصوصی یک نفر را انتخاب کنید");
          return;
        }
      } else if (!newTitle.trim() || newMembers.length === 0) {
        toast.error("عنوان و حداقل یک عضو لازم است");
        return;
      }
      const data = await api<{ conversation: { id: string } }>("/api/conversations", {
        method: "POST",
        body: {
          type: newType,
          title: newType === "DIRECT" ? "" : newTitle,
          memberIds: newMembers,
        },
      });
      await loadConvs();
      const convsData = await api<{ conversations: Conv[] }>("/api/conversations");
      const fresh = convsData.conversations.find((c) => c.id === data.conversation.id);
      if (fresh) openConv(fresh);
      setNewOpen(false);
      setNewTitle("");
      setNewMembers([]);
      toast.success("گفتگو ایجاد شد");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <Skeleton className="h-[70vh] rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <MessagesSquare className="size-6 text-primary" />
            گفتگوها
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            اطلاعات محرمانه مراجعان در گفتگوهای عمومی منتشر نمی‌شود.
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="size-4" /> گفتگوی جدید
        </Button>
      </div>

      <div className="grid md:grid-cols-[340px_1fr] gap-4">
        {/* فهرست گفتگوها */}
        <Card className="p-2 h-[68vh] overflow-y-auto">
          {convs.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-10">گفتگویی ندارید</p>
          )}
          {convs.map((c) => {
            const other = c.members.find((m) => m.id !== user?.id);
            const name = c.type === "DIRECT" ? other?.name || c.title : c.title;
            const color = c.type === "DIRECT" ? other?.avatarColor : undefined;
            const isActive = active?.id === c.id;
            return (
              <button
                key={c.id}
                onClick={() => openConv(c)}
                className={`w-full text-right flex items-center gap-3 rounded-xl px-3 py-2.5 mb-1 transition-colors ${
                  isActive ? "bg-primary/10" : "hover:bg-accent/60"
                }`}
              >
                <Avatar className="size-10 shrink-0">
                  <AvatarFallback
                    className="text-white"
                    style={{ backgroundColor: color || (c.type === "CHANNEL" ? "#0f766e" : "#7c3aed") }}
                  >
                    {c.type === "DIRECT" ? name.slice(0, 1) : c.type === "CHANNEL" ? <Megaphone className="size-4" /> : <Users className="size-4" />}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{name}</p>
                    {c.unread > 0 && (
                      <span className="size-2 rounded-full bg-primary shrink-0" aria-label="خوانده‌نشده" />
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {c.type === "CHANNEL" && <Hash className="inline size-3" />}
                    {c.lastMessage?.content || "بدون پیام"}
                  </p>
                </div>
              </button>
            );
          })}
        </Card>

        {/* پیام‌ها */}
        <Card className="flex flex-col h-[68vh]">
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              <div className="text-center space-y-2">
                <MessageCircle className="size-10 mx-auto opacity-30" />
                <p>یک گفتگو را انتخاب کنید یا گفتگوی جدیدی بسازید</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b px-4 py-3">
                <Avatar className="size-9">
                  <AvatarFallback
                    className="text-white text-sm"
                    style={{
                      backgroundColor:
                        active.type === "DIRECT"
                          ? active.members.find((m) => m.id !== user?.id)?.avatarColor
                          : active.type === "CHANNEL"
                            ? "#0f766e"
                            : "#7c3aed",
                    }}
                  >
                    {active.type === "DIRECT"
                      ? (active.members.find((m) => m.id !== user?.id)?.name || "").slice(0, 1)
                      : active.type === "CHANNEL"
                        ? "آ"
                        : "گ"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold">
                    {active.type === "DIRECT"
                      ? active.members.find((m) => m.id !== user?.id)?.name
                      : active.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {active.type === "DIRECT"
                      ? active.members.find((m) => m.id !== user?.id)?.jobTitle || "همکار"
                      : `${faNum(active.members.length)} عضو`}
                  </p>
                </div>
                <Badge variant="secondary" className="ms-auto text-[10px]">
                  {active.type === "DIRECT" ? "گفتگوی خصوصی" : active.type === "CHANNEL" ? "کانال اطلاع‌رسانی" : "گروه کاری"}
                </Badge>
              </div>

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3">
                  {messages.map((m) => {
                    const mine = m.senderId === user?.id;
                    return (
                      <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                        {!mine && (
                          <Avatar className="size-7 shrink-0 mt-1">
                            <AvatarFallback className="text-[10px] text-white" style={{ backgroundColor: m.sender.avatarColor }}>
                              {m.sender.name.slice(0, 1)}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div
                          className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${
                            mine ? "bg-primary text-primary-foreground rounded-bl-md" : "bg-muted rounded-br-md"
                          }`}
                        >
                          {!mine && active.type !== "DIRECT" && (
                            <p className="text-[10px] font-medium opacity-70 mb-0.5">{m.sender.name}</p>
                          )}
                          {m.pinned && <Pin className="inline size-3 me-1 opacity-70" />}
                          <p className="text-sm leading-7 whitespace-pre-wrap break-words">{m.content}</p>
                          <p className={`text-[9px] mt-0.5 ${mine ? "text-white/70 text-left" : "text-muted-foreground"}`}>
                            {formatTime(m.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>

              <div className="border-t p-3 flex gap-2">
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                  placeholder="پیام خود را بنویسید…"
                />
                <Button size="icon" onClick={send} disabled={sending} aria-label="ارسال">
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* گفتگوی جدید */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>گفتگوی جدید</DialogTitle>
            <DialogDescription>
              گفتگوی خصوصی بسازید یا گروه کاری/کانال اطلاع‌رسانی تشکیل دهید.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "DIRECT", label: "خصوصی", icon: MessageCircle },
                { key: "GROUP", label: "گروه", icon: Users },
                { key: "CHANNEL", label: "کانال", icon: Megaphone },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setNewType(t.key)}
                  className={`rounded-xl border p-3 text-center space-y-1 transition-colors ${
                    newType === t.key ? "border-primary bg-primary/5" : "hover:bg-accent"
                  }`}
                >
                  <t.icon className="size-5 mx-auto" />
                  <p className="text-xs">{t.label}</p>
                </button>
              ))}
            </div>
            {newType !== "DIRECT" && (
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={newType === "CHANNEL" ? "نام کانال" : "نام گروه"}
              />
            )}
            <div className="space-y-1.5">
              <p className="text-xs font-medium">
                {newType === "DIRECT" ? "انتخاب مخاطب" : "انتخاب اعضا"}
              </p>
              <div className="max-h-48 overflow-y-auto rounded-xl border p-2 space-y-1">
                {allUsers
                  .filter((u) => u.id !== user?.id)
                  .map((u) => (
                    <label key={u.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent cursor-pointer text-sm">
                      <Checkbox
                        checked={newMembers.includes(u.id)}
                        onCheckedChange={(v) =>
                          setNewMembers((cur) =>
                            newType === "DIRECT" ? (v ? [u.id] : []) : v ? [...cur, u.id] : cur.filter((x) => x !== u.id)
                          )
                        }
                      />
                      <span className="size-2 rounded-full" style={{ backgroundColor: u.avatarColor }} />
                      {u.name}
                      <span className="text-[10px] text-muted-foreground">{u.jobTitle || u.unit}</span>
                    </label>
                  ))}
              </div>
            </div>
            <Button className="w-full" onClick={createConv}>
              ایجاد گفتگو
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
