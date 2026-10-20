import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, ApiError } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";

function isMember(memberIds: string[], userId: string) {
  return memberIds.includes(userId);
}

/** پیام‌های گفتگو */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req);
    const { id } = await ctx.params;
    const membership = await db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: user.id } },
    });
    if (!membership) throw new ApiError("به این گفتگو دسترسی ندارید", 403);

    const messages = await db.message.findMany({
      where: { conversationId: id },
      include: { sender: { select: { id: true, name: true, avatarColor: true } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    // به‌روزرسانی وضعیت خواندن
    await db.conversationMember.update({
      where: { id: membership.id },
      data: { lastReadAt: new Date() },
    });

    const conv = await db.conversation.findUnique({
      where: { id },
      include: { members: { include: { user: { select: { id: true, name: true, avatarColor: true, jobTitle: true } } } } },
    });

    return json({
      messages,
      conversation: conv,
    });
  } catch (e) {
    return apiError(e);
  }
}

/** ارسال پیام */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req);
    const { id } = await ctx.params;
    const membership = await db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: user.id } },
    });
    if (!membership) throw new ApiError("به این گفتگو دسترسی ندارید", 403);

    const { content, replyToId } = await readBody<{ content?: string; replyToId?: string }>(req);
    if (!content?.trim()) return json({ error: "متن پیام خالی است" }, 400);

    const message = await db.message.create({
      data: {
        conversationId: id,
        senderId: user.id,
        content: content.trim(),
        replyToId: replyToId || null,
      },
      include: { sender: { select: { id: true, name: true, avatarColor: true } } },
    });

    await db.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
    return json({ message }, 201);
  } catch (e) {
    return apiError(e);
  }
}
