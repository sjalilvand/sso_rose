import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, ApiError } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";

/** ویرایش رویداد */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req);
    const { id } = await ctx.params;
    const event = await db.calendarEvent.findUnique({ where: { id } });
    if (!event) throw new ApiError("رویداد یافت نشد", 404);
    if (event.ownerId !== user.id) throw new ApiError("فقط برگزارکننده می‌تواند رویداد را ویرایش کند", 403);

    const body = await readBody<{
      title?: string;
      description?: string;
      type?: string;
      start?: string;
      end?: string | null;
      location?: string;
    }>(req);

    const data: Record<string, unknown> = {};
    if (body.title) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.type) data.type = body.type;
    if (body.start) data.start = new Date(body.start);
    if (body.end !== undefined) data.end = body.end ? new Date(body.end) : null;
    if (body.location !== undefined) data.location = body.location;

    await db.calendarEvent.update({ where: { id }, data });
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

/** حذف رویداد */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req);
    const { id } = await ctx.params;
    const event = await db.calendarEvent.findUnique({ where: { id } });
    if (!event) throw new ApiError("رویداد یافت نشد", 404);
    if (event.ownerId !== user.id) throw new ApiError("فقط برگزارکننده می‌تواند رویداد را حذف کند", 403);
    await db.calendarEvent.delete({ where: { id } });
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

/** پاسخ به دعوت */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req);
    const { id } = await ctx.params;
    const { response } = await readBody<{ response?: string }>(req);
    if (!response || !["YES", "NO", "MAYBE"].includes(response))
      return json({ error: "پاسخ نامعتبر است" }, 400);
    await db.eventAttendee.update({
      where: { eventId_userId: { eventId: id, userId: user.id } },
      data: { response },
    });
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
