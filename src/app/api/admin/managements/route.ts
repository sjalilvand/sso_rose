import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, audit, ApiError } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";

/**
 * مدیریت‌های سازمانی — بند ۴ + فاز ۷۴
 * ثبت مدیریت، تعیین مدیر آن و اتصال به هر تعداد مرکز/کلینیکِ فرم «مراکز و کلینیک‌ها»
 * GET  /api/admin/managements
 * POST /api/admin/managements  { name, description?, centerIds?: string[], managerId? }
 */

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const managements = await db.management.findMany({
      include: {
        manager: { select: { id: true, name: true, avatarColor: true, jobTitle: true } },
        center: { select: { id: true, name: true, type: true } },
        links: {
          orderBy: { createdAt: "asc" },
          select: { center: { select: { id: true, name: true, type: true, province: true, code: true } } },
        },
        members: { select: { id: true, name: true, avatarColor: true, role: true, jobTitle: true, status: true } },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    const managementsOut = managements.map((m) => ({
      ...m,
      centers: m.links.map((l) => l.center),
      links: undefined,
    }));
    return json({ managements: managementsOut });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireAuth(req);
    if (!hasPermission(me.role, "users.manage"))
      throw new ApiError("شما مجوز مدیریت سازمان را ندارید", 403);

    const body = await readBody<{
      name?: string; description?: string; centerIds?: string[]; centerId?: string | null; managerId?: string | null;
    }>(req);
    const name = (body.name || "").trim();
    if (!name) throw new ApiError("نام مدیریت الزامی است", 400);
    const dup = await db.management.findUnique({ where: { name } });
    if (dup) throw new ApiError("مدیریتی با این نام قبلاً ثبت شده است", 409);

    // مراکز انتخاب‌شده باید واقعاً موجود باشند
    const centerIds = [...new Set((body.centerIds || []).filter(Boolean))];
    if (centerIds.length) {
      const found = await db.center.count({ where: { id: { in: centerIds } } });
      if (found !== centerIds.length) throw new ApiError("یکی از مراکز انتخاب‌شده یافت نشد", 400);
    }

    const mg = await db.management.create({
      data: {
        name,
        description: (body.description || "").trim(),
        centerId: centerIds[0] || body.centerId || null, // سازگاری با نسخهٔ قبلی — مرکز اول
        managerId: body.managerId || null,
        ...(centerIds.length ? { links: { create: centerIds.map((centerId) => ({ centerId })) } } : {}),
      },
      include: { manager: { select: { id: true, name: true } }, links: true },
    });

    // مدیر مدیریت به‌صورت خودکار عضو همان مدیریت می‌شود
    if (body.managerId) {
      await db.user.updateMany({
        where: { id: body.managerId, managementId: null },
        data: { managementId: mg.id },
      });
    }

    await audit({
      userId: me.id, userName: me.name, action: "ایجاد مدیریت", entity: "Management",
      details: `${name}${mg.manager ? " — مدیر: " + mg.manager.name : ""}${centerIds.length ? " — " + centerIds.length + " مرکز متصل" : ""}`,
    });
    return json({ management: mg }, 201);
  } catch (e) {
    return apiError(e);
  }
}
