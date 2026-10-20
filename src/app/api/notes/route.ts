import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiError, json } from "@/lib/api";

/**
 * یادداشت‌ها — یادداشت شخصی فقط برای نویسنده است و
 * پیش‌فرض برای مدیران هم قابل مشاهده نیست (الزام سند بند ۵.۷)
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const notes = await db.note.findMany({
      where: {
        OR: [
          { authorId: user.id, type: "PERSONAL" },
          { type: "SHARED", shares: { some: { userId: user.id } } },
          { type: "SHARED", authorId: user.id },
        ],
      },
      include: {
        author: { select: { name: true, avatarColor: true } },
        shares: { include: { user: { select: { name: true, avatarColor: true } } } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return json({ notes });
  } catch (e) {
    return apiError(e);
  }
}

/** ثبت یادداشت */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    if (!body.title) return json({ error: "عنوان یادداشت الزامی است" }, 400);

    const type = body.type === "SHARED" ? "SHARED" : "PERSONAL";
    const shareIds: string[] = type === "SHARED" ? body.shareIds || [] : [];

    const note = await db.note.create({
      data: {
        title: body.title,
        content: body.content || "",
        type,
        color: body.color || "#fde7ef",
        tags: Array.isArray(body.tags) ? body.tags.join(",") : body.tags || "",
        authorId: user.id,
        shares: {
          create: shareIds
            .filter((id: string) => id !== user.id)
            .map((id: string) => ({ userId: id })),
        },
      },
    });
    return json({ note }, 201);
  } catch (e) {
    return apiError(e);
  }
}
