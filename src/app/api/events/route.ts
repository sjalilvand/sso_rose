import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiError, json } from "@/lib/api";

/**
 * رویدادهای تقویم — شخصی، تیمی و سازمانی
 * رویدادهایی نمایش داده می‌شود که کاربر مالک یا دعوت‌شده آن است
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const events = await db.calendarEvent.findMany({
      where: {
        AND: [
          { OR: [{ ownerId: user.id }, { attendees: { some: { userId: user.id } } }] },
          from ? { start: { gte: new Date(from) } } : {},
          to ? { start: { lte: new Date(to) } } : {},
        ],
      },
      include: {
        owner: { select: { id: true, name: true, avatarColor: true } },
        attendees: {
          include: { user: { select: { id: true, name: true, avatarColor: true } } },
        },
      },
      orderBy: { start: "asc" },
    });

    return json({ events });
  } catch (e) {
    return apiError(e);
  }
}

/** ثبت رویداد جدید */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    if (!body.title || !body.start) return json({ error: "عنوان و زمان شروع الزامی است" }, 400);

    const event = await db.calendarEvent.create({
      data: {
        title: body.title,
        description: body.description || "",
        type: body.type || "MEETING",
        start: new Date(body.start),
        end: body.end ? new Date(body.end) : null,
        allDay: !!body.allDay,
        location: body.location || "",
        repeat: body.repeat || "NONE",
        ownerId: user.id,
        attendees: {
          create: (body.attendeeIds || [])
            .filter((id: string) => id !== user.id)
            .map((id: string) => ({ userId: id })),
        },
      },
    });

    // اعلان دعوت
    const attendeeIds: string[] = (body.attendeeIds || []).filter((id: string) => id !== user.id);
    if (attendeeIds.length) {
      await db.notification.createMany({
        data: attendeeIds.map((id: string) => ({
          userId: id,
          type: "event",
          title: "به رویدادی دعوت شدید",
          body: event.title,
          link: "/calendar",
        })),
      });
    }

    return json({ event }, 201);
  } catch (e) {
    return apiError(e);
  }
}
