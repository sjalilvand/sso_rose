import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";

/** گفتگوی وظیفه */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req);
    const { id } = await ctx.params;
    const comments = await db.taskComment.findMany({
      where: { taskId: id },
      include: { user: { select: { name: true, avatarColor: true } } },
      orderBy: { createdAt: "asc" },
    });
    return json({ comments });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req);
    const { id } = await ctx.params;
    const { content } = await readBody<{ content?: string }>(req);
    if (!content?.trim()) return json({ error: "متن گفتگو خالی است" }, 400);
    const task = await db.task.findUnique({ where: { id } });
    if (!task) return json({ error: "وظیفه یافت نشد" }, 404);
    const comment = await db.taskComment.create({
      data: { taskId: id, userId: user.id, content: content.trim() },
      include: { user: { select: { name: true, avatarColor: true } } },
    });
    // اعلان برای مسئول وظیفه
    if (task.assigneeId !== user.id) {
      await db.notification.create({
        data: {
          userId: task.assigneeId,
          type: "task",
          title: `گفتگوی جدید در وظیفه`,
          body: task.title,
          link: "/tasks",
        },
      });
    }
    return json({ comment }, 201);
  } catch (e) {
    return apiError(e);
  }
}
