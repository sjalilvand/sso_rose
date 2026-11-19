import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, audit, ApiError } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";

/**
 * اطلاعات پایهٔ مراکز و کلینیک‌ها — بندهای ۱ و ۵
 * GET  /api/admin/centers  — فهرست کامل (برای کمبوباکس‌ها و نقشه)
 * POST /api/admin/centers  — ثبت دستی (users.manage)
 */

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const centers = await db.center.findMany({
      orderBy: [{ province: "asc" }, { type: "asc" }, { name: "asc" }],
    });
    return json({ centers });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireAuth(req);
    if (!hasPermission(me.role, "users.manage"))
      throw new ApiError("شما مجوز مدیریت اطلاعات پایه را ندارید", 403);

    const body = await readBody<{
      code?: string; name?: string; type?: string; region?: string; province?: string;
      city?: string; address?: string; phone?: string; lat?: number | null; lng?: number | null;
      radiusM?: number; managerId?: string | null; isActive?: boolean;
    }>(req);

    const name = (body.name || "").trim();
    if (!name) throw new ApiError("نام مرکز الزامی است", 400);
    const code = (body.code || "").trim() || `C${Date.now().toString(36).toUpperCase()}`;

    const dup = await db.center.findUnique({ where: { code } });
    if (dup) throw new ApiError("کدی با این نام قبلاً ثبت شده است", 409);

    const lat = body.lat === null || body.lat === undefined || Number.isNaN(Number(body.lat))
      ? null : Number(body.lat);
    const lng = body.lng === null || body.lng === undefined || Number.isNaN(Number(body.lng))
      ? null : Number(body.lng);
    if ((lat === null) !== (lng === null))
      throw new ApiError("هر دو مختصات (عرض و طول) باید با هم ثبت شوند", 400);

    const center = await db.center.create({
      data: {
        code,
        name,
        type: body.type === "CENTER" || body.type === "HQ" ? body.type : "CLINIC",
        region: (body.region || "").trim(),
        province: (body.province || "").trim(),
        city: (body.city || "").trim(),
        address: (body.address || "").trim(),
        phone: (body.phone || "").trim(),
        lat,
        lng,
        radiusM: Number(body.radiusM) > 0 ? Number(body.radiusM) : 300,
        managerId: body.managerId || null,
        isActive: body.isActive !== false,
        source: "MANUAL",
      },
    });

    await audit({
      userId: me.id,
      userName: me.name,
      action: "ایجاد مرکز",
      entity: "Center",
      details: `${center.name} (${center.type})`,
    });
    return json({ center }, 201);
  } catch (e) {
    return apiError(e);
  }
}
