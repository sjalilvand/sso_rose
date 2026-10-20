import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, ApiError, audit } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";

/** ویرایش اطلاعیه */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req);
    const { id } = await ctx.params;
    const ann = await db.announcement.findUnique({ where: { id } });
    if (!ann) throw new ApiError("اطلاعیه یافت نشد", 404);
    if (ann.authorId !== user.id && user.role !== "SUPER_ADMIN")
      throw new ApiError("فقط نویسنده یا مدیر کل می‌تواند اطلاعیه را ویرایش کند", 403);

    const body = await readBody<{
      title?: string;
      content?: string;
      importance?: string;
      pinned?: boolean;
      expireAt?: string | null;
    }>(req);

    const data: Record<string, unknown> = {};
    if (body.title) data.title = body.title;
    if (body.content) data.content = body.content;
    if (body.importance) data.importance = body.importance;
    if (typeof body.pinned === "boolean") data.pinned = body.pinned;
    if (body.expireAt !== undefined) data.expireAt = body.expireAt ? new Date(body.expireAt) : null;

    await db.announcement.update({ where: { id }, data });
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

/** حذف اطلاعیه */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req);
    const { id } = await ctx.params;
    const ann = await db.announcement.findUnique({ where: { id } });
    if (!ann) throw new ApiError("اطلاعیه یافت نشد", 404);
    if (ann.authorId !== user.id && user.role !== "SUPER_ADMIN")
      throw new ApiError("فقط نویسنده یا مدیر کل می‌تواند اطلاعیه را حذف کند", 403);

    await db.announcement.delete({ where: { id } });
    await audit({
      userId: user.id,
      userName: user.name,
      action: "حذف اطلاعیه",
      entity: "announcement",
      details: ann.title,
    });
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
