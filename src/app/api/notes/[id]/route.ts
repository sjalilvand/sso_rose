import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, ApiError } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";

/** ویرایش یادداشت (نویسنده یا اعضای مشترک) */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req);
    const { id } = await ctx.params;
    const note = await db.note.findUnique({
      where: { id },
      include: { shares: true },
    });
    if (!note) throw new ApiError("یادداشت یافت نشد", 404);

    const canEdit = note.authorId === user.id || note.shares.some((s) => s.userId === user.id);
    if (!canEdit) throw new ApiError("شما مجوز ویرایش این یادداشت را ندارید", 403);

    const body = await readBody<{
      title?: string;
      content?: string;
      color?: string;
      tags?: string;
    }>(req);

    const data: Record<string, unknown> = {};
    if (body.title) data.title = body.title;
    if (body.content !== undefined) data.content = body.content;
    if (body.color) data.color = body.color;
    if (body.tags !== undefined) data.tags = body.tags;

    await db.note.update({ where: { id }, data });
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

/** حذف یادداشت (فقط نویسنده) */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req);
    const { id } = await ctx.params;
    const note = await db.note.findUnique({ where: { id } });
    if (!note) throw new ApiError("یادداشت یافت نشد", 404);
    if (note.authorId !== user.id) throw new ApiError("فقط نویسنده می‌تواند یادداشت را حذف کند", 403);
    await db.note.delete({ where: { id } });
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
