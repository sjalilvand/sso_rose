import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, ApiError } from "@/lib/auth";
import { apiError, json } from "@/lib/api";
import { UNITS } from "@/lib/permissions";
import type { Role } from "@/lib/permissions";

/**
 * فهرست اطلاعیه‌های مجاز برای کاربر فعلی
 * مخاطبان: همه / واحد / نقش / افراد مشخص
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const now = new Date();

    const announcements = await db.announcement.findMany({
      where: {
        OR: [
          { expireAt: null },
          { expireAt: { gt: now } },
        ],
      },
      include: {
        author: { select: { name: true, avatarColor: true } },
        acks: { select: { userId: true, viewedAt: true, acknowledgedAt: true } },
      },
      orderBy: [{ pinned: "desc" }, { publishAt: "desc" }],
    });

    const visible = announcements.filter((a) => {
      switch (a.audience) {
        case "ALL":
          return true;
        case "UNIT":
          return a.audienceRef.split(",").map((s) => s.trim()).includes(user.unit);
        case "ROLE":
          return a.audienceRef.split(",").map((s) => s.trim()).includes(user.role);
        case "USERS":
          return a.audienceRef.split(",").map((s) => s.trim()).includes(user.id);
        default:
          return false;
      }
    });

    return json({
      announcements: visible.map((a) => {
        const myAck = a.acks.find((x) => x.userId === user.id);
        return {
          id: a.id,
          title: a.title,
          content: a.content,
          importance: a.importance,
          audience: a.audience,
          audienceRef: a.audienceRef,
          requiresAck: a.requiresAck,
          pinned: a.pinned,
          publishAt: a.publishAt,
          expireAt: a.expireAt,
          authorName: a.author.name,
          authorColor: a.author.avatarColor,
          viewedAt: myAck?.viewedAt || null,
          acknowledgedAt: myAck?.acknowledgedAt || null,
          ackStats: {
            total: a.acks.length,
            acknowledged: a.acks.filter((x) => x.acknowledgedAt).length,
          },
        };
      }),
    });
  } catch (e) {
    return apiError(e);
  }
}

/** انتشار اطلاعیه */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    if (user.role === "STAFF" || user.role === "EXTERNAL")
      throw new ApiError("شما مجوز انتشار اطلاعیه را ندارید", 403);

    const body = await req.json();
    if (!body.title || !body.content) return json({ error: "عنوان و متن اطلاعیه الزامی است" }, 400);

    const ann = await db.announcement.create({
      data: {
        title: body.title,
        content: body.content,
        importance: body.importance || "NORMAL",
        audience: body.audience || "ALL",
        audienceRef: body.audienceRef || "",
        requiresAck: !!body.requiresAck,
        publishAt: body.publishAt ? new Date(body.publishAt) : new Date(),
        expireAt: body.expireAt ? new Date(body.expireAt) : null,
        authorId: user.id,
      },
    });

    // اعلان برای مخاطبان
    const users = await db.user.findMany({
      where: { status: "ACTIVE", id: { not: user.id } },
      select: { id: true, unit: true, role: true },
    });
    const targets = users.filter((u) => {
      switch (ann.audience) {
        case "ALL": return true;
        case "UNIT": return ann.audienceRef.split(",").map((s) => s.trim()).includes(u.unit);
        case "ROLE": return ann.audienceRef.split(",").map((s) => s.trim()).includes(u.role);
        case "USERS": return ann.audienceRef.split(",").map((s) => s.trim()).includes(u.id);
      }
    });
    if (targets.length) {
      await db.notification.createMany({
        data: targets.map((u) => ({
          userId: u.id,
          type: ann.importance === "URGENT" ? "announcement" : "announcement",
          title: ann.importance === "URGENT" ? "اطلاعیه فوری منتشر شد" : "اطلاعیه جدید منتشر شد",
          body: ann.title,
          link: "/announcements",
        })),
      });
    }

    return json({ announcement: ann }, 201);
  } catch (e) {
    return apiError(e);
  }
}
