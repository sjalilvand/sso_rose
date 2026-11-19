import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, audit, ApiError } from "@/lib/auth";
import { apiError, json } from "@/lib/api";
import { parseUniversalWorkbook } from "@/lib/excel-universal";

/**
 * داشبورد عمومی اکسل — هر فایل با هر ساختاری (فاز ۷۳)
 *
 * GET  /api/reports/dataset  — فهرست مجموعه‌داده‌های بارگذاری‌شده
 * POST /api/reports/dataset  — بارگذاری فایل (FormData: files[] یا file)
 *
 * ستون‌ها، نوع‌ها و پروفایل آماری به‌صورت خودکار تشخیص داده می‌شوند؛
 * داشبوردهای توصیفی/تحلیلی/تفسیری/مدل‌سازی/پیشنهادی روی همین داده ساخته می‌شوند.
 */

const MAX_FILE_MB = 15;

export async function GET(req: NextRequest) {
  try {
    const me = await requireAuth(req);
    const canManage = me.role === "SUPER_ADMIN" || me.role === "UNIT_MANAGER";
    const datasets = await db.excelDataset.findMany({
      where: canManage ? {} : { uploadedById: me.id },
      select: {
        id: true, name: true, sheetNames: true, activeSheet: true,
        columns: true, profile: true, nRows: true, nRowsTotal: true,
        uploadedById: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return json({ datasets });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireAuth(req);
    const form = await req.formData();
    const files = [...form.getAll("files"), ...form.getAll("file")] as File[];
    if (!files.length) throw new ApiError("حداقل یک فایل اکسل انتخاب کنید", 400);

    const results: Array<{ name: string; ok: boolean; id?: string; rows?: number; sheets?: number; error?: string }> = [];
    for (const f of files) {
      try {
        if (!/\.(xlsx|xls|csv)$/i.test(f.name))
          throw new ApiError("فرمت فایل پشتیبانی نمی‌شود (xlsx / xls / csv)", 400);
        if (f.size > MAX_FILE_MB * 1024 * 1024)
          throw new ApiError(`حجم فایل بیش از ${MAX_FILE_MB} مگابایت است`, 400);

        const buf = await f.arrayBuffer();
        const parsed = parseUniversalWorkbook(buf, f.name);
        const main = parsed.sheets[0];

        const rec = await db.excelDataset.create({
          data: {
            name: f.name,
            sheetNames: JSON.stringify(parsed.sheets.map((s) => s.name)),
            activeSheet: main.name,
            columns: JSON.stringify(main.columns),
            rows: JSON.stringify(parsed.sheets),
            profile: JSON.stringify(main.profile),
            nRows: main.rows.length,
            nRowsTotal: parsed.nRowsTotal,
            uploadedById: me.id,
          },
        });
        results.push({
          name: f.name, ok: true, id: rec.id,
          rows: main.rows.length, sheets: parsed.sheets.length,
        });
      } catch (err) {
        results.push({ name: f.name, ok: false, error: (err as Error).message });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    if (okCount > 0) {
      await audit({
        userId: me.id, userName: me.name, action: "بارگذاری دادهٔ عمومی اکسل",
        entity: "ExcelDataset", details: `${okCount} فایل از ${files.length} فایل پردازش شد`,
      });
    }
    return json({ results }, 201);
  } catch (e) {
    return apiError(e);
  }
}
