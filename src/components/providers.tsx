"use client";

import { ThemeProvider } from "next-themes";
import { create } from "zustand";
import { useEffect } from "react";

// ---------- فروشگاه نشست کاربر ----------

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  unit: string;
  jobTitle: string;
  avatarColor: string;
  twoFactorEnabled: boolean;
  phone: string;
}

export interface SessionSystem {
  id: string;
  name: string;
  url: string;
  color: string;
  icon: string;
}

interface SessionState {
  user: SessionUser | null;
  systems: SessionSystem[];
  permissions: Record<string, boolean>;
  unreadNotifications: number;
  unreadConversations: number;
  loading: boolean;
  refresh: () => Promise<void>;
  setUnreadNotifications: (n: number) => void;
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  systems: [],
  permissions: {},
  unreadNotifications: 0,
  unreadConversations: 0,
  loading: true,
  setUnreadNotifications: (n) => set({ unreadNotifications: n }),
  refresh: async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json();
      set({
        user: data.user,
        systems: data.systems || [],
        permissions: data.permissions || {},
        unreadNotifications: data.unreadNotifications || 0,
        unreadConversations: data.unreadConversations || 0,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },
}));

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}

/** قلاب بارگذاری نشست در صفحات پنل */
export function useSessionInit() {
  const { refresh, loading } = useSession();
  useEffect(() => {
    if (loading) refresh();
  }, [loading, refresh]);
  return { loading };
}
