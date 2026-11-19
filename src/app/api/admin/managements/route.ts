import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, audit, ApiError } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";

/**
 * مدیریت‌های سازمانی — بند ۴
 * ثبت مدیریت، تعیین مدیر آن و مشاهدهٔ کارکنان هر مدیریت
 * GET  /api/admin/managements
 * POST /api/admin/managements  { name, description?, centerId?, managerId? }
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const managements = await db.management.findMany({
      include: {
        manager: { select: { id: true, name: true, avatarColor: true, jobTitle: true } },
        center: { select: { id: true, name: true, type: true } },
        members: { select: { id: true, name: true, avatarColor: true, role: true, jobTitle: true, status: true } },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return json({ managements });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireAuth(req);
    if (!hasPermission(me.role, "users.manage"))
      throw new ApiError("شما مجوز مدیریت سازمان را ندارید", 403);

    const body = await readBody<{ name?: string; description?: string; centerId?: string | null; managerId?: string | null }>(req);
    const name = (body.name || "").trim();
    if (!name) throw new ApiError("نام مدیریت الزامی است", 400);
    const dup = await db.management.findUnique({ where: { name } });
    if (dup) throw new ApiError("مدیریتی با این نام قبلاً ثبت شده است", 409);

    const mg = await db.management.create({
      data: {
        name,
        description: (body.description || "").trim(),
        centerId: body.centerId || null,
        managerId: body.managerId || null,
      },
      include: { manager: { select: { id: true, name: true } } },
    });

    // مدیر مدیریت به‌صورت خودکار عضو همان مدیریت می‌شود
    if (body.managerId) {
      await db.user.updateMany({
        where: { id: body.managerId, managementId: null },
        data: { managementId: mg.id },
      });
    }

    await audit({
      userId: me.id, userName: me.name, action: "ایجاد مدیریت", entity: "Management",
      details: `${name}${mg.manager ? " — مدیر: " + mg.manager.name : ""}`,
    });
    return json({ management: mg }, 201);
  } catch (e) {
    return apiError(e);
  }
}
