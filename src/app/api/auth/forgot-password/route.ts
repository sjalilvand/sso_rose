import { NextRequest } from "next/server";
import { createHash, randomBytes, randomInt } from "crypto";
import { db } from "@/lib/db";
import { normalizeIdentifier, ApiError } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";
import { sendBaleMessage } from "@/lib/bale";

const RESET_TTL_MINUTES = 15;
const APP_PUBLIC_URL = (process.env.APP_PUBLIC_URL || "http://130.185.73.157:8082").replace(/\/$/, "");

function sha256(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

interface ForgotBody {
  nationalId?: string;
}

/**
 * شروع بازیابی رمز عبور از طریق بات بله (عمومی).
 * POST /api/auth/forgot-password { nationalId }
 * کد ۶ رقمی + پیوند یک‌بارمصرف در چت بات برای کاربر ارسال می‌شود.
 */
export async function POST(req: NextRequest) {
  try {
    const { nationalId } = await readBody<ForgotBody>(req);
    const nid = normalizeIdentifier(nationalId || "").replace(/[^0-9]/g, "");
    if (nid.length !== 10) throw new ApiError("کد ملی باید ۱۰ رقم باشد", 400);

    const user = await db.user.findFirst({
      where: { OR: [{ username: nid }, { email: `${nid}@rose.ir` }] },
      select: { id: true, name: true, status: true },
    });
    if (!user) throw new ApiError("حسابی با این کد ملی در رز هاب یافت نشد", 404);
    if (user.status !== "ACTIVE") throw new ApiError("حساب شما فعال نیست؛ با مدیر سامانه تماس بگیرید", 403);

    const link = await db.baleLink.findUnique({ where: { userId: user.id } });
    if (!link) {
      throw new ApiError(
        "برای این حساب اتصال به بات پشتیبانی یافت نشد. ابتدا در بله به بات @rosepro_bot پیام بدهید (ble.ir/rosepro_bot) و با گزینهٔ «اتصال حساب»، کد ملی و ۴ رقم آخر موبایلتان را ثبت کنید، بعد دوباره اینجا تلاش کنید.",
        404,
      );
    }

    const token = randomBytes(24).toString("hex");
    const code = String(randomInt(100000, 1000000));
    await db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    await db.passwordResetToken.create({
      data: {
        tokenHash: sha256(token),
        code,
        userId: user.id,
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
      },
    });

    const resetUrl = `${APP_PUBLIC_URL}/reset-password?token=${token}`;
    const sent = await sendBaleMessage(
      link.chatId,
      `🔑 <b>بازیابی رمز عبور رز هاب</b>\n\nسلام ${user.name}،\nکد تأیید شما: <code>${code}</code>\n\nاین کد ۱۵ دقیقه اعتبار دارد.\nبرای انتخاب رمز جدید روی دکمهٔ زیر بزنید:`,
      { inline_keyboard: [[{ text: "🔐 انتخاب رمز جدید", url: resetUrl }]] },
    );
    if (!sent) {
      throw new ApiError("ارسال پیام در بله ناموفق بود؛ مطمئن شوید بات را استارت کرده‌اید و دوباره تلاش کنید", 502);
    }

    return json({
      ok: true,
      message: `کد بازیابی و پیوند تغییر رمز در بات بله (@rosepro_bot) برای شما ارسال شد. ${RESET_TTL_MINUTES} دقیقه فرصت دارید.`,
    });
  } catch (e) {
    return apiError(e);
  }
}
