import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { requireAuth, hashPassword, audit, ApiError } from "@/lib/auth";
import { apiError, json } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { IMPORT_HEADERS, parseConsultantsWorkbook, type ParsedRow } from "@/lib/import-users";

const AVATAR_COLORS = ["#9c27b0", "#0f766e", "#c2185b", "#d97706", "#0369a1", "#7c3aed", "#6366f1", "#dc2626"];
const ROLES = new Set(["SUPER_ADMIN", "UNIT_MANAGER", "THERAPIST", "STAFF", "TEACHER", "EXTERNAL"]);

function colorFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** اعطای دسترسی سامانه‌ها — فقط مواردی که قبلاً ندارند (skipDuplicates در SQLite پشتیبانی نمی‌شود) */
async function grantSystems(userId: string, systemIds: string[]) {
  if (!systemIds.length) return;
  const existing = await db.systemAccess.findMany({
    where: { userId, systemId: { in: systemIds } },
    select: { systemId: true },
  });
  const have = new Set(existing.map((e) => e.systemId));
  const missing = systemIds.filter((s) => !have.has(s));
  if (missing.length) {
    await db.systemAccess.createMany({
      data: missing.map((systemId) => ({ userId, systemId })),
    });
  }
}

// ---------- دانلود قالب اکسل ----------
export async function GET(req: NextRequest) {
  try {
    const me = await requireAuth(req);
    if (!hasPermission(me.role, "users.manage"))
      throw new ApiError("شما مجوز مدیریت کاربران را ندارید", 403);

    const wb = XLSX.utils.book_new();

    const ws = XLSX.utils.aoa_to_sheet([
      [...IMPORT_HEADERS],
      ["تهران", "نام و نام خانوادگی نمونه", "کارشناسی ارشد", "دارد", "متخصص", "1001", "009031", "101001", "000000000000000000000000", "0012345678", "09121234567"],
    ]);
    ws["!cols"] = [16, 26, 16, 14, 14, 14, 12, 14, 26, 14, 14].map((w) => ({ wch: w }));
    (ws as unknown as { "!views": unknown[] })["!views"] = [{ RTL: true }];
    XLSX.utils.book_append_sheet(wb, ws, "مشخصات مشاوره ها");

    const guide = XLSX.utils.aoa_to_sheet([
      ["راهنمای تکمیل فایل ورود گروهی کاربران — رز هاب"],
      [],
      ["کد ملی", "نام کاربری ورود کاربر است — ۱۰ رقم (صفرهای ابتدایی حفظ شود)"],
      ["شماره تماس", "رمز عبور اولیه کاربر است — ترجیحاً شماره موبایل ۱۱ رقمی"],
      ["نام و نام خانوادگی", "الزامی"],
      ["استان، مدرک تحصیلی، پروانه اشتغال، رتبه حرفه‌ای", "اختیاری — در پروفایل کاربر ذخیره می‌شود"],
      ["شماره قرارداد، کد استانها، کد تفضیلی شخص، شماره شبا", "اختیاری — صفرهای ابتدایی را حذف نکنید"],
      [],
      ["نکته", "اگر کاربری با همان کد ملی قبلاً ثبت شده باشد، مشخصات او به‌روزرسانی می‌شود"],
    ]);
    (guide as unknown as { "!views": unknown[] })["!views"] = [{ RTL: true }];
    guide["!cols"] = [{ wch: 30 }, { wch: 70 }];
    XLSX.utils.book_append_sheet(wb, guide, "راهنما");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const fname = encodeURIComponent("قالب-ورود-کاربران-رز-هاب.xlsx");
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="rose-hub-users-template.xlsx"; filename*=UTF-8''${fname}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}

// ---------- پیش‌نمایش و ثبت گروهی ----------
export async function POST(req: NextRequest) {
  try {
    const me = await requireAuth(req);
    if (!hasPermission(me.role, "users.manage"))
      throw new ApiError("شما مجوز مدیریت کاربران را ندارید", 403);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0)
      throw new ApiError("فایل اکسل را انتخاب کنید", 400);
    if (file.size > 10 * 1024 * 1024) throw new ApiError("حجم فایل نباید بیشتر از ۱۰ مگابایت باشد", 400);

    const mode = String(form.get("mode") || "preview");
    const buf = Buffer.from(await file.arrayBuffer());

    let parsed;
    try {
      parsed = parseConsultantsWorkbook(buf);
    } catch {
      throw new ApiError("خواندن فایل ممکن نشد — فایل اکسل معتبر مطابق قالب بارگذاری کنید", 400);
    }
    if (!parsed.rows.length)
      throw new ApiError("هیچ ردیفی در فایل یافت نشد — ستون‌ها و داده‌ها را مطابق قالب بررسی کنید", 400);

    // تعیین وضعیت create/update بر اساس کد ملی موجود در پایگاه داده
    const usernames = [...new Set(parsed.rows.filter((r) => r.nationalId).map((r) => r.nationalId))];
    const existing = await db.user.findMany({
      where: { username: { in: usernames } },
      select: { id: true, username: true },
    });
    const existingSet = new Set(existing.map((u) => u.username));
    for (const r of parsed.rows) {
      if (r.error) continue;
      r.action = existingSet.has(r.nationalId) ? "update" : "create";
    }
    parsed.summary.create = parsed.rows.filter((r) => !r.error && r.action === "create").length;
    parsed.summary.update = parsed.rows.filter((r) => !r.error && r.action === "update").length;

    if (mode === "preview") {
      return json(parsed);
    }

    // ---------- ثبت نهایی ----------
    if (parsed.summary.create + parsed.summary.update === 0)
      throw new ApiError("هیچ ردیف قابل ثبتی وجود ندارد — خطاهای پیش‌نمایش را برطرف کنید", 400);

    let role = String(form.get("role") || "THERAPIST");
    if (!ROLES.has(role)) role = "THERAPIST";
    const unit = String(form.get("unit") || "درمان");
    const jobTitle = String(form.get("jobTitle") || "مشاور");
    const resetPassword = String(form.get("resetPassword") || "1") !== "0";
    let systemIds: string[] = [];
    try {
      const raw = JSON.parse(String(form.get("systemIds") || "[]"));
      if (Array.isArray(raw)) systemIds = raw.map(String).filter((s) => /^[a-z0-9]+$/i.test(s));
    } catch {
      systemIds = [];
    }

    const valid = parsed.rows.filter((r) => !r.error);
    let created = 0;
    let updated = 0;
    const failed: Array<{ row: number; name: string; reason: string }> = [];

    for (const r of valid) {
      try {
        const base = {
          name: r.name,
          phone: r.phone,
          province: r.province,
          education: r.education,
          workLicense: r.workLicense,
          profRank: r.profRank,
          contractNo: r.contractNo,
          provinceCode: r.provinceCode,
          personalCode: r.personalCode,
          bankSheba: r.bankSheba,
        };
        const existingUser = await db.user.findUnique({ where: { username: r.nationalId } });

        if (existingUser) {
          const data: Record<string, unknown> = { ...base };
          if (resetPassword) data.passwordHash = hashPassword(r.phone);
          await db.user.update({ where: { id: existingUser.id }, data });
          await grantSystems(existingUser.id, systemIds);
          updated++;
        } else {
          // ایمیل خودکار بر پایه کد ملی — در صورت تکرار، پسوند جایگزین
          let email = `${r.nationalId}@rose.ir`;
          if (await db.user.findUnique({ where: { email } })) email = `${r.nationalId}@users.rose.ir`;
          if (await db.user.findUnique({ where: { email } }))
            throw new Error("ایمیل خودکار معتبر تولید نشد");
          const newUser = await db.user.create({
            data: {
              email,
              username: r.nationalId,
              passwordHash: hashPassword(r.phone),
              name: r.name,
              role,
              unit,
              jobTitle,
              avatarColor: colorFor(r.nationalId),
              status: "ACTIVE",
              ...base,
            },
          });
          await grantSystems(newUser.id, systemIds);
          created++;
        }
      } catch (err) {
        failed.push({
          row: r.row,
          name: r.name,
          reason: err instanceof Error ? err.message : "خطای نامشخص",
        });
      }
    }

    await audit({
      userId: me.id,
      userName: me.name,
      action: "ورود گروهی کاربران از فایل اکسل",
      entity: "user",
      details: `ایجاد: ${created} — بروزرسانی: ${updated} — خطا: ${failed.length} — فایل: ${file.name}`,
    });

    return json({ created, updated, failed, total: valid.length, fileName: file.name });
  } catch (e) {
    return apiError(e);
  }
}

export type { ParsedRow };
