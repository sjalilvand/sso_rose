import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, audit, ipFromRequest, normalizeIdentifier, ApiError } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";
import { notifySuperAdminsViaBale } from "@/lib/bale";

const NID_RE = /^\d{10}$/;
const MOBILE_RE = /^09\d{9}$/;

function digitsOnly(raw: string): string {
  // ارقام فارسی/عربی به لاتین
  return normalizeIdentifier(raw).replace(/[^0-9]/g, "");
}

interface RegisterBody {
  fullName?: string;
  nationalId?: string;
  mobile?: string;
  password?: string;
  province?: string;
  clinic?: string;
  jobTitle?: string;
}

/**
 * ثبت‌نام کاربر جدید (عمومی) — تا تأیید مدیر هیچ کاربری ساخته نمی‌شود.
 * POST /api/auth/register
 */
export async function POST(req: NextRequest) {
  try {
    const body = await readBody<RegisterBody>(req);

    const fullName = (body.fullName || "").trim();
    const nationalId = digitsOnly(body.nationalId || "");
    const mobile = digitsOnly(body.mobile || "");
    const password = body.password || "";

    if (fullName.length < 3) throw new ApiError("نام و نام خانوادگی را کامل وارد کنید", 400);
    if (!NID_RE.test(nationalId)) throw new ApiError("کد ملی باید ۱۰ رقم باشد", 400);
    if (!MOBILE_RE.test(mobile)) throw new ApiError("شماره موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد", 400);
    if (password.length < 6) throw new ApiError("رمز عبور باید حداقل ۶ نویسه باشد", 400);

    // حساب فعال موجود؟
    const existingUser = await db.user.findFirst({
      where: { OR: [{ username: nationalId }, { email: `${nationalId}@rose.ir` }] },
      select: { id: true },
    });
    if (existingUser) {
      throw new ApiError(
        "این کد ملی قبلاً در رز هاب ثبت شده است؛ وارد شوید یا برای بازیابی رمز به بات پشتیبانی (@rosepro_bot در بله) مراجعه کنید",
        409,
      );
    }

    const existing = await db.registrationRequest.findUnique({ where: { nationalId } });
    if (existing?.status === "PENDING") {
      throw new ApiError("درخواست شما قبلاً ثبت شده و در انتظار تأیید مدیر است", 409);
    }
    if (existing?.status === "APPROVED") {
      throw new ApiError("این کد ملی قبلاً تأیید شده است؛ وارد شوید", 409);
    }

    const data = {
      fullName,
      nationalId,
      mobile,
      passwordHash: hashPassword(password),
      province: (body.province || "").trim(),
      clinic: (body.clinic || "").trim(),
      jobTitle: (body.jobTitle || "").trim(),
    };

    if (existing) {
      // درخواست ردشدهٔ قبلی — اجازهٔ ثبت مجدد
      await db.registrationRequest.update({
        where: { id: existing.id },
        data: { ...data, status: "PENDING", reviewNote: "", reviewedById: null },
      });
    } else {
      await db.registrationRequest.create({ data });
    }

    await audit({
      action: "ثبت‌نام جدید (در انتظار تأیید)",
      entity: "registration",
      details: `${fullName} — ${nationalId}`,
      ip: ipFromRequest(req),
    });

    // اعلان به مدیرکل‌ها: درون‌برنامه‌ای + بات بله
    const admins = await db.user.findMany({
      where: { role: "SUPER_ADMIN", status: "ACTIVE" },
      select: { id: true },
    });
    if (admins.length) {
      await db.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: "registration",
          title: "درخواست ثبت‌نام جدید",
          body: `${fullName} (کد ملی ${nationalId}) درخواست دسترسی داده است — برای تأیید به مدیریت ← درخواست‌های ثبت‌نام بروید.`,
          link: "/admin/registrations",
        })),
      });
    }
    await notifySuperAdminsViaBale(
      `📝 <b>درخواست ثبت‌نام جدید در رز هاب</b>\n\nنام: ${fullName}\nکد ملی: <code>${nationalId}</code>\nموبایل: <code>${mobile}</code>\n\nبرای تأیید یا رد به بخش «درخواست‌های ثبت‌نام» پنل مدیریت بروید.`,
    );

    return json(
      {
        ok: true,
        message: "درخواست ثبت‌نام شما ثبت شد. پس از بررسی و تأیید مدیر، می‌توانید وارد شوید.",
      },
      201,
    );
  } catch (e) {
    return apiError(e);
  }
}
