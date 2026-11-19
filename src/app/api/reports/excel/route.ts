import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, audit, ApiError } from "@/lib/auth";
import { apiError, json } from "@/lib/api";
import { parseReportWorkbook, summarize } from "@/lib/excel-report";

/**
 * گزارش‌های اکسل چندماهه — بند ۷
 *
 * GET  /api/reports/excel          — فهرست فایل‌های بارگذاری‌شده (خلاصه)
 * POST /api/reports/excel          — بارگذاری یک یا چند فایل اکسل (FormData: files[] یا file)
 *
 * ساختار فایل مطابق قالب رسمی «خدمات آزاد»: ماه/سال از نام فایل یا عنوان شیت
 * تشخیص داده می‌شود؛ اگر برای یک ماه فایل قبلی موجود باشد، فایل جدید جایگزین می‌شود.
 */

export async function GET(req: NextRequest) {
  try {
    const me = await requireAuth(req);
    const canManage = me.role === "SUPER_ADMIN" || me.role === "UNIT_MANAGER";
    // گزارش سازمانی برای مدیران؛ بقیه فقط فایل‌های خودشان را می‌بینند
    const files = await db.reportFile.findMany({
      where: canManage ? {} : { uploadedById: me.id },
      select: {
        id: true, name: true, month: true, year: true, sheet: true,
        services: true, summary: true, nConsultants: true,
        uploadedById: true, createdAt: true,
      },
      orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
    });
    return json({ files });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireAuth(req);
    const canManage = me.role === "SUPER_ADMIN" || me.role === "UNIT_MANAGER";
    if (!canManage && !me.id)
      throw new ApiError("شما مجوز بارگذاری گزارش را ندارید", 403);

    const form = await req.formData();
    const files = [...form.getAll("files"), ...form.getAll("file")] as File[];
    if (!files.length) throw new ApiError("حداقل یک فایل اکسل انتخاب کنید", 400);

    const results: Array<{ name: string; ok: boolean; month?: number; year?: number; n?: number; error?: string }> = [];
    for (const f of files) {
      try {
        if (!/\.(xlsx|xls|csv)$/i.test(f.name))
          throw new Error("فرمت فایل پشتیبانی نمی‌شود (xlsx / xls / csv)");
        const buf = await f.arrayBuffer();
        const parsed = parseReportWorkbook(buf, f.name);
        if (!parsed.nConsultants && !parsed.grand)
          throw new Error("ساختار فایل شناسایی نشد — این قالب گزارش خدمات نیست");

        // برای ماه تکراری، فایل جدید جایگزین می‌شود
        if (parsed.month && parsed.year) {
          await db.reportFile.deleteMany({
            where: { month: parsed.month, year: parsed.year },
          });
        }
        const rec = await db.reportFile.create({
          data: {
            name: f.name,
            month: parsed.month,
            year: parsed.year,
            sheet: parsed.sheet,
            services: JSON.stringify(parsed.blocks),
            records: JSON.stringify(parsed.consultants),
            summary: JSON.stringify(summarize(parsed)),
            nConsultants: parsed.nConsultants,
            uploadedById: me.id,
          },
        });
        results.push({ name: f.name, ok: true, month: rec.month, year: rec.year, n: parsed.nConsultants });
      } catch (err) {
        results.push({ name: f.name, ok: false, error: (err as Error).message });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    if (okCount > 0) {
      await audit({
        userId: me.id, userName: me.name, action: "بارگذاری گزارش اکسل",
        entity: "ReportFile", details: `${okCount} فایل از ${files.length} فایل پردازش شد`,
      });
    }
    return json({ results }, 201);
  } catch (e) {
    return apiError(e);
  }
}
