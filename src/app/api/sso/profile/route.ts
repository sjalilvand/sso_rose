import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { ensureSystemCredentials } from "@/lib/auth";
import { apiError, json } from "@/lib/api";

/**
 * استعلام مشخصات کاربر برای سامانه‌های متصل (سرویس‌به‌سرویس) — فاز ۶۵
 *
 *   POST /api/sso/profile
 *   { "clientId", "clientSecret", "username" }
 *
 * هر سامانهٔ متصل با clientId/clientSecret اختصاصی خودش (همان جفت‌کلیدی که
 * توکن SSO با آن امضا می‌شود) می‌تواند مشخصات کامل یک کاربر رز هاب را بر اساس
 * نام کاربری (کد ملی) یا ایمیل استعلام کند تا در ورودهای محلی (گذرواژه‌ای)
 * هم پروفایل کاربر در سامانهٔ مقصد به‌روز بماند.
 *
 * پاسخ: { found: true, profile: { email, name, role, username, nationalId,
 * mobile, province, provinceCode, clinic } } یا found: false.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const clientId = String(body?.clientId ?? "").trim();
    const clientSecret = String(body?.clientSecret ?? "").trim();
    const username = String(body?.username ?? "").trim().toLowerCase();

    if (!clientId || !clientSecret || !username) {
      return json({ found: false, error: "پارامترهای clientId/clientSecret/username الزامی است" }, 400);
    }

    const system = await db.clinicSystem.findUnique({ where: { clientId } });
    if (!system) {
      return json({ found: false, error: "سامانه‌ای با این clientId یافت نشد" }, 401);
    }

    const creds = await ensureSystemCredentials(system.id);
    const a = Buffer.from(creds.clientSecret);
    const b = Buffer.from(clientSecret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return json({ found: false, error: "clientSecret نامعتبر است" }, 401);
    }

    // جست‌وجو با نام کاربری (کد ملی) یا ایمیل — قرارداد درون‌ریزی اکسل:
    // ایمیل هر کاربر <کد ملی>@rose.ir است.
    const emailGuess = username.includes("@") ? username : `${username}@rose.ir`;
    const user = await db.user.findFirst({
      where: { OR: [{ username }, { email: emailGuess }] },
    });
    if (!user || user.status !== "ACTIVE") {
      return json({ found: false }, 404);
    }

    return json({
      found: true,
      profile: {
        email: user.email,
        name: user.name,
        role: user.role,
        username: user.username,
        nationalId: user.username || null, // کد ملی — شناسهٔ پایدار
        mobile: user.phone || null,
        province: user.province || null,
        provinceCode: user.provinceCode || null,
        clinic: user.clinic || null,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
