import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getAuthUser,
  audit,
  signSSOToken,
  ipFromRequest,
  ensureSystemCredentials,
} from "@/lib/auth";

/**
 * شروع ورود یکپارچه از سمت سامانه مقصد (SP-initiated) — GET
 *
 *   GET /api/sso/launch?clientId=<شناسه عمومی سامانه>
 *
 * کاربر با نشست رز هاب احراز هویت می‌شود؛ سپس توکن موقت SSO صادر و کاربر
 * با 302 به نشانی سامانه مقصد (?sso_token=...) منتقل می‌گردد. اگر نشستی
 * نباشد، به صفحه ورود رز هاب با پارامتر next برمی‌گردد تا پس از ورود،
 * همین مسیر ادامه یابد (تجربه «یک یوزر و پسورد برای همه سامانه‌ها»).
 */
export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get("clientId")?.trim();
    if (!clientId) {
      return NextResponse.json({ error: "پارامتر clientId الزامی است" }, { status: 400 });
    }

    const system = await db.clinicSystem.findUnique({ where: { clientId } });
    if (!system) {
      return NextResponse.json({ error: "سامانه‌ای با این clientId یافت نشد" }, { status: 404 });
    }

    const user = await getAuthUser(req);
    if (!user) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set(
        "next",
        `/api/sso/launch?clientId=${encodeURIComponent(clientId)}`
      );
      return NextResponse.redirect(loginUrl);
    }

    // اصل مهم سند: مجوز استفاده از هر سامانه جداگانه تعیین می‌شود
    const access = await db.systemAccess.findUnique({
      where: { userId_systemId: { userId: user.id, systemId: system.id } },
    });
    if (!access && user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "شما مجوز دسترسی به این سامانه را ندارید. از مدیر سامانه درخواست کنید." },
        { status: 403 }
      );
    }

    const creds = await ensureSystemCredentials(system.id);
    const { token } = await signSSOToken({
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
      action: "ورود یکپارچه به سامانه (شروع از سامانه)",
      entity: "sso",
      details: system.name,
      ip: ipFromRequest(req),
    });

    const target = new URL(system.url);
    target.searchParams.set("sso_token", token);
    return NextResponse.redirect(target.toString(), 302);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "خطای داخلی سرور" },
      { status: 500 }
    );
  }
}
