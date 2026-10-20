import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, ApiError } from "@/lib/auth";
import { apiError, json } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";

/**
 * داشبورد گزارش‌ها — گزارش‌های مدیریتی تفکیک‌شده از داده‌های بالینی
 * گزارش‌های شخصی برای همه، گزارش‌های سازمانی برای مدیران
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const canManage = hasPermission(user.role, "tasks.manageAll");

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // وظایف
    const tasks = await db.task.findMany({
      where: canManage ? {} : { assigneeId: user.id },
      select: { status: true, priority: true, dueDate: true, completedAt: true, createdAt: true },
    });
    const taskStats = {
      total: tasks.length,
      byStatus: {
        NEW: tasks.filter((t) => t.status === "NEW").length,
        IN_PROGRESS: tasks.filter((t) => t.status === "IN_PROGRESS").length,
        IN_REVIEW: tasks.filter((t) => t.status === "IN_REVIEW").length,
        DONE: tasks.filter((t) => t.status === "DONE").length,
        CANCELLED: tasks.filter((t) => t.status === "CANCELLED").length,
      },
      byPriority: {
        LOW: tasks.filter((t) => t.priority === "LOW").length,
        MEDIUM: tasks.filter((t) => t.priority === "MEDIUM").length,
        HIGH: tasks.filter((t) => t.priority === "HIGH").length,
        URGENT: tasks.filter((t) => t.priority === "URGENT").length,
      },
      overdue: tasks.filter(
        (t) => t.dueDate && new Date(t.dueDate) < now && t.status !== "DONE" && t.status !== "CANCELLED"
      ).length,
      completedThisMonth: tasks.filter((t) => t.completedAt && t.completedAt >= monthStart).length,
    };

    // کاربران و دسترسی‌ها
    let userStats = null;
    if (hasPermission(user.role, "reports.view")) {
      const users = await db.user.findMany({ select: { status: true, role: true, unit: true, lastLoginAt: true } });
      const access = await db.systemAccess.findMany();
      const anns = await db.announcement.findMany({
        where: { publishAt: { gte: monthStart } },
        include: { acks: true },
      });
      userStats = {
        total: users.length,
        active: users.filter((u) => u.status === "ACTIVE").length,
        suspended: users.filter((u) => u.status === "SUSPENDED").length,
        inactive: users.filter((u) => u.status === "INACTIVE").length,
        byRole: {
          SUPER_ADMIN: users.filter((u) => u.role === "SUPER_ADMIN").length,
          UNIT_MANAGER: users.filter((u) => u.role === "UNIT_MANAGER").length,
          THERAPIST: users.filter((u) => u.role === "THERAPIST").length,
          STAFF: users.filter((u) => u.role === "STAFF").length,
          TEACHER: users.filter((u) => u.role === "TEACHER").length,
          EXTERNAL: users.filter((u) => u.role === "EXTERNAL").length,
        },
        accessCount: access.length,
        announcementsThisMonth: anns.length,
        announcementAckRate:
          anns.length > 0
            ? Math.round(
                (anns.filter((a) => a.acks.some((x) => x.acknowledgedAt)).length / anns.length) * 100
              )
            : 0,
      };
    }

    // رویدادهای پیش‌رو
    const upcomingEvents = await db.calendarEvent.count({
      where: {
        start: { gte: now },
        OR: [{ ownerId: user.id }, { attendees: { some: { userId: user.id } } }],
      },
    });

    return json({
      taskStats,
      userStats,
      upcomingEvents,
      dataSource: "پایگاه داده رز هاب",
      lastUpdated: now.toISOString(),
      scopeNote: canManage ? "گزارش سازمانی" : "گزارش شخصی",
    });
  } catch (e) {
    return apiError(e);
  }
}
