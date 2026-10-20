import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, ApiError, audit, signSSOToken, ipFromRequest } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";

/**
 * ورود یکپارچه (اتصال پایه):
 * ۱. بررسی مجوز کاربر برای سامانه مقصد
 * ۲. صدور توکن موقت SSO (اعتبار ۵ دقیقه)
 * ۳. ثبت رویداد ورود یکپارچه
 * ۴. بازگرداندن نشانی راه‌اندازی برای انتقال کاربر به سامانه مقصد
 *
 * نکته مستندات: پشتیبانی واقعی سامانه‌های مقصد از OIDC/OAuth2 باید
 * جداگانه با تیم فنی هر سامانه بررسی و پیاده‌سازی شود.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req);
    const { id } = await ctx.params;

    const system = await db.clinicSystem.findUnique({ where: { id } });
    if (!system) throw new ApiError("سامانه یافت نشد", 404);

    // اصل مهم سند: مجوز استفاده از هر سامانه جداگانه تعیین می‌شود
    const access = await db.systemAccess.findUnique({
      where: { userId_systemId: { userId: user.id, systemId: id } },
    });
    if (!access && user.role !== "SUPER_ADMIN")
      throw new ApiError("شما مجوز دسترسی به این سامانه را ندارید. از مدیر سامانه درخواست کنید.", 403);

    const { token, expiresAt } = await signSSOToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      systemId: system.id,
      systemName: system.name,
    });

    await audit({
      userId: user.id,
      userName: user.name,
      action: "ورود یکپارچه به سامانه",
      entity: "sso",
      details: system.name,
      ip: ipFromRequest(req),
    });

    const launchUrl = `${system.url}${system.url.endsWith("/") ? "" : "/"}?sso_token=${token}`;
    return json({
      launchUrl,
      systemName: system.name,
      connectionLevel: system.connectionLevel,
      expiresAt,
      token,
    });
  } catch (e) {
    return apiError(e);
  }
}
