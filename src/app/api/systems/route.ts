import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, ApiError } from "@/lib/auth";
import { apiError, json } from "@/lib/api";

/** فهرست سامانه‌ها بر اساس دسترسی کاربر */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const all = await db.clinicSystem.findMany({
      orderBy: { sortOrder: "asc" },
      include: { metrics: true },
    });

    const access = await db.systemAccess.findMany({ where: { userId: user.id } });
    const allowed = new Set(access.map((a) => a.systemId));

    return json({
      systems: all.map((s) => ({
        ...s,
        hasAccess: allowed.has(s.id) || user.role === "SUPER_ADMIN",
      })),
    });
  } catch (e) {
    return apiError(e);
  }
}

/** تعریف سامانه جدید (مدیر کل) */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    if (user.role !== "SUPER_ADMIN") throw new ApiError("شما مجوز مدیریت سامانه‌ها را ندارید", 403);
    const body = await req.json();
    if (!body.name || !body.url) return json({ error: "نام و نشانی سامانه الزامی است" }, 400);
    const count = await db.clinicSystem.count();
    const sys = await db.clinicSystem.create({
      data: {
        name: body.name,
        url: body.url,
        description: body.description || "",
        icon: body.icon || "Globe",
        color: body.color || "#c2185b",
        connectionLevel: body.connectionLevel || "BASIC",
        status: body.status || "در حال بررسی اتصال",
        sortOrder: count + 1,
      },
    });
    return json({ system: sys }, 201);
  } catch (e) {
    return apiError(e);
  }
}
