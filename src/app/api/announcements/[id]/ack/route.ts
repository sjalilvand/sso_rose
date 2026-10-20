import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, ApiError, audit } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";

/**
 * ثبت وضعیت مطالعه اطلاعیه — طبق سند سه وضعیت جداگانه‌اند:
 * «دیده‌شدن» (viewed) و «تأیید مطالعه» (acknowledged)
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req);
    const { id } = await ctx.params;
    const body = await readBody<{ action?: "view" | "acknowledge" }>(req);

    const ann = await db.announcement.findUnique({ where: { id } });
    if (!ann) throw new ApiError("اطلاعیه یافت نشد", 404);

    const existing = await db.announcementAck.findUnique({
      where: { announcementId_userId: { announcementId: id, userId: user.id } },
    });

    if (body.action === "acknowledge") {
      if (existing) {
        await db.announcementAck.update({
          where: { id: existing.id },
          data: { acknowledgedAt: new Date() },
        });
      } else {
        await db.announcementAck.create({
          data: { announcementId: id, userId: user.id, acknowledgedAt: new Date() },
        });
      }
      await audit({
        userId: user.id,
        userName: user.name,
        action: "تأیید مطالعه اطلاعیه",
        entity: "announcement",
        details: ann.title,
      });
    } else {
      if (existing) {
        await db.announcementAck.update({
          where: { id: existing.id },
          data: { viewedAt: new Date() },
        });
      } else {
        await db.announcementAck.create({
          data: { announcementId: id, userId: user.id },
        });
      }
    }

    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

/** گزارش مشاهده‌کنندگان و تأییدکنندگان */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req);
    const { id } = await ctx.params;
    const ann = await db.announcement.findUnique({ where: { id } });
    if (!ann) throw new ApiError("اطلاعیه یافت نشد", 404);
    if (ann.authorId !== user.id && user.role !== "SUPER_ADMIN")
      throw new ApiError("مجوز مشاهده گزارش مطالعه را ندارید", 403);

    const acks = await db.announcementAck.findMany({
      where: { announcementId: id },
      include: { user: { select: { name: true, unit: true, avatarColor: true } } },
    });
    const totalUsers = await db.user.count({ where: { status: "ACTIVE" } });

    return json({
      totalUsers,
      records: acks.map((a) => ({
        userName: a.user.name,
        unit: a.user.unit,
        avatarColor: a.user.avatarColor,
        viewedAt: a.viewedAt,
        acknowledgedAt: a.acknowledgedAt,
      })),
    });
  } catch (e) {
    return apiError(e);
  }
}
