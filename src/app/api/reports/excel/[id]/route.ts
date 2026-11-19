import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, ApiError } from "@/lib/auth";
import { apiError, json } from "@/lib/api";

/**
 * جزئیات یک فایل گزارش اکسل — بند ۷
 * GET    /api/reports/excel/[id]  — رکوردهای کامل برای داشبورد
 * DELETE /api/reports/excel/[id]  — حذف فایل گزارش
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireAuth(req);
    const { id } = await ctx.params;
    const file = await db.reportFile.findUnique({ where: { id } });
    if (!file) throw new ApiError("فایل گزارش یافت نشد", 404);
    if (file.uploadedById !== me.id && me.role !== "SUPER_ADMIN" && me.role !== "UNIT_MANAGER")
      throw new ApiError("شما مجوز مشاهدهٔ این گزارش را ندارید", 403);
    return json({
      file: {
        id: file.id, name: file.name, month: file.month, year: file.year, sheet: file.sheet,
        services: JSON.parse(file.services || "[]"),
        records: JSON.parse(file.records || "[]"),
        summary: JSON.parse(file.summary || "{}"),
        nConsultants: file.nConsultants,
        createdAt: file.createdAt,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireAuth(req);
    const { id } = await ctx.params;
    const file = await db.reportFile.findUnique({ where: { id } });
    if (!file) throw new ApiError("فایل گزارش یافت نشد", 404);
    if (file.uploadedById !== me.id && me.role !== "SUPER_ADMIN" && me.role !== "UNIT_MANAGER")
      throw new ApiError("شما مجوز حذف این گزارش را ندارید", 403);
    await db.reportFile.delete({ where: { id } });
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
