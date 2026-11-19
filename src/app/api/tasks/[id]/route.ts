import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, ApiError, audit } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { canViewSubordinate, canAssignTaskTo } from "@/lib/team";

/** تغییر وضعیت و ویرایش وظیفه — مدیرِ مسئول وظیفه هم مجاز است (بند ۳) */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req);
    const { id } = await ctx.params;
    const task = await db.task.findUnique({ where: { id } });
    if (!task) throw new ApiError("وظیفه یافت نشد", 404);

    const isManagerOfAssignee =
      task.assigneeId !== user.id &&
      (await canViewSubordinate(user.id, user.role, task.assigneeId));
    const canManage = hasPermission(user.role, "tasks.manageAll");
    if (task.assigneeId !== user.id && task.creatorId !== user.id && !canManage && !isManagerOfAssignee)
      throw new ApiError("شما مجوز ویرایش این وظیفه را ندارید", 403);

    const body = await readBody<{
      title?: string;
      description?: string;
      priority?: string;
      status?: string;
      dueDate?: string | null;
      assigneeId?: string;
    }>(req);

    const data: Record<string, unknown> = {};
    if (body.title) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.priority) data.priority = body.priority;
    if (body.status) {
      data.status = body.status;
      data.completedAt = body.status === "DONE" ? new Date() : null;
    }
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.assigneeId && body.assigneeId !== task.assigneeId) {
      const assignable = await canAssignTaskTo(user, body.assigneeId);
      if (!assignable)
        throw new ApiError("فقط می‌توانید وظیفه به خودتان یا زیرمجموعه‌هایتان واگذار کنید", 403);
      await db.notification.create({
        data: {
          userId: body.assigneeId,
          type: "task",
          title: "وظیفه‌ای به شما واگذار شد",
          body: task.title,
          link: "/tasks",
        },
      });
      data.assigneeId = body.assigneeId;
    }

    await db.task.update({ where: { id }, data });

    if (body.status === "DONE" && task.status !== "DONE") {
      await audit({
        userId: user.id,
        userName: user.name,
        action: "تکمیل وظیفه",
        entity: "task",
        details: task.title,
      });
    }
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

/** حذف وظیفه */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req);
    const { id } = await ctx.params;
    const task = await db.task.findUnique({ where: { id } });
    if (!task) throw new ApiError("وظیفه یافت نشد", 404);
    const isManagerOfAssignee =
      task.assigneeId !== user.id &&
      (await canViewSubordinate(user.id, user.role, task.assigneeId));
    if (
      task.creatorId !== user.id &&
      !hasPermission(user.role, "tasks.manageAll") &&
      !isManagerOfAssignee
    )
      throw new ApiError("فقط تعیین‌کننده وظیفه یا مدیر می‌تواند حذف کند", 403);

    await db.task.delete({ where: { id } });
    return json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
