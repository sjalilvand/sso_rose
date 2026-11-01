import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, audit, ipFromRequest, ApiError } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";

/**
 * مدیریت درخواست‌های ثبت‌نام — فقط مدیرکل (SUPER_ADMIN).
 * GET  /api/admin/registrations        فهرست + آمار
 * POST /api/admin/registrations        { id, action: "approve" | "reject", note? }
 */
async function requireSuperAdmin(req: NextRequest) {
  const user = await requireAuth(req);
  if (user.role !== "SUPER_ADMIN") throw new ApiError("این بخش فقط برای مدیرکل است", 403);
  return user;
}

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);

    const requests = await db.registrationRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const counts = {
      pending: requests.filter((r) => r.status === "PENDING").length,
      approved: requests.filter((r) => r.status === "APPROVED").length,
      rejected: requests.filter((r) => r.status === "REJECTED").length,
    };
    return json({ requests, counts });
  } catch (e) {
    return apiError(e);
  }
}

interface ReviewBody {
  id?: string;
  action?: "approve" | "reject";
  note?: string;
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireSuperAdmin(req);
    const { id, action, note } = await readBody<ReviewBody>(req);
    if (!id || (action !== "approve" && action !== "reject")) {
      throw new ApiError("پارامترهای بررسی نامعتبر است", 400);
    }

    const request = await db.registrationRequest.findUnique({ where: { id } });
    if (!request) throw new ApiError("درخواست یافت نشد", 404);
    if (request.status !== "PENDING") throw new ApiError("این درخواست قبلاً بررسی شده است", 409);

    if (action === "approve") {
      try {
        await db.$transaction(async (tx) => {
          await tx.user.create({
            data: {
              email: `${request.nationalId}@rose.ir`,
              username: request.nationalId,
              passwordHash: request.passwordHash,
              name: request.fullName,
              phone: request.mobile,
              province: request.province,
              provinceCode: "",
              clinic: request.clinic,
              jobTitle: request.jobTitle,
              role: "STAFF",
              unit: "عمومی",
              status: "ACTIVE",
            },
          });
          await tx.registrationRequest.update({
            where: { id: request.id },
            data: { status: "APPROVED", reviewNote: (note || "").trim(), reviewedById: admin.id },
          });
        });
      } catch {
        throw new ApiError(
          "ساخت حساب ناموفق بود؛ احتمالاً این کد ملی هم‌زمان در کاربران ثبت شده است",
          409,
        );
      }
      await audit({
        userId: admin.id,
        userName: admin.name,
        action: "تأیید درخواست ثبت‌نام",
        entity: "registration",
        details: `${request.fullName} — ${request.nationalId}`,
        ip: ipFromRequest(req),
      });
      return json({ ok: true, message: `حساب ${request.fullName} ساخته شد و ورود او فعال گردید.` });
    }

    // reject
    await db.registrationRequest.update({
      where: { id: request.id },
      data: { status: "REJECTED", reviewNote: (note || "").trim(), reviewedById: admin.id },
    });
    await audit({
      userId: admin.id,
      userName: admin.name,
      action: "رد درخواست ثبت‌نام",
      entity: "registration",
      details: `${request.fullName} — ${request.nationalId}${(note || "").trim() ? ` — ${note!.trim()}` : ""}`,
      ip: ipFromRequest(req),
    });
    return json({ ok: true, message: "درخواست رد شد." });
  } catch (e) {
    return apiError(e);
  }
}
