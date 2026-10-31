import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  requireAuth,
  ApiError,
  audit,
  signSSOToken,
  ipFromRequest,
  ensureSystemCredentials,
} from "@/lib/auth";
import { apiError, json } from "@/lib/api";

/**
 * ورود یکپارچه (اتصال پایه):
 * ۱. بررسی مجوز کاربر برای سامانه مقصد
 * ۲. اطمینان از وجود مشخصات اتصال سامانه (clientId/clientSecret)
 * ۳. صدور توکن موقت SSO — JWT امضاشده با رمز اختصاصی سامانه (اعتبار ۵ دقیقه)
 * ۴. ثبت رویداد ورود یکپارچه
 * ۵. بازگرداندن نشانی راه‌اندازی برای انتقال کاربر به سامانه مقصد
 *
 * سامانه مقصد مستندات «docs/sso-integration-fa.md» را برای اعتبارسنجی توکن دنبال می‌کند.
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

    const creds = await ensureSystemCredentials(system.id);

    const { token, expiresAt } = await signSSOToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      username: user.username,
      mobile: user.phone,
      province: user.province,
      provinceCode: user.provinceCode,
      clinic: user.clinic,
      systemId: system.id,
      systemName: system.name,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
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
