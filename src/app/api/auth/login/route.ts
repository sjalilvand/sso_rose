import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyPassword,
  signSessionToken,
  audit,
  deviceFromRequest,
  ipFromRequest,
  verifyOTP,
  normalizeIdentifier,
  ApiError,
} from "@/lib/auth";
import { apiError } from "@/lib/api";

export async function POST(req: NextRequest) {
  try {
    const { email, password, otpCode } = (await req.json()) as {
      email?: string;
      password?: string;
      otpCode?: string;
    };
    if (!email || !password) throw new ApiError("ایمیل/کد ملی و رمز عبور الزامی است", 400);

    // ورود با ایمیل سازمانی یا کد ملی (ارقام فارسی هم پذیرفته می‌شود)
    const identifier = normalizeIdentifier(email);
    const user = await db.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
    });

    // پیام دقیق برای ثبت‌نام‌های در انتظار تأیید یا ردشده (قبل از خطای عمومی اعتبارات)
    if (!user) {
      const nid = identifier.replace(/[^0-9]/g, "");
      if (/^\d{10}$/.test(nid)) {
        const reg = await db.registrationRequest.findUnique({ where: { nationalId: nid } });
        if (reg?.status === "PENDING") {
          await audit({ action: "تلاش ورود به حساب در انتظار تأیید", entity: "auth", details: nid, ip: ipFromRequest(req) });
          throw new ApiError(
            "حساب شما هنوز تأیید نشده است؛ درخواست ثبت‌نام شما در انتظار بررسی مدیر است. پس از تأیید، با همین کد ملی و رمز عبور وارد شوید.",
            403,
          );
        }
        if (reg?.status === "REJECTED") {
          throw new ApiError(
            reg.reviewNote
              ? `درخواست ثبت‌نام شما تأیید نشده است (یادداشت مدیر: ${reg.reviewNote}). می‌توانید در صفحهٔ ثبت‌نام دوباره درخواست بدهید.`
              : "درخواست ثبت‌نام شما تأیید نشده است؛ می‌توانید در صفحهٔ ثبت‌نام دوباره درخواست بدهید.",
            403,
          );
        }
      }
    }

    if (!user || !verifyPassword(password, user.passwordHash)) {
      await audit({ action: "تلاش ناموفق ورود", entity: "auth", details: identifier, ip: ipFromRequest(req) });
      throw new ApiError("ایمیل/کد ملی یا رمز عبور نادرست است", 401);
    }
    if (user.status === "SUSPENDED")
      throw new ApiError("حساب شما به حالت تعلیق درآمده است. با مدیر سامانه تماس بگیرید.", 403);
    if (user.status === "INACTIVE") throw new ApiError("حساب شما غیرفعال است.", 403);

    // احراز هویت دومرحله‌ای
    if (user.twoFactorEnabled) {
      if (!otpCode) {
        return NextResponse.json(
          { requiresTwoFactor: true, demoHint: "حالت نمایشی: کد در پاسخ ارسال می‌شود" },
          { status: 200 }
        );
      }
      if (!verifyOTP(user.id, otpCode)) {
        throw new ApiError("کد تأیید نامعتبر یا منقضی است", 401);
      }
    }

    // ایجاد نشست
    const session = await db.session.create({
      data: {
        userId: user.id,
        device: deviceFromRequest(req),
        ip: ipFromRequest(req),
      },
    });

    const token = await signSessionToken({
      sub: user.id,
      jti: session.id,
      role: user.role,
      name: user.name,
    });

    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit({
      userId: user.id,
      userName: user.name,
      action: "ورود موفق به سامانه",
      entity: "auth",
      ip: ipFromRequest(req),
    });

    const res = NextResponse.json({
      user: { id: user.id, name: user.name, role: user.role },
    });
    // کوکی نشست: فقط روی HTTPS فلگ Secure می‌گیرد تا ورود روی HTTP (IP:پورت) هم کار کند.
    // پشت ریورس‌پروکسی (مثل Caddy)، از x-forwarded-proto استفاده می‌شود.
    const forwardedProto = req.headers.get("x-forwarded-proto");
    const isHttps = (forwardedProto || req.nextUrl.protocol.replace(":", "")) === "https";
    res.cookies.set("rose_hub_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isHttps,
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });
    return res;
  } catch (e) {
    return apiError(e);
  }
}
