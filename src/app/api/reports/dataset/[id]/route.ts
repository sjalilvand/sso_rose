import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, ApiError } from "@/lib/auth";
import { apiError, json } from "@/lib/api";

/**
 * جزئیات مجموعه‌دادهٔ عمومی اکسل — فاز ۷۳
 * GET    /api/reports/dataset/[id]  — همهٔ شیت‌ها، ستون‌ها، پروفایل و ردیف‌ها
 * DELETE /api/reports/dataset/[id]  — حذف
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireAuth(req);
    const { id } = await ctx.params;
    const ds = await db.excelDataset.findUnique({ where: { id } });
    if (!ds) throw new ApiError("مجموعه‌داده یافت نشد", 404);
    if (ds.uploadedById !== me.id && me.role !== "SUPER_ADMIN" && me.role !== "UNIT_MANAGER")
      throw new ApiError("شما مجوز مشاهدهٔ این داده را ندارید", 403);

    interface Sheet {
      name: string;
      columns: Array<{ name: string; type: string }>;
      rows: Array<Record<string, unknown>>;
      profile: unknown[];
      totalRows: number;
    }
    let sheets: Sheet[] = [];
    try {
      sheets = JSON.parse(ds.rows || "[]");
    } catch {
      sheets = [];
    }

    return json({
      dataset: {
        id: ds.id,
        name: ds.name,
        sheetNames: JSON.parse(ds.sheetNames || "[]"),
        activeSheet: ds.activeSheet,
        nRows: ds.nRows,
        nRowsTotal: ds.nRowsTotal,
        createdAt: ds.createdAt,
        sheets,
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
    const ds = await db.excelDataset.findUnique({ where: { id } });
    if (!ds) throw new ApiError("مجموعه‌داده یافت نشد", 404);
    if (ds.uploadedById !== me.id && me.role !== "SUPER_ADMIN" && me.role !== "UNIT_MANAGER")
      throw new ApiError("شما مجوز حذف این داده را ندارند", 403);
    await db.excelDataset.delete({ where: { id } });
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
