import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, ApiError } from "@/lib/auth";
import { apiError, json } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { subordinateIds } from "@/lib/team";

/**
 * زیرمجموعه‌های من — بند ۳: «وظایف هر کس برای خودش و یک مدیر برای زیرمجموعه‌های خودش»
 *
 * GET /api/team — فهرست زیرمجموعه‌های مستقیم و چندسطحی + خلاصهٔ وظایف هر نفر
 * مدیر کل: کل سازمان؛ مدیر واحد / هر مدیر خطی: زیرمجموعه‌های خودش
 */
export async function GET(req: NextRequest) {
  try {
    const me = await requireAuth(req);
    const isGlobal = me.role === "SUPER_ADMIN";
    const subIds = isGlobal ? [] : await subordinateIds(me.id);

    const where = isGlobal ? {} : { id: { in: subIds } };
    const people = await db.user.findMany({
      where,
      select: {
        id: true, name: true, username: true, avatarColor: true, role: true,
        jobTitle: true, unit: true, status: true, lastLoginAt: true,
        managerId: true, managementId: true,
        clinic: true, province: true,
        management: { select: { name: true } },
        manager: { select: { name: true } },
      },
      orderBy: [{ unit: "asc" }, { name: "asc" }],
    });

    // خلاصهٔ وظایف هر زیرمجموعه
    const taskRows = await db.task.findMany({
      where: isGlobal ? {} : { assigneeId: { in: subIds } },
      select: {
        assigneeId: true, status: true, dueDate: true,
      },
    });
    const now = new Date();
    const stats: Record<string, { total: number; open: number; done: number; overdue: number }> = {};
    for (const t of taskRows) {
      const s = (stats[t.assigneeId] ||= { total: 0, open: 0, done: 0, overdue: 0 });
      s.total++;
      if (t.status === "DONE") s.done++;
      else if (t.status !== "CANCELLED") {
        s.open++;
        if (t.dueDate && new Date(t.dueDate) < now) s.overdue++;
      }
    }

    return json({
      me: { id: me.id, name: me.name, role: me.role },
      isGlobal,
      directCount: (await db.user.count({ where: { managerId: me.id } })),
      members: people.map((p) => ({ ...p, taskStats: stats[p.id] || { total: 0, open: 0, done: 0, overdue: 0 } })),
    });
  } catch (e) {
    return apiError(e);
  }
}

/** PATCH /api/team — تغییر مدیر مستقیم یک زیرمجموعه (فقط مدیر کل) */
export async function PATCH(req: NextRequest) {
  try {
    const me = await requireAuth(req);
    if (!hasPermission(me.role, "users.manage"))
      throw new ApiError("شما مجوز تغییر ساختار سازمانی را ندارید", 403);
    const body = (await req.json().catch(() => ({}))) as { userId?: string; managerId?: string | null };
    if (!body.userId) throw new ApiError("شناسهٔ کاربر الزامی است", 400);
    if (body.userId === body.managerId)
      throw new ApiError("یک نفر نمی‌تواند مدیر خودش باشد", 400);
    await db.user.update({
      where: { id: body.userId },
      data: { managerId: body.managerId || null },
    });
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
