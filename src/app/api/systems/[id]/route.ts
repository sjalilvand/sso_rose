import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, ApiError, audit } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";

/** ویرایش سامانه */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireAuth(req);
    if (me.role !== "SUPER_ADMIN") throw new ApiError("شما مجوز مدیریت سامانه‌ها را ندارید", 403);
    const { id } = await ctx.params;
    const body = await readBody<{
      name?: string;
      url?: string;
      description?: string;
      icon?: string;
      color?: string;
      connectionLevel?: string;
      status?: string;
      sortOrder?: number;
    }>(req);

    const data: Record<string, unknown> = {};
    for (const key of ["name", "url", "description", "icon", "color", "connectionLevel", "status", "sortOrder"]) {
      if (body[key as keyof typeof body] !== undefined) data[key] = body[key as keyof typeof body];
    }
    const sys = await db.clinicSystem.update({ where: { id }, data });
    await audit({
      userId: me.id,
      userName: me.name,
      action: "ویرایش سامانه",
      entity: "system",
      details: `${sys.name} — اتصال: ${sys.connectionLevel === "ADVANCED" ? "پیشرفته" : "پایه"}`,
    });
    return json({ system: sys });
  } catch (e) {
    return apiError(e);
  }
}

/** حذف سامانه */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireAuth(req);
    if (me.role !== "SUPER_ADMIN") throw new ApiError("شما مجوز مدیریت سامانه‌ها را ندارید", 403);
    const { id } = await ctx.params;
    const sys = await db.clinicSystem.delete({ where: { id } });
    await audit({ userId: me.id, userName: me.name, action: "حذف سامانه", entity: "system", details: sys.name });
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
