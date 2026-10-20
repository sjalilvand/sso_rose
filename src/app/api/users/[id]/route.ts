import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hashPassword, audit, ApiError } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";

/** ویرایش کاربر (و مجوزهای سامانه‌ها) */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireAuth(req);
    const { id } = await ctx.params;
    if (!hasPermission(me.role, "users.manage") && me.id !== id)
      throw new ApiError("شما مجوز ویرایش این کاربر را ندارید", 403);

    const body = await readBody<{
      name?: string;
      role?: string;
      unit?: string;
      jobTitle?: string;
      phone?: string;
      avatarColor?: string;
      status?: string;
      password?: string;
      systemIds?: string[];
    }>(req);

    const target = await db.user.findUnique({ where: { id } });
    if (!target) throw new ApiError("کاربر یافت نشد", 404);

    const data: Record<string, unknown> = {};
    if (body.name) data.name = body.name;
    if (body.role && hasPermission(me.role, "users.manage")) data.role = body.role;
    if (body.unit) data.unit = body.unit;
    if (body.jobTitle !== undefined) data.jobTitle = body.jobTitle;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.avatarColor) data.avatarColor = body.avatarColor;
    if (body.status && hasPermission(me.role, "users.manage")) {
      if (id === me.id && body.status !== "ACTIVE")
        throw new ApiError("تغییر وضعیت حساب خودتان مجاز نیست", 400);
      data.status = body.status;
    }
    if (body.password) {
      if (body.password.length < 8) throw new ApiError("رمز عبور باید حداقل ۸ نویسه باشد", 400);
      data.passwordHash = hashPassword(body.password);
    }

    await db.user.update({ where: { id }, data });

    // به‌روزرسانی مجوزهای سامانه‌ها
    if (body.systemIds && hasPermission(me.role, "users.manage")) {
      await db.systemAccess.deleteMany({ where: { userId: id } });
      if (body.systemIds.length) {
        await db.systemAccess.createMany({
          data: body.systemIds.map((systemId) => ({ userId: id, systemId })),
        });
      }
    }

    await audit({
      userId: me.id,
      userName: me.name,
      action: "ویرایش کاربر",
      entity: "user",
      details: target.name,
    });
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

/** غیرفعال‌سازی کاربر */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireAuth(req);
    if (!hasPermission(me.role, "users.manage"))
      throw new ApiError("شما مجوز مدیریت کاربران را ندارید", 403);
    const { id } = await ctx.params;
    if (id === me.id) throw new ApiError("حذف حساب خودتان مجاز نیست", 400);

    const target = await db.user.findUnique({ where: { id } });
    if (!target) throw new ApiError("کاربر یافت نشد", 404);

    await db.user.update({ where: { id }, data: { status: "INACTIVE" } });
    await db.session.updateMany({ where: { userId: id }, data: { revoked: true } });
    await audit({
      userId: me.id,
      userName: me.name,
      action: "غیرفعال‌سازی کاربر",
      entity: "user",
      details: target.name,
    });
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
