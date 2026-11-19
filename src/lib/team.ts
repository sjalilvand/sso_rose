import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";

/**
 * سلسله‌مراتب سازمانی (بند ۳) — مدیرِ زیرمجموعه‌های خودش
 *
 * هر کاربر با managerId به مدیر مستقیم وصل است؛ زیرمجموعه‌های هر مدیر
 * به‌صورت بازگشتی (تک‌به‌تک و چندسطحی) محاسبه می‌شود. مدیر کل (SUPER_ADMIN)
 * همهٔ سازمان را می‌بیند و مدیر واحد زیرمجموعه‌های خودش را.
 */

/** شناسهٔ همهٔ زیرمجموعه‌های یک کاربر — بازگشتی تا هر عمق */
export function subordinatesOf(userId: string, people: Array<{ id: string; managerId: string | null }>): string[] {
  const children = new Map<string, string[]>();
  for (const p of people) {
    if (!p.managerId) continue;
    if (!children.has(p.managerId)) children.set(p.managerId, []);
    children.get(p.managerId)!.push(p.id);
  }
  const out: string[] = [];
  const queue = [...(children.get(userId) || [])];
  const seen = new Set<string>([userId]);
  while (queue.length) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);
    const kids = children.get(cur) || [];
    for (const k of kids) if (!seen.has(k)) queue.push(k);
  }
  return out;
}

/** آیا مدیر (requester) مجاز به مشاهدهٔ داده‌های کاربر (target) است؟ */
export async function canViewSubordinate(requesterId: string, requesterRole: string, targetId: string): Promise<boolean> {
  if (requesterId === targetId) return true;
  if (requesterRole === "SUPER_ADMIN") return true;
  const people = await db.user.findMany({ select: { id: true, managerId: true } });
  return subordinatesOf(requesterId, people).includes(targetId);
}

/** شناسهٔ زیرمجموعه‌های یک کاربر از پایگاه داده */
export async function subordinateIds(userId: string): Promise<string[]> {
  const people = await db.user.findMany({ select: { id: true, managerId: true } });
  return subordinatesOf(userId, people);
}

/**
 * دامنهٔ وظایف — «وظایف هر کس برای خودش» + «مدیر برای زیرمجموعه‌های خودش»
 * خروجی: شرط where برای فهرست وظایف و اختیار واگذاری
 */
export async function taskScope(user: { id: string; role: string }): Promise<{
  assigneeIds: string[]; // کاربرانی که وظایفشان دیده می‌شود
  isGlobal: boolean; // مدیر کل — کل سازمان
}> {
  if (user.role === "SUPER_ADMIN") return { assigneeIds: [], isGlobal: true };
  const subs = await subordinateIds(user.id);
  return { assigneeIds: [user.id, ...subs], isGlobal: false };
}

/** آیا کاربر می‌تواند وظیفه‌ای به شخص دیگری واگذار کند؟ */
export async function canAssignTaskTo(
  user: { id: string; role: string },
  assigneeId: string
): Promise<boolean> {
  if (assigneeId === user.id) return true;
  if (hasPermission(user.role, "tasks.manageAll") && user.role === "SUPER_ADMIN") return true;
  if (user.role === "UNIT_MANAGER") {
    const subs = await subordinateIds(user.id);
    return subs.includes(assigneeId);
  }
  return false;
}
