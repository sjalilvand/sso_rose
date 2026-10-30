import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hashPassword, audit, ApiError } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** ویرایش کامل کاربر (مشخصات، ایمیل، رمز، وضعیت، نقش و مجوزهای سامانه‌ها) */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireAuth(req);
    const { id } = await ctx.params;
    const isManager = hasPermission(me.role, "users.manage");
    if (!isManager && me.id !== id)
      throw new ApiError("شما مجوز ویرایش این کاربر را ندارید", 403);

    const body = await readBody<{
      name?: string;
      email?: string;
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

    // تغییر ایمیل — فقط مدیر؛ با اعتبارسنجی و بررسی تکراری نبودن
    if (body.email !== undefined) {
      if (!isManager) throw new ApiError("تغییر ایمیل فقط توسط مدیر ممکن است", 403);
      const email = body.email.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) throw new ApiError("قالب ایمیل معتبر نیست", 400);
      if (email !== target.email) {
        const dup = await db.user.findUnique({ where: { email } });
        if (dup) throw new ApiError("این ایمیل قبلاً برای کاربر دیگری ثبت شده است", 409);
        data.email = email;
      }
    }

    if (body.role && isManager) data.role = body.role;
    if (body.unit) data.unit = body.unit;
    if (body.jobTitle !== undefined) data.jobTitle = body.jobTitle;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.avatarColor) data.avatarColor = body.avatarColor;
    if (body.status && isManager) {
      if (id === me.id && body.status !== "ACTIVE")
        throw new ApiError("تغییر وضعیت حساب خودتان مجاز نیست", 400);
      data.status = body.status;
    }
    if (body.password) {
      if (body.password.length < 8) throw new ApiError("رمز عبور باید حداقل ۸ نویسه باشد", 400);
      data.passwordHash = hashPassword(body.password);
    }

    if (Object.keys(data).length) {
      await db.user.update({ where: { id }, data });
    }

    // به‌روزرسانی مجوزهای سامانه‌ها
    if (body.systemIds && isManager) {
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
      details: `${data.name || target.name}${data.email ? ` — ایمیل جدید: ${data.email}` : ""}`,
    });
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

/**
 * حذف کاربر:
 *  - بدون پارامتر (پیش‌فرض): غیرفعال‌سازی نرم (حفظ سوابق)
 *  - با ?hard=1: حذف کامل کاربر و داده‌های وابسته او
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireAuth(req);
    if (!hasPermission(me.role, "users.manage"))
      throw new ApiError("شما مجوز مدیریت کاربران را ندارید", 403);
    const { id } = await ctx.params;
    if (id === me.id) throw new ApiError("حذف حساب خودتان مجاز نیست", 400);

    const target = await db.user.findUnique({ where: { id } });
    if (!target) throw new ApiError("کاربر یافت نشد", 404);

    const hard = new URL(req.url).searchParams.get("hard") === "1";

    if (!hard) {
      // غیرفعال‌سازی نرم — سوابق حفظ می‌شود
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
    }

    // ---------- حذف کامل ----------
    // محافظت: آخرین مدیر کل فعال حذف نمی‌شود
    if (target.role === "SUPER_ADMIN") {
      const activeAdmins = await db.user.count({
        where: { role: "SUPER_ADMIN", status: "ACTIVE", id: { not: id } },
      });
      if (activeAdmins === 0)
        throw new ApiError("حذف آخرین مدیر کل فعال مجاز نیست", 400);
    }

    await db.$transaction(async (tx) => {
      // داده‌های وابسته‌ای که حذف آبشاری ندارند
      await tx.taskComment.deleteMany({ where: { userId: id } });
      await tx.task.deleteMany({ where: { OR: [{ assigneeId: id }, { creatorId: id }] } });
      await tx.announcement.deleteMany({ where: { authorId: id } });
      await tx.calendarEvent.deleteMany({ where: { ownerId: id } });
      await tx.note.deleteMany({ where: { authorId: id } });
      await tx.message.deleteMany({ where: { senderId: id } });
      await tx.conversation.deleteMany({ where: { creatorId: id } });

      // حذف کاربر — بقیه روابط (نشست، مجوز، اعلان، عضویت گفتگو و ...)
      // با onDelete: Cascade خودکار پاک می‌شوند
      await tx.user.delete({ where: { id } });

      // گفتگوهایی که با حذف عضویت‌ها خالی مانده‌اند
      await tx.conversation.deleteMany({ where: { members: { none: {} } } });
    });

    await audit({
      userId: me.id,
      userName: me.name,
      action: "حذف کامل کاربر",
      entity: "user",
      details: `${target.name} (${target.email})`,
    });
    return json({ ok: true, deleted: true });
  } catch (e) {
    return apiError(e);
  }
}
