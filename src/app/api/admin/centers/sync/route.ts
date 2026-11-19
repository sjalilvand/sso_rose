import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, audit, ApiError } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";

/**
 * همگام‌سازی اطلاعات پایهٔ مراکز از سامانهٔ حضور و غیاب (تکنورز) — بند ۱
 *
 * POST /api/admin/centers/sync  { systemId? }
 *
 * با clientId/clientSecret ثبت‌شدهٔ همان سامانه، فهرست شعب/کلینیک‌ها را از
 * GET /api/v1/org/hub-branches/ دریافت و مراکز رز هاب را به‌روز می‌کند
 * (ایجاد، ویرایش نام/استان/آدرس/مختصات/شعاع). رکوردهای قبلی با کد یکسان
 * بروزرسانی می‌شوند — هیچ داده‌ای از دست نمی‌رود.
 */

interface HubBranch {
  code: string; name: string; region?: string | null; province?: string | null;
  city?: string | null; address?: string | null; phone?: string | null;
  geo_latitude?: number | null; geo_longitude?: number | null;
  geo_radius_m?: number | null; is_active?: boolean | null;
  manager_name?: string | null; kind?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireAuth(req);
    if (!hasPermission(me.role, "users.manage"))
      throw new ApiError("شما مجوز مدیریت اطلاعات پایه را ندارید", 403);

    const body = await readBody<{ systemId?: string }>(req).catch(() => ({ systemId: undefined }));

    const systems = await db.clinicSystem.findMany();
    const sys =
      (body.systemId && systems.find((s) => s.id === body.systemId)) ||
      systems.find((s) => (s.clientId || "").startsWith("rose-techno")) ||
      systems.find((s) => s.url.includes(":8085"));
    if (!sys || !sys.clientId || !sys.clientSecret)
      throw new ApiError("سامانهٔ حضور و غیاب با clientId/clientSecret یافت نشد", 404);

    const base = sys.url.replace(/\/+$/, "");
    const url = `${base}/api/v1/org/hub-branches/?clientId=${encodeURIComponent(sys.clientId)}&clientSecret=${encodeURIComponent(sys.clientSecret)}`;
    let branches: HubBranch[];
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        throw new ApiError(`سامانهٔ حضور و غیاب پاسخ ${res.status} داد — مطمئن شوید نسخهٔ سامانهٔ حضور و غیاب به‌روز است`, 502);
      }
      const data = (await res.json()) as { branches?: HubBranch[] };
      branches = data.branches || [];
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError("ارتباط با سامانهٔ حضور و غیاب برقرار نشد — آدرس: " + base, 502);
    }

    let created = 0;
    let updated = 0;
    const skipped: string[] = [];
    for (const b of branches) {
      const code = (b.code || "").trim();
      const name = (b.name || "").trim();
      if (!code || !name) { skipped.push(name || code); continue; }
      const lat = typeof b.geo_latitude === "number" ? b.geo_latitude : null;
      const lng = typeof b.geo_longitude === "number" ? b.geo_longitude : null;
      const type = b.kind === "HQ" || /ستاد/.test(name) ? "HQ" : /مرکز/.test(name) && !/کلینیک/.test(name) ? "CENTER" : "CLINIC";
      const data = {
        name,
        type,
        region: (b.region || "").trim(),
        province: (b.province || "").trim(),
        city: (b.city || "").trim(),
        address: (b.address || "").trim(),
        phone: (b.phone || "").trim(),
        lat,
        lng,
        radiusM: typeof b.geo_radius_m === "number" && b.geo_radius_m > 0 ? b.geo_radius_m : 300,
        isActive: b.is_active !== false,
        source: "TECHNORZ",
      };
      const existing = await db.center.findUnique({ where: { code } });
      if (existing) {
        await db.center.update({ where: { code }, data });
        updated++;
      } else {
        await db.center.create({ data: { code, ...data } });
        created++;
      }
    }

    await audit({
      userId: me.id, userName: me.name, action: "همگام‌سازی مراکز",
      entity: "Center",
      details: `از سامانهٔ ${sys.name}: ${created} ایجاد، ${updated} بروزرسانی`,
    });
    return json({ ok: true, total: branches.length, created, updated, skipped });
  } catch (e) {
    return apiError(e);
  }
}
