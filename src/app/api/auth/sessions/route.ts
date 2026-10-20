import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiError, json } from "@/lib/api";

/** فهرست نشست‌های فعال کاربر */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const sessions = await db.session.findMany({
      where: { userId: user.id },
      orderBy: { lastSeen: "desc" },
    });
    return json({ sessions });
  } catch (e) {
    return apiError(e);
  }
}

/** خروج از یک دستگاه */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return json({ error: "شناسه نشست الزامی است" }, 400);
    const session = await db.session.findUnique({ where: { id } });
    if (!session || session.userId !== user.id) return json({ error: "نشست یافت نشد" }, 404);
    await db.session.update({ where: { id }, data: { revoked: true } });
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
