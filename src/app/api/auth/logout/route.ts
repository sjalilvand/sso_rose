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
