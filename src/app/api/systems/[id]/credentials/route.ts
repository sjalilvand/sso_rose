import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, ApiError, audit, generateSystemCredentials } from "@/lib/auth";
import { apiError, json } from "@/lib/api";

/**
 * تمدید رمز اتصال سامانه (فقط مدیر کل).
 * پس از تمدید، رمز قبلی باطل می‌شود و باید رمز جدید با تیم فنی سامانه هماهنگ شود.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireAuth(req);
    if (me.role !== "SUPER_ADMIN") throw new ApiError("شما مجوز مدیریت سامانه‌ها را ندارید", 403);
    const { id } = await ctx.params;

    const system = await db.clinicSystem.findUnique({ where: { id } });
    if (!system) throw new ApiError("سامانه یافت نشد", 404);

    const creds = generateSystemCredentials(system.name);
    const updated = await db.clinicSystem.update({
      where: { id },
      data: { clientId: creds.clientId, clientSecret: creds.clientSecret },
    });

    await audit({
      userId: me.id,
      userName: me.name,
      action: "تمدید رمز اتصال SSO سامانه",
      entity: "system",
      details: system.name,
    });

    return json({ clientId: updated.clientId, clientSecret: updated.clientSecret });
  } catch (e) {
    return apiError(e);
  }
}
