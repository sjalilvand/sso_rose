import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser, audit, ipFromRequest, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (user) {
    // لغو نشست فعلی
    const cookieHeader = req.headers.get("cookie") || "";
    const token = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
      ?.split("=")
      .slice(1)
      .join("=");
    if (token) {
      const { verifySessionToken } = await import("@/lib/auth");
      const payload = await verifySessionToken(token);
      if (payload) {
        await db.session.update({ where: { id: payload.jti }, data: { revoked: true } }).catch(() => {});
      }
    }
    await audit({ userId: user.id, userName: user.name, action: "خروج از سامانه", entity: "auth", ip: ipFromRequest(req) });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}

/**
 * خروج یکپارچه با لینک مستقیم (GET):
 * سامانه‌های مقصد می‌توانند دکمه «خروج از همه سامانه‌ها» را به این نشانی بدهند.
 * کاربر از رز هاب خارج و به مسیر نسبی داده‌شده (پیش‌فرض /login) هدایت می‌شود.
 * امنیت: فقط مسیرهای نسبی پذیرفته می‌شود تا از open redirect جلوگیری شود.
 */
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (user) {
    const cookieHeader = req.headers.get("cookie") || "";
    const token = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
      ?.split("=")
      .slice(1)
      .join("=");
    if (token) {
      const { verifySessionToken } = await import("@/lib/auth");
      const payload = await verifySessionToken(token);
      if (payload) {
        await db.session.update({ where: { id: payload.jti }, data: { revoked: true } }).catch(() => {});
      }
    }
    await audit({ userId: user.id, userName: user.name, action: "خروج یکپارچه (لینک مستقیم)", entity: "auth", ip: ipFromRequest(req) });
  }
  const raw = req.nextUrl.searchParams.get("redirect") || "/login";
  // فقط مسیر نسبی مجاز است
  const target = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/login";
  const res = NextResponse.redirect(new URL(target, req.nextUrl.origin));
  res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
