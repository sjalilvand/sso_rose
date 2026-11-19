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
 * mobile, province, provinceCode, clinic, jobTitle, unit, management,
 * managerName, education, workLicense, profRank, contractNo, personalCode,
 * bankSheba, center: {code,name,province,city,address,lat,lng,radiusM},
 * clinicCenter: {…} } } یا found: false.
 * مرکز و کلینیک با مختصات نقشه ارسال می‌شوند (بند ۶ سند تغییرات فاز ۷۲).
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
      include: {
        center: true,
        clinicCenter: true,
        management: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true } },
      },
    });
    if (!user || user.status !== "ACTIVE") {
      return json({ found: false }, 404);
    }

    /** خلاصهٔ مرکز همراه با مختصات نقشه — بند ۶ */
    const centerBrief = (c: typeof user.center | null) =>
      c
        ? {
            id: c.id,
            code: c.code,
            name: c.name,
            type: c.type,
            region: c.region || null,
            province: c.province || null,
            city: c.city || null,
            address: c.address || null,
            phone: c.phone || null,
            lat: c.lat,
            lng: c.lng,
            radiusM: c.radiusM,
          }
        : null;

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
        clinic: (user.clinicCenter?.name || user.clinic) || null,
        // مشخصات کامل کارمند — فاز ۷۲ (بند ۶)
        jobTitle: user.jobTitle || null,
        unit: user.unit || null,
        management: user.management?.name || null,
        managerName: user.manager?.name || null,
        education: user.education || null,
        workLicense: user.workLicense || null,
        profRank: user.profRank || null,
        contractNo: user.contractNo || null,
        personalCode: user.personalCode || null,
        bankSheba: user.bankSheba || null,
        // مرکز تخصیص و کلینک خدمت با مختصات نقشه — بند ۶
        center: centerBrief(user.center),
        clinicCenter: centerBrief(user.clinicCenter),
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
