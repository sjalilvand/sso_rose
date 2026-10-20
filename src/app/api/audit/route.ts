import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, ApiError } from "@/lib/auth";
import { apiError, json } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";

/** گزارش فعالیت‌های حساس (Audit) — ویژه مدیر کل */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    if (!hasPermission(user.role, "audit.view"))
      throw new ApiError("شما مجوز مشاهده گزارش فعالیت‌ها را ندارید", 403);

    const { searchParams } = new URL(req.url);
    const take = Math.min(Number(searchParams.get("take") || 100), 200);

    const logs = await db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take,
    });
    return json({ logs });
  } catch (e) {
    return apiError(e);
  }
}
