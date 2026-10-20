import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiError, json } from "@/lib/api";

/** جستجوی سراسری با رعایت سطح دسترسی */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    if (q.length < 2) return json({ results: [] });

    const [tasks, announcements, notes, events] = await Promise.all([
      db.task.findMany({
        where: {
          AND: [
            user.role === "EXTERNAL" ? { assigneeId: user.id } : { OR: [{ assigneeId: user.id }, { creatorId: user.id }] },
            { OR: [{ title: { contains: q } }, { description: { contains: q } }] },
          ],
        },
        take: 5,
        select: { id: true, title: true, status: true },
      }),
      db.announcement.findMany({
        where: { OR: [{ title: { contains: q } }, { content: { contains: q } }] },
        take: 5,
        select: { id: true, title: true, audience: true, audienceRef: true },
      }),
      db.note.findMany({
        where: {
          AND: [
            {
              OR: [
                { authorId: user.id },
                { type: "SHARED", shares: { some: { userId: user.id } } },
              ],
            },
            { OR: [{ title: { contains: q } }, { content: { contains: q } }] },
          ],
        },
        take: 5,
        select: { id: true, title: true },
      }),
      db.calendarEvent.findMany({
        where: {
          AND: [
            { OR: [{ ownerId: user.id }, { attendees: { some: { userId: user.id } } }] },
            { title: { contains: q } },
          ],
        },
        take: 5,
        select: { id: true, title: true, start: true },
      }),
    ]);

    // فیلتر مخاطبان اطلاعیه‌ها
    const visibleAnnouncements = announcements.filter((a) => {
      switch (a.audience) {
        case "ALL": return true;
        case "UNIT": return a.audienceRef.split(",").map((s) => s.trim()).includes(user.unit);
        case "ROLE": return a.audienceRef.split(",").map((s) => s.trim()).includes(user.role);
        case "USERS": return a.audienceRef.split(",").map((s) => s.trim()).includes(user.id);
      }
    });

    return json({
      results: [
        ...tasks.map((t) => ({ type: "task", id: t.id, title: t.title, href: "/tasks" })),
        ...visibleAnnouncements.map((a) => ({ type: "announcement", id: a.id, title: a.title, href: "/announcements" })),
        ...notes.map((n) => ({ type: "note", id: n.id, title: n.title, href: "/notes" })),
        ...events.map((e) => ({ type: "event", id: e.id, title: e.title, href: "/calendar" })),
      ],
    });
  } catch (e) {
    return apiError(e);
  }
}
