import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, audit, ApiError } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";

/** ویرایش و حذف مرکز — اطلاعات پایهٔ مراکز و کلینیک‌ها (بندهای ۱ و ۵) */

function parseCoord(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireAuth(req);
    if (!hasPermission(me.role, "users.manage"))
      throw new ApiError("شما مجوز مدیریت اطلاعات پایه را ندارید", 403);
    const { id } = await ctx.params;
    const current = await db.center.findUnique({ where: { id } });
    if (!current) throw new ApiError("مرکز یافت نشد", 404);

    const body = await readBody<{
      code?: string; name?: string; type?: string; region?: string; province?: string;
      county?: string; city?: string; address?: string; phone?: string; lat?: number | string | null;
      lng?: number | string | null; radiusM?: number; managerId?: string | null; isActive?: boolean;
    }>(req);

    const lat = parseCoord(body.lat);
    const lng = parseCoord(body.lng);
    if ((lat === null && lng !== null && lng !== undefined) ||
        (lng === null && lat !== null && lat !== undefined)) {
      throw new ApiError("هر دو مختصات (عرض و طول) باید با هم ثبت یا با هم پاک شوند", 400);
    }
    if (body.code && body.code.trim() && body.code.trim() !== current.code) {
      const dup = await db.center.findUnique({ where: { code: body.code.trim() } });
      if (dup) throw new ApiError("کد مرکز تکراری است", 409);
    }

    const center = await db.center.update({
      where: { id },
      data: {
        ...(body.code !== undefined ? { code: body.code.trim() || current.code } : {}),
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.type !== undefined
          ? { type: ["CENTER", "HQ", "CLINIC", "EMDAD"].includes(body.type) ? body.type : "CLINIC" }
          : {}),
        ...(body.region !== undefined ? { region: body.region.trim() } : {}),
        ...(body.province !== undefined ? { province: body.province.trim() } : {}),
        ...(body.county !== undefined ? { county: body.county.trim() } : {}),
        ...(body.city !== undefined ? { city: body.city.trim() } : {}),
        ...(body.address !== undefined ? { address: body.address.trim() } : {}),
        ...(body.phone !== undefined ? { phone: body.phone.trim() } : {}),
        ...(lat !== undefined ? { lat } : {}),
        ...(lng !== undefined ? { lng } : {}),
        ...(body.radiusM !== undefined ? { radiusM: Number(body.radiusM) > 0 ? Number(body.radiusM) : 300 } : {}),
        ...(body.managerId !== undefined ? { managerId: body.managerId || null } : {}),
        ...(body.isActive !== undefined ? { isActive: !!body.isActive } : {}),
        source: current.source === "TECHNORZ" ? "TECHNORZ" : current.source,
      },
    });

    await audit({
      userId: me.id, userName: me.name, action: "ویرایش مرکز", entity: "Center", details: center.name,
    });
    return json({ center });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireAuth(req);
    if (!hasPermission(me.role, "users.manage"))
      throw new ApiError("شما مجوز مدیریت اطلاعات پایه را ندارید", 403);
    const { id } = await ctx.params;
    const center = await db.center.findUnique({ where: { id }, include: { _count: { select: { users: true, clinics: true } } } });
    if (!center) throw new ApiError("مرکز یافت نشد", 404);
    const used = center._count.users + center._count.clinics;
    if (used > 0)
      throw new ApiError(
        `این مرکز به ${used} کاربر متصل است؛ ابتدا اتصال کاربران را تغییر دهید یا مرکز را غیرفعال کنید`,
        409
      );

    await db.center.delete({ where: { id } });
    await audit({
      userId: me.id, userName: me.name, action: "حذف مرکز", entity: "Center", details: center.name,
    });
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
