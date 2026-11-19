import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, ApiError } from "@/lib/auth";
import { apiError, json } from "@/lib/api";
import { parseFormula } from "@/lib/formula";

/**
 * ویرایش و حذف شاخص سفارشی — فاز ۷۳
 * PATCH  /api/reports/indicators/[id]  — ویرایش نام/فرمول/توضیح
 * DELETE /api/reports/indicators/[id]  — حذف (سازنده یا مدیر کل)
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireAuth(req);
    const { id } = await ctx.params;
    const ind = await db.customIndicator.findUnique({ where: { id } });
    if (!ind) throw new ApiError("شاخص یافت نشد", 404);
    if (ind.createdById !== me.id && me.role !== "SUPER_ADMIN")
      throw new ApiError("فقط سازندهٔ شاخص یا مدیر کل می‌تواند آن را ویرایش کند", 403);

    const body = (await req.json().catch(() => ({}))) as {
      name?: string; formula?: string; description?: string;
    };
    const name = body.name !== undefined ? body.name.trim() : ind.name;
    const formula = body.formula !== undefined ? body.formula.trim() : ind.formula;
    if (!name) throw new ApiError("نام شاخص الزامی است", 400);
    if (!formula) throw new ApiError("فرمول شاخص الزامی است", 400);
    try {
      parseFormula(formula);
    } catch (err) {
      throw new ApiError(`فرمول نامعتبر: ${(err as Error).message}`, 400);
    }

    const updated = await db.customIndicator.update({
      where: { id },
      data: { name, formula, description: (body.description ?? ind.description).trim() },
    });
    return json({ indicator: updated });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireAuth(req);
    const { id } = await ctx.params;
    const ind = await db.customIndicator.findUnique({ where: { id } });
    if (!ind) throw new ApiError("شاخص یافت نشد", 404);
    if (ind.createdById !== me.id && me.role !== "SUPER_ADMIN")
      throw new ApiError("فقط سازندهٔ شاخص یا مدیر کل می‌تواند آن را حذف کند", 403);
    await db.customIndicator.delete({ where: { id } });
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
