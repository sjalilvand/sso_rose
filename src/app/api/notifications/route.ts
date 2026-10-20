import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiError, json } from "@/lib/api";

/** فهرست اعلان‌های کاربر */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const notifications = await db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return json({ notifications, unread: notifications.filter((n) => !n.read).length });
  } catch (e) {
    return apiError(e);
  }
}

/** خواندن همه یا یکی */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    if (body.id) {
      await db.notification.updateMany({
        where: { id: body.id, userId: user.id },
        data: { read: true },
      });
    } else {
      await db.notification.updateMany({ where: { userId: user.id }, data: { read: true } });
    }
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
