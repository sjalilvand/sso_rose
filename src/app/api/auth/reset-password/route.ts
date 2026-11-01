import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { hashPassword, audit, ipFromRequest, ApiError } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";

function sha256(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

interface ResetBody {
  token?: string;
  password?: string;
}

/**
 * تکمیل بازیابی رمز با توکن یک‌بارمصرف دریافتی از بات بله (عمومی).
 * POST /api/auth/reset-password { token, password }
 */
export async function POST(req: NextRequest) {
  try {
    const { token, password } = await readBody<ResetBody>(req);
    if (!token) throw new ApiError("پیوند بازیابی نامعتبر است", 400);
    if (!password || password.length < 6) throw new ApiError("رمز عبور باید حداقل ۶ نویسه باشد", 400);

    const record = await db.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { select: { id: true, name: true, status: true } } },
    });
    if (!record) throw new ApiError("این پیوند بازیابی معتبر نیست", 400);
    if (record.usedAt) throw new ApiError("این پیوند قبلاً استفاده شده است؛ دوباره از بات درخواست کنید", 400);
    if (record.expiresAt.getTime() < Date.now()) {
      throw new ApiError("پیوند بازیابی منقضی شده است؛ از بات بله کد جدید بگیرید", 400);
    }
    if (record.user.status !== "ACTIVE") throw new ApiError("حساب شما فعال نیست؛ با مدیر سامانه تماس بگیرید", 403);

    await db.$transaction([
      db.user.update({ where: { id: record.userId }, data: { passwordHash: hashPassword(password) } }),
      db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // همهٔ نشست‌های فعال باطل می‌شوند تا رمز جدید فوراً لازم باشد
      db.session.updateMany({ where: { userId: record.userId, revoked: false }, data: { revoked: true } }),
    ]);

    await audit({
      userId: record.userId,
      userName: record.user.name,
      action: "تغییر رمز عبور از طریق بات بله",
      entity: "auth",
      ip: ipFromRequest(req),
    });

    return json({ ok: true, message: "رمز عبور شما با موفقیت تغییر کرد؛ حالا با رمز جدید وارد شوید." });
  } catch (e) {
    return apiError(e);
  }
}
