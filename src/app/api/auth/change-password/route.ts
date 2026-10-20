import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hashPassword, verifyPassword, audit, ApiError } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";

/** تغییر رمز عبور و فعال/غیرفعال‌سازی دومرحله‌ای */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { currentPassword, newPassword, twoFactorEnabled } = await readBody<{
      currentPassword?: string;
      newPassword?: string;
      twoFactorEnabled?: boolean;
    }>(req);

    const full = await db.user.findUnique({ where: { id: user.id } });
    if (!full) throw new ApiError("کاربر یافت نشد", 404);

    const data: { passwordHash?: string; twoFactorEnabled?: boolean } = {};

    if (newPassword) {
      if (!currentPassword || !verifyPassword(currentPassword, full.passwordHash))
        throw new ApiError("رمز عبور فعلی نادرست است", 403);
      if (newPassword.length < 8) throw new ApiError("رمز عبور جدید باید حداقل ۸ نویسه باشد", 400);
      data.passwordHash = hashPassword(newPassword);
    }

    if (typeof twoFactorEnabled === "boolean") {
      data.twoFactorEnabled = twoFactorEnabled;
    }

    if (Object.keys(data).length === 0) throw new ApiError("تغییری ارسال نشده است", 400);

    await db.user.update({ where: { id: user.id }, data });
    await audit({
      userId: user.id,
      userName: user.name,
      action: data.passwordHash ? "تغییر رمز عبور" : "تغییر تنظیمات امنیتی حساب",
      entity: "auth",
    });
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
