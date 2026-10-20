import { NextResponse } from "next/server";
import { SSO_ISSUER, SSO_TTL_SECONDS } from "@/lib/auth";

/**
 * اندپوینت عمومی پیکربندی اتصال SSO (بدون نیاز به ورود).
 * تیم فنی سامانه‌های مقصد برای همگام‌سازی ساعت سرور و دریافت پارامترهای اعتبارسنجی استفاده می‌کنند.
 */
export async function GET() {
  return NextResponse.json(
    {
      service: "Rose Hub SSO",
      issuer: SSO_ISSUER, // مقدار claim «iss» در توکن
      algorithm: "HS256", // الگوریتم امضا — رمز مشترک: clientSecret سامانه
      tokenParam: "sso_token", // نام پارامتر کوئری حاوی توکن در نشانی بازگشت
      ttlSeconds: SSO_TTL_SECONDS,
      clockSkewToleranceSeconds: 60,
      claims: ["iss", "aud", "sub", "email", "name", "role", "systemId", "systemName", "scope", "iat", "exp", "jti"],
      serverTime: new Date().toISOString(),
      docs: "/sso-docs",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
