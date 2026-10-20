import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiError, json } from "@/lib/api";

/** فهرست گفتگوهای کاربر با پیام آخر و تعداد خوانده‌نشده */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const memberships = await db.conversationMember.findMany({
      where: { userId: user.id },
      include: {
        conversation: {
          include: {
            members: { include: { user: { select: { id: true, name: true, avatarColor: true, jobTitle: true } } } },
            messages: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
    });

    const conversations = memberships
      .map((m) => {
        const conv = m.conversation;
        const last = conv.messages[0];
        const otherMembers = conv.members.filter((mm) => mm.userId !== user.id);
        const title =
          conv.type === "DIRECT" ? otherMembers[0]?.user.name || "گفتگو" : conv.title;
        return {
          id: conv.id,
          type: conv.type,
          title,
          members: conv.members.map((mm) => ({
            id: mm.user.id,
            name: mm.user.name,
            avatarColor: mm.user.avatarColor,
            jobTitle: mm.user.jobTitle,
          })),
          lastMessage: last
            ? { content: last.content, createdAt: last.createdAt, senderId: last.senderId }
            : null,
          unread: last && last.senderId !== user.id && last.createdAt > m.lastReadAt ? 1 : 0,
        };
      })
      .filter((c) => c.lastMessage !== null || c.type !== "DIRECT")
      .sort((a, b) => {
        const ta = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
        const tb = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
        return tb - ta;
      });

    return json({ conversations });
  } catch (e) {
    return apiError(e);
  }
}

/** شروع گفتگوی خصوصی یا ساخت گروه */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const memberIds: string[] = [...new Set([user.id, ...(body.memberIds || [])])];

    if (body.type === "DIRECT") {
      const otherId = memberIds.find((id) => id !== user.id);
      if (!otherId) return json({ error: "انتخاب مخاطب الزامی است" }, 400);
      // اگر گفتگوی مستقیم موجود است همان را برگردان
      const existing = await db.conversation.findFirst({
        where: {
          type: "DIRECT",
          AND: [
            { members: { some: { userId: user.id } } },
            { members: { some: { userId: otherId } } },
          ],
        },
      });
      if (existing) return json({ conversation: existing });
    }

    const conv = await db.conversation.create({
      data: {
        title: body.title || "",
        type: body.type || "GROUP",
        creatorId: user.id,
        members: { create: memberIds.map((id: string) => ({ userId: id })) },
      },
    });
    return json({ conversation: conv }, 201);
  } catch (e) {
    return apiError(e);
  }
}
