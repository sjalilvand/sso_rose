import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, ApiError } from "@/lib/auth";
import { apiError, json } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { taskScope, canAssignTaskTo, canViewSubordinate } from "@/lib/team";

/**
 * فهرست وظایف — بند ۳: وظایف هر کس برای خودش؛
 * مدیر کل کل سازمان، هر مدیر دیگر وظایف خود و زیرمجموعه‌هایش را می‌بیند.
 * ?userId= — وظایف یک زیرمجموعهٔ مشخص (برای صفحهٔ زیرمجموعه‌ها)
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const scope = await taskScope(user);
    const { searchParams } = new URL(req.url);
    const targetUserId = (searchParams.get("userId") || "").trim();

    let where: Record<string, unknown>;
    if (targetUserId) {
      const allowed = await canViewSubordinate(user.id, user.role, targetUserId);
      if (!allowed) throw new ApiError("شما مجوز مشاهدهٔ وظایف این کاربر را ندارید", 403);
      where = { assigneeId: targetUserId };
    } else {
      where = scope.isGlobal ? {} : { assigneeId: { in: scope.assigneeIds } };
    }

    const tasks = await db.task.findMany({
      where,
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
    const assignable = await canAssignTaskTo(user, assigneeId);
    if (!assignable)
      throw new ApiError("فقط می‌توانید وظیفه به خودتان یا زیرمجموعه‌هایتان واگذار کنید", 403);

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
