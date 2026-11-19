import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, audit, ApiError } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";

/** ویرایش / حذف مدیریت سازمانی — بند ۴ */

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireAuth(req);
    if (!hasPermission(me.role, "users.manage"))
      throw new ApiError("شما مجوز مدیریت سازمان را ندارید", 403);
    const { id } = await ctx.params;
    const current = await db.management.findUnique({ where: { id } });
    if (!current) throw new ApiError("مدیریت یافت نشد", 404);

    const body = await readBody<{ name?: string; description?: string; centerId?: string | null; managerId?: string | null; isActive?: boolean }>(req);
    if (body.name !== undefined && body.name.trim() && body.name.trim() !== current.name) {
      const dup = await db.management.findUnique({ where: { name: body.name.trim() } });
      if (dup) throw new ApiError("مدیریتی با این نام قبلاً ثبت شده است", 409);
    }

    const mg = await db.management.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() || current.name } : {}),
        ...(body.description !== undefined ? { description: body.description.trim() } : {}),
        ...(body.centerId !== undefined ? { centerId: body.centerId || null } : {}),
        ...(body.managerId !== undefined ? { managerId: body.managerId || null } : {}),
        ...(body.isActive !== undefined ? { isActive: !!body.isActive } : {}),
      },
    });

    await audit({
      userId: me.id, userName: me.name, action: "ویرایش مدیریت", entity: "Management", details: mg.name,
    });
    return json({ management: mg });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireAuth(req);
    if (!hasPermission(me.role, "users.manage"))
      throw new ApiError("شما مجوز مدیریت سازمان را ندارید", 403);
    const { id } = await ctx.params;
    const mg = await db.management.findUnique({ where: { id }, include: { _count: { select: { members: true } } } });
    if (!mg) throw new ApiError("مدیریت یافت نشد", 404);
    if (mg._count.members > 0)
      throw new ApiError(`${mg._count.members} کاربر به این مدیریت متصل است؛ ابتدا اتصال آن‌ها را تغییر دهید`, 409);

    await db.management.delete({ where: { id } });
    await audit({
      userId: me.id, userName: me.name, action: "حذف مدیریت", entity: "Management", details: mg.name,
    });
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
