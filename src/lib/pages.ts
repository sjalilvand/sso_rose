/**
 * رجیستری صفحات پنل — فاز ۷۳ (دسترسی سطح کاربر)
 *
 * کلید هر صفحه برای PagePermission در پایگاه داده است؛ با href پنل یکسان نگه داشته می‌شود.
 * مد پیش‌فرض: همهٔ صفحات برای همه مجازند؛ PagePermission فقط «ممنوع‌سازی» ثبت می‌کند.
 * مدیر کل (SUPER_ADMIN) همیشه به همهٔ صفحات دسترسی دارد.
 */

export interface PageDef {
  key: string;
  label: string;
  href: string;
  group: "workspace" | "admin";
}

export const PANEL_PAGES: PageDef[] = [
  { key: "home", label: "داشبورد", href: "/", group: "workspace" },
  { key: "systems", label: "سامانه‌ها", href: "/systems", group: "workspace" },
  { key: "messages", label: "گفتگوها", href: "/messages", group: "workspace" },
  { key: "announcements", label: "اطلاعیه‌ها", href: "/announcements", group: "workspace" },
  { key: "tasks", label: "وظایف", href: "/tasks", group: "workspace" },
  { key: "calendar", label: "تقویم", href: "/calendar", group: "workspace" },
  { key: "notes", label: "یادداشت‌ها", href: "/notes", group: "workspace" },
  { key: "reports", label: "گزارش‌ها", href: "/reports", group: "workspace" },
  { key: "team", label: "زیرمجموعه‌ها", href: "/team", group: "workspace" },
  { key: "profile", label: "پروفایل من", href: "/profile", group: "workspace" },
  { key: "admin.registrations", label: "درخواست‌های ثبت‌نام", href: "/admin/registrations", group: "admin" },
  { key: "admin.users", label: "کاربران و مجوزها", href: "/admin/users", group: "admin" },
  { key: "admin.centers", label: "اطلاعات پایهٔ مراکز", href: "/admin/centers", group: "admin" },
  { key: "admin.managements", label: "مدیریت‌های سازمانی", href: "/admin/managements", group: "admin" },
  { key: "admin.systems", label: "مدیریت سامانه‌ها", href: "/admin/systems", group: "admin" },
  { key: "admin.audit", label: "گزارش فعالیت‌ها", href: "/admin/audit", group: "admin" },
  { key: "sso-docs", label: "مستندات اتصال SSO", href: "/sso-docs", group: "admin" },
];

/** کلید صفحه از مسیر فعلی — طولانی‌ترین تطبیق (مثل /admin/users) */
export function pageKeyForPath(pathname: string): string | null {
  let best: PageDef | null = null;
  for (const p of PANEL_PAGES) {
    const match = p.href === "/" ? pathname === "/" : pathname === p.href || pathname.startsWith(p.href + "/");
    if (match && (!best || p.href.length > best.href.length)) best = p;
  }
  return best?.key ?? null;
}

/** نقشهٔ دسترسی پیش‌فرض — همه مجاز */
export function defaultPageAccess(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const p of PANEL_PAGES) out[p.key] = true;
  return out;
}
