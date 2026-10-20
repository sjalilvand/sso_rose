"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { api } from "@/lib/client";
import { useSession, useSessionInit } from "@/components/providers";
import { ROLE_LABELS } from "@/lib/permissions";
import {
  LayoutDashboard,
  Grid2X2,
  MessagesSquare,
  Megaphone,
  ListChecks,
  CalendarDays,
  BarChart3,
  StickyNote,
  Shield,
  Search,
  Bell,
  Moon,
  Sun,
  LogOut,
  UserRound,
  Settings,
  Loader2,
} from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatFullJalali } from "@/lib/jalali";

interface SearchResult {
  type: string;
  id: string;
  title: string;
  href: string;
}

const TYPE_LABELS: Record<string, string> = {
  task: "وظیفه",
  announcement: "اطلاعیه",
  note: "یادداشت",
  event: "رویداد",
};

function GlobalSearch() {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  React.useEffect(() => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`);
        setResults(data.results);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 rounded-xl border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors min-w-56"
      >
        <Search className="size-4" />
        جستجو در رز هاب…
        <kbd className="text-[10px] bg-background border rounded px-1.5 py-0.5 ms-auto font-mono">Ctrl+K</kbd>
      </button>
      <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setOpen(true)} aria-label="جستجو">
        <Search className="size-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden" dir="rtl">
          <DialogHeader className="sr-only">
            <DialogTitle>جستجوی سراسری</DialogTitle>
          </DialogHeader>
          <div className="border-b p-3">
            <Input
              autoFocus
              placeholder="جستجوی وظایف، اطلاعیه‌ها، یادداشت‌ها و رویدادها…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-11 border-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {loading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
                <Loader2 className="size-4 animate-spin" /> در حال جستجو…
              </div>
            )}
            {!loading && q.length >= 2 && results.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">نتیجه‌ای یافت نشد</p>
            )}
            {!loading && q.length < 2 && (
              <p className="text-center text-xs text-muted-foreground py-8">
                حداقل ۲ نویسه وارد کنید — جستجو با رعایت سطح دسترسی شما انجام می‌شود
              </p>
            )}
            {results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => {
                  setOpen(false);
                  router.push(r.href);
                }}
                className="w-full text-right flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent transition-colors"
              >
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {TYPE_LABELS[r.type] || r.type}
                </Badge>
                <span className="text-sm truncate">{r.title}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NotificationsMenu() {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<
    { id: string; title: string; body: string; link: string; read: boolean; type: string }[]
  >([]);
  const { unreadNotifications, setUnreadNotifications } = useSession();
  const router = useRouter();

  const load = React.useCallback(async () => {
    try {
      const data = await api<{
        notifications: { id: string; title: string; body: string; link: string; read: boolean; type: string }[];
        unread: number;
      }>("/api/notifications");
      setItems(data.notifications);
      setUnreadNotifications(data.unread);
    } catch {
      // بی‌صدا
    }
  }, [setUnreadNotifications]);

  React.useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function markAll() {
    await api("/api/notifications", { method: "POST", body: {} });
    await load();
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="اعلان‌ها">
          <Bell className="size-5" />
          {unreadNotifications > 0 && (
            <span className="absolute -top-0.5 -left-0.5 size-4 rounded-full bg-rose-600 text-white text-[10px] flex items-center justify-center">
              {unreadNotifications > 9 ? "۹+" : unreadNotifications}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm font-semibold">اعلان‌ها</span>
          <button onClick={markAll} className="text-xs text-primary hover:underline">
            خواندن همه
          </button>
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-6">اعلان جدیدی نیست</p>
        )}
        {items.map((n) => (
          <DropdownMenuItem
            key={n.id}
            className={`flex flex-col items-start gap-0.5 py-2.5 cursor-pointer ${!n.read ? "bg-primary/5" : ""}`}
            onClick={() => {
              setOpen(false);
              api("/api/notifications", { method: "POST", body: { id: n.id } });
              if (n.link) router.push(n.link);
            }}
          >
            <span className="text-sm font-medium">{n.title}</span>
            <span className="text-xs text-muted-foreground line-clamp-1">{n.body}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="تغییر حالت روشن/تاریک"
    >
      {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  );
}

function ProfileMenu() {
  const { user } = useSession();
  const router = useRouter();
  if (!user) return null;

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const initials = user.name.split(" ").slice(0, 2).map((p: string) => p[0]).join("");

  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full hover:bg-accent p-1 ps-2 transition-colors">
          <div className="hidden md:block text-right leading-tight">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-[11px] text-muted-foreground">{ROLE_LABELS[user.role] || user.role}</p>
          </div>
          <Avatar className="size-9">
            <AvatarFallback style={{ backgroundColor: user.avatarColor }} className="text-white text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <p>{user.name}</p>
          <p dir="ltr" className="text-xs text-muted-foreground font-normal">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/profile")} className="cursor-pointer">
          <UserRound className="size-4 ms-0 me-2" /> پروفایل و نشست‌ها
        </DropdownMenuItem>
        {(user.role === "SUPER_ADMIN") && (
          <DropdownMenuItem onClick={() => router.push("/admin/users")} className="cursor-pointer">
            <Settings className="size-4 ms-0 me-2" /> مدیریت سامانه
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
          <LogOut className="size-4 ms-0 me-2" /> خروج از حساب
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const NAV_MAIN = [
  { href: "/", label: "داشبورد", icon: LayoutDashboard },
  { href: "/systems", label: "سامانه‌ها", icon: Grid2X2 },
  { href: "/messages", label: "گفتگوها", icon: MessagesSquare },
  { href: "/announcements", label: "اطلاعیه‌ها", icon: Megaphone },
  { href: "/tasks", label: "وظایف", icon: ListChecks },
  { href: "/calendar", label: "تقویم", icon: CalendarDays },
  { href: "/notes", label: "یادداشت‌ها", icon: StickyNote },
  { href: "/reports", label: "گزارش‌ها", icon: BarChart3 },
];

export function PanelShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useSession();
  useSessionInit();

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Image src="/logo.svg" alt="رز هاب" width={56} height={56} className="animate-pulse" />
          <p className="text-sm text-muted-foreground">در حال بارگذاری رز هاب…</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider dir="rtl">
      <Sidebar side="right" collapsible="icon" className="border-s">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip="رز هاب">
                <Link href="/">
                  <div className="flex items-center justify-center size-8 rounded-lg bg-primary/10">
                    <Image src="/logo.svg" alt="لوگو" width={22} height={22} />
                  </div>
                  <div className="flex flex-col leading-tight">
                    <span className="font-bold">رز هاب</span>
                    <span className="text-[10px] text-muted-foreground">مجموعه رز سفید</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>فضای کاری</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_MAIN.map((item) => {
                  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {user.role === "SUPER_ADMIN" && (
            <SidebarGroup>
              <SidebarGroupLabel>مدیریت</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname.startsWith("/admin/users")} tooltip="کاربران و مجوزها">
                      <Link href="/admin/users">
                        <Shield />
                        <span>کاربران و مجوزها</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname.startsWith("/admin/systems")} tooltip="مدیریت سامانه‌ها">
                      <Link href="/admin/systems">
                        <Grid2X2 />
                        <span>مدیریت سامانه‌ها</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname.startsWith("/admin/audit")} tooltip="گزارش فعالیت‌ها">
                      <Link href="/admin/audit">
                        <Settings />
                        <span>گزارش فعالیت‌ها</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>
        <SidebarFooter>
          <div className="px-3 py-2 text-[10px] text-muted-foreground leading-relaxed group-data-[collapsible=icon]:hidden">
            نسخه ۱.۰ — پیش‌نویس اجرایی
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/80 backdrop-blur px-4">
          <SidebarTrigger className="lg:hidden" aria-label="بازکردن منو" />
          <div className="hidden md:block text-sm text-muted-foreground">{formatFullJalali(new Date())}</div>
          <div className="ms-auto flex items-center gap-1.5">
            <GlobalSearch />
            <NotificationsMenu />
            <ThemeToggle />
            <ProfileMenu />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
        <footer className="border-t py-4 px-6 text-center text-xs text-muted-foreground mt-auto">
          رز هاب — درگاه یکپارچه مدیریت، ارتباطات و همکاری مجموعه رز سفید
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
