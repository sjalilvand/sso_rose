import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, audit, ApiError } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";
import { parseFormula, formulaColumns } from "@/lib/formula";

/**
 * شاخص‌های سفارشی کاربر — فاز ۷۳
 *
 * GET  /api/reports/indicators  — فهرست شاخص‌های همهٔ کاربران (اشتراکی)
 * POST /api/reports/indicators  — ساخت شاخص جدید { name, formula, kind: ROW|AGG, description? }
 *
 * فرمول با پارسر امن بررسی می‌شود؛ فرمول نامعتبر ساخته نمی‌شود.
 */
export async function GET(req: NextRequest) {
  try {
    const me = await requireAuth(req);
    const indicators = await db.customIndicator.findMany({
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { name: true } } },
      take: 200,
    });
    return json({ indicators });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireAuth(req);
    const body = await readBody<{ name?: string; formula?: string; kind?: string; description?: string }>(req);
    const name = (body.name || "").trim();
    const formula = (body.formula || "").trim();
    const kind = body.kind === "AGG" ? "AGG" : "ROW";
    if (!name) throw new ApiError("نام شاخص الزامی است", 400);
    if (!formula) throw new ApiError("فرمول شاخص الزامی است", 400);

    try {
      parseFormula(formula);
    } catch (err) {
      throw new ApiError(`فرمول نامعتبر: ${(err as Error).message}`, 400);
    }
    if (kind === "AGG") {
      const cols = formulaColumns(parseFormula(formula));
      // شاخص کل باید حداقل یک تابع تجمیعی داشته باشد — ساده‌ترین بررسی: وجود SUM/AVG/…
      if (!/\b(SUM|AVG|COUNT|MIN|MAX|MEDIAN|STD)\s*\(/i.test(formula.toUpperCase()))
        throw new ApiError("شاخص کل باید از توابع تجمیعی مثل SUM([ستون]) استفاده کند", 400);
      void cols;
    }

    const dup = await db.customIndicator.findFirst({ where: { name } });
    if (dup) throw new ApiError("شاخصی با این نام قبلاً ساخته شده است", 409);

    const ind = await db.customIndicator.create({
      data: {
        name,
        formula,
        kind,
        description: (body.description || "").trim(),
        createdById: me.id,
      },
      include: { createdBy: { select: { name: true } } },
    });
    await audit({
      userId: me.id, userName: me.name, action: "ساخت شاخص سفارشی",
      entity: "CustomIndicator", details: `${name} = ${formula}`,
    });
    return json({ indicator: ind }, 201);
  } catch (e) {
    return apiError(e);
  }
}
