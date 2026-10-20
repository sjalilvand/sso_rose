import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, generateOTP, verifyPassword } from "@/lib/auth";
import { apiError } from "@/lib/api";

/** صدور کد دومرحله‌ای (حالت نمایشی — کد در پاسخ برگردانده می‌شود) */
export async function POST(req: NextRequest) {
  try {
    const { email, password } = (await req.json()) as { email?: string; password?: string };
    if (!email || !password) throw new ApiError("ایمیل و رمز عبور الزامی است", 400);
    const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || !verifyPassword(password, user.passwordHash))
      throw new ApiError("ایمیل یا رمز عبور نادرست است", 401);
    if (!user.twoFactorEnabled) throw new ApiError("احراز هویت دومرحله‌ای برای این حساب فعال نیست", 400);
    const code = generateOTP(user.id);
    return NextResponse.json({ demoCode: code, note: "در محیط واقعی، این کد از طریق پیامک/ایمیل ارسال می‌شود" });
  } catch (e) {
    return apiError(e);
  }
}
