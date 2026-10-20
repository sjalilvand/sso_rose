"use client";

/** فراخوانی یکدست API با مدیریت خطای فارسی */
export async function api<T = unknown>(
  url: string,
  options?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(url, {
    method: options?.method || "GET",
    headers: options?.body ? { "Content-Type": "application/json" } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || "خطا در ارتباط با سرور");
  }
  return data as T;
}

export const PRIORITIES: Record<string, { label: string; color: string }> = {
  LOW: { label: "کم", color: "#64748b" },
  MEDIUM: { label: "متوسط", color: "#0f766e" },
  HIGH: { label: "زیاد", color: "#d97706" },
  URGENT: { label: "فوری", color: "#dc2626" },
};

export const TASK_STATUSES: Record<string, { label: string; color: string }> = {
  NEW: { label: "جدید", color: "#0369a1" },
  IN_PROGRESS: { label: "در حال انجام", color: "#7c3aed" },
  IN_REVIEW: { label: "منتظر بررسی", color: "#d97706" },
  DONE: { label: "تکمیل‌شده", color: "#0f766e" },
  CANCELLED: { label: "لغوشده", color: "#64748b" },
};

export const IMPORTANCE: Record<string, { label: string; color: string; bg: string }> = {
  NORMAL: { label: "عادی", color: "#0f766e", bg: "#e0f2f1" },
  IMPORTANT: { label: "مهم", color: "#d97706", bg: "#fef3c7" },
  URGENT: { label: "فوری", color: "#dc2626", bg: "#fee2e2" },
};

export const EVENT_TYPES: Record<string, { label: string; color: string }> = {
  MEETING: { label: "جلسه", color: "#c2185b" },
  EVENT: { label: "رویداد", color: "#7c3aed" },
  CLASS: { label: "کلاس", color: "#0369a1" },
  DEADLINE: { label: "مهلت", color: "#dc2626" },
  OTHER: { label: "سایر", color: "#64748b" },
};
