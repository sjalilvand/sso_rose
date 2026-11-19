/**
 * test-reports-queries.cjs — بازسازی دقیق کوئری‌های /api/reports برای یافتن خطای سرور
 */
const { resolveDatabaseUrl } = require("./lib-env.cjs");
resolveDatabaseUrl();
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

(async () => {
  try {
    console.log("1) task.findMany ...");
    const tasks = await db.task.findMany({
      select: { status: true, priority: true, dueDate: true, completedAt: true, createdAt: true },
    });
    console.log("   OK:", tasks.length);

    console.log("2) user.findMany ...");
    const users = await db.user.findMany({ select: { status: true, role: true, unit: true, lastLoginAt: true } });
    console.log("   OK:", users.length);

    console.log("3) systemAccess.findMany ...");
    const access = await db.systemAccess.findMany();
    console.log("   OK:", access.length);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    console.log("4) announcement.findMany + acks ...");
    const anns = await db.announcement.findMany({
      where: { publishAt: { gte: monthStart } },
      include: { acks: true },
    });
    console.log("   OK:", anns.length);

    console.log("5) calendarEvent.count ...");
    const ev = await db.calendarEvent.count({
      where: { start: { gte: now }, OR: [{ ownerId: "x" }, { attendees: { some: { userId: "x" } } }] },
    });
    console.log("   OK:", ev);

    console.log("6) reportFile.findMany (excel GET) ...");
    const rf = await db.reportFile.findMany({
      select: { id: true, name: true, month: true, year: true, sheet: true, services: true, summary: true, nConsultants: true, uploadedById: true, createdAt: true },
      orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
    });
    console.log("   OK:", rf.length);

    console.log("\nALL QUERIES OK — خطای /api/reports مربوط به کوئری‌ها نیست");
  } catch (e) {
    console.error("\nERROR REPRODUCED:", e.message);
    console.error(e.stack?.split("\n").slice(0, 6).join("\n"));
  } finally {
    await db.$disconnect();
  }
})();
