// نقش‌ها و سطح دسترسی — بر پایه بند ۶ سند «رز هاب»

export type Role =
  | "SUPER_ADMIN"
  | "UNIT_MANAGER"
  | "THERAPIST"
  | "STAFF"
  | "TEACHER"
  | "EXTERNAL";

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "مدیر کل",
  UNIT_MANAGER: "مدیر واحد",
  THERAPIST: "درمانگر / کارشناس",
  STAFF: "پذیرش و پشتیبانی",
  TEACHER: "مدرس / همکار آموزشی",
  EXTERNAL: "کاربر بیرونی",
};

export const ROLE_COLORS: Record<Role, string> = {
  SUPER_ADMIN: "#9c27b0",
  UNIT_MANAGER: "#0f766e",
  THERAPIST: "#c2185b",
  STAFF: "#d97706",
  TEACHER: "#0369a1",
  EXTERNAL: "#64748b",
};

/** مجوزهای قابل اعطا بر اساس نقش — کنترل سمت سرور اجباری است */
export type Permission =
  | "users.manage" // تعریف، ویرایش، تعلیق کاربران
  | "systems.manage" // مدیریت سامانه‌ها و اتصال‌ها
  | "announcements.publish" // انتشار اطلاعیه
  | "tasks.manageAll" // مدیریت وظایف همه کارکنان
  | "reports.view" // گزارش‌های مدیریتی
  | "audit.view" // گزارش فعالیت‌های حساس
  | "chat.manage" // مدیریت گروه‌ها و کانال‌ها
  | "notes.shared" // یادداشت مشترک
  | "external.panel"; // پنل محدود کاربر بیرونی

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [
    "users.manage",
    "systems.manage",
    "announcements.publish",
    "tasks.manageAll",
    "reports.view",
    "audit.view",
    "chat.manage",
    "notes.shared",
  ],
  UNIT_MANAGER: [
    "announcements.publish",
    "tasks.manageAll",
    "reports.view",
    "chat.manage",
    "notes.shared",
  ],
  THERAPIST: ["notes.shared"],
  STAFF: [],
  TEACHER: ["notes.shared"],
  EXTERNAL: ["external.panel"],
};

export function hasPermission(role: string, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role as Role] || []).includes(permission);
}

export const UNITS = [
  "مدیریت",
  "درمان",
  "آموزش",
  "پذیرش",
  "پشتیبانی",
  "فنی و توسعه",
];

export const UNIT_COLORS: Record<string, string> = {
  "مدیریت": "#9c27b0",
  "درمان": "#c2185b",
  "آموزش": "#0369a1",
  "پذیرش": "#d97706",
  "پشتیبانی": "#0f766e",
  "فنی و توسعه": "#6366f1",
  "عمومی": "#64748b",
};
