import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, ApiError } from "@/lib/auth";
import { apiError, json } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";

/**
 * فهرست وظایف — هر کاربر وظایف خود را می‌بیند؛
 * مدیران (tasks.manageAll) همه وظایف را می‌بینند.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const canManageAll = hasPermission(user.role, "tasks.manageAll");

    const tasks = await db.task.findMany({
      where: canManageAll ? {} : { assigneeId: user.id },
      include: {
        assignee: { select: { id: true, name: true, avatarColor: true, unit: true } },
        creator: { select: { name: true } },
        comments: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return json({
      tasks: tasks.map((t) => ({
        ...t,
        commentCount: t.comments.length,
        comments: undefined,
        isOverdue:
          t.dueDate &&
          new Date(t.dueDate) < new Date() &&
          t.status !== "DONE" &&
          t.status !== "CANCELLED",
      })),
    });
  } catch (e) {
    return apiError(e);
  }
}

/** تعریف وظیفه */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    if (!body.title) return json({ error: "عنوان وظیفه الزامی است" }, 400);

    const assigneeId = body.assigneeId || user.id;
    if (assigneeId !== user.id && !hasPermission(user.role, "tasks.manageAll"))
      throw new ApiError("شما مجوز واگذاری وظیفه به دیگران را ندارید", 403);

    const task = await db.task.create({
      data: {
        title: body.title,
        description: body.description || "",
        priority: body.priority || "MEDIUM",
        status: body.status || "NEW",
        startDate: body.startDate ? new Date(body.startDate) : new Date(),
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        assigneeId,
        creatorId: user.id,
      },
    });

    // اعلان برای مسئول وظیفه
    if (assigneeId !== user.id) {
      await db.notification.create({
        data: {
          userId: assigneeId,
          type: "task",
          title: "وظیفه جدید برای شما تعریف شد",
          body: task.title,
          link: "/tasks",
        },
      });
    }

    return json({ task }, 201);
  } catch (e) {
    return apiError(e);
  }
}
