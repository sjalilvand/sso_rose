import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, audit, ApiError } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";

/** ویرایش / حذف مدیریت سازمانی — بند ۴ + اتصال چندمرکزی (فاز ۷۴) */

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireAuth(req);
    if (!hasPermission(me.role, "users.manage"))
      throw new ApiError("شما مجوز مدیریت سازمان را ندارید", 403);
    const { id } = await ctx.params;
    const current = await db.management.findUnique({ where: { id } });
    if (!current) throw new ApiError("مدیریت یافت نشد", 404);

    const body = await readBody<{
      name?: string; description?: string; centerIds?: string[]; centerId?: string | null;
      managerId?: string | null; isActive?: boolean; setManagerOnCenters?: boolean;
    }>(req);
    if (body.name !== undefined && body.name.trim() && body.name.trim() !== current.name) {
      const dup = await db.management.findUnique({ where: { name: body.name.trim() } });
      if (dup) throw new ApiError("مدیریتی با این نام قبلاً ثبت شده است", 409);
    }

    // مراکز انتخاب‌شده باید واقعاً موجود باشند
    const centerIds = body.centerIds !== undefined
      ? [...new Set((body.centerIds || []).filter(Boolean))]
      : undefined;
    if (centerIds && centerIds.length) {
      const found = await db.center.count({ where: { id: { in: centerIds } } });
      if (found !== centerIds.length) throw new ApiError("یکی از مراکز انتخاب‌شده یافت نشد", 400);
    }

    const mg = await db.management.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() || current.name } : {}),
        ...(body.description !== undefined ? { description: body.description.trim() } : {}),
        // مرکز اصلی (سازگاری با نسخهٔ قبل) = اولین مرکز انتخاب‌شده
        ...(centerIds !== undefined
          ? { centerId: centerIds[0] || (body.centerId !== undefined ? body.centerId : null) }
          : body.centerId !== undefined ? { centerId: body.centerId || null } : {}),
        ...(centerIds !== undefined
          ? { links: { deleteMany: {}, create: centerIds.map((centerId) => ({ centerId })) } }
          : {}),
        ...(body.managerId !== undefined ? { managerId: body.managerId || null } : {}),
        ...(body.isActive !== undefined ? { isActive: !!body.isActive } : {}),
      },
    });

    // گزینهٔ اختیاری: مدیر انتخابی به‌عنوان مدیرِ مراکز انتخاب‌شده هم ثبت شود
    if (body.setManagerOnCenters && body.managerId && centerIds && centerIds.length) {
      await db.center.updateMany({
        where: { id: { in: centerIds } },
        data: { managerId: body.managerId },
      });
    }

    await audit({
      userId: me.id, userName: me.name, action: "ویرایش مدیریت", entity: "Management",
      details: `${mg.name}${centerIds ? " — مراکز: " + centerIds.length : ""}`,
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
