import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { apiError, json } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import type { Permission } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return json({ user: null }, 200);

    const access = await db.systemAccess.findMany({
      where: { userId: user.id },
      include: { system: { select: { id: true, name: true, url: true, color: true, icon: true } } },
    });

    const unreadNotifications = await db.notification.count({
      where: { userId: user.id, read: false },
    });

    // پیام‌های خوانده‌نشده: گفتگوهایی که آخرین پیام آن‌ها پس از آخرین خواندن است
    const memberships = await db.conversationMember.findMany({
      where: { userId: user.id },
      select: { conversationId: true, lastReadAt: true },
    });
    let unreadConversations = 0;
    for (const m of memberships) {
      const lastMsg = await db.message.findFirst({
        where: { conversationId: m.conversationId, senderId: { not: user.id } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (lastMsg && lastMsg.createdAt > m.lastReadAt) unreadConversations++;
    }

    return json({
      user,
      systems: access.map((a) => a.system),
      permissions: {
        "users.manage": hasPermission(user.role, "users.manage"),
        "systems.manage": hasPermission(user.role, "systems.manage"),
        "announcements.publish": hasPermission(user.role, "announcements.publish"),
        "tasks.manageAll": hasPermission(user.role, "tasks.manageAll"),
        "reports.view": hasPermission(user.role, "reports.view"),
        "audit.view": hasPermission(user.role, "audit.view"),
        "chat.manage": hasPermission(user.role, "chat.manage"),
        "notes.shared": hasPermission(user.role, "notes.shared"),
      },
      unreadNotifications,
      unreadConversations,
    });
  } catch (e) {
    return apiError(e);
  }
}
