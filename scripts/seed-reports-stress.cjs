/**
 * seed-reports-stress.cjs — پر کردن جداول مرتبط با گزارش‌ها با دادهٔ واقعی‌نما
 * برای بازتولید خطای ۵۰۰ سرور در محیط توسعه
 */
const { resolveDatabaseUrl } = require("./lib-env.cjs");
resolveDatabaseUrl();
const { PrismaClient } = require("@prisma/client");
const { scryptSync, randomBytes } = require("crypto");
const db = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

(async () => {
  // 1) 260 کاربر — بعضی با lastLoginAt، بعضی بدون آن
  const roles = ["SUPER_ADMIN", "UNIT_MANAGER", "THERAPIST", "STAFF", "TEACHER", "EXTERNAL"];
  const statuses = ["ACTIVE", "ACTIVE", "ACTIVE", "SUSPENDED", "INACTIVE"];
  let adminId;
  for (let i = 0; i < 260; i++) {
    const uname = `stress${String(i).padStart(4, "0")}`;
    const existing = await db.user.findFirst({ where: { username: uname } });
    if (existing) { if (i === 0) adminId = existing.id; continue; }
    const u = await db.user.create({
      data: {
        email: `${uname}@rose.local`,
        username: uname,
        passwordHash: hashPassword("Test!Pass123"),
        name: `کاربر تستی ${i + 1}`,
        role: roles[i % roles.length],
        status: statuses[i % statuses.length],
        unit: `واحد ${(i % 7) + 1}`,
        lastLoginAt: i % 3 === 0 ? new Date(Date.now() - i * 3600 * 1000) : null,
      },
    });
    if (i === 0) adminId = u.id;
  }
  if (!adminId) { const a = await db.user.findFirst({ where: { username: "stress0000" } }); adminId = a.id; }
  console.log("users ok, admin:", adminId);

  // 2) وظایف با تاریخ‌های متنوع
  for (let i = 0; i < 12; i++) {
    const t = await db.task.create({
      data: {
        title: `وظیفهٔ تستی ${i + 1}`,
        description: "تست",
        status: ["NEW", "IN_PROGRESS", "DONE", "CANCELLED"][i % 4],
        priority: ["LOW", "MEDIUM", "HIGH", "URGENT"][i % 4],
        creatorId: adminId,
        assigneeId: adminId,
        dueDate: i % 2 === 0 ? new Date(Date.now() - i * 86400 * 1000) : null,
        completedAt: i % 4 === 2 ? new Date(Date.now() - i * 3600 * 1000) : null,
      },
    });
  }
  console.log("tasks ok");

  // 3) اطلاعیه + تأیید مطالعه
  const ann = await db.announcement.create({
    data: {
      title: "اطلاعیهٔ تستی",
      content: "متن آزمایشی",
      authorId: adminId,
      publishAt: new Date(),
    },
  });
  await db.announcementAck.create({
    data: { announcementId: ann.id, userId: adminId, acknowledgedAt: new Date() },
  }).catch(() => {});
  console.log("announcements ok");

  // 4) رویداد تقویم
  await db.calendarEvent.create({
    data: {
      title: "رویداد تستی",
      start: new Date(Date.now() + 86400 * 1000),
      ownerId: adminId,
    },
  }).catch(() => {});
  console.log("events ok");

  // 5) یک ردیف ReportFile واقعی‌نما (دسترسی سازمانی — همهٔ ستون‌های select)
  await db.reportFile.create({
    data: {
      name: "گزارش-خدمات-1403-05.xlsx",
      month: 5,
      year: 1403,
      sheet: "خلاصه",
      services: JSON.stringify([{ title: "مشاوره فردی", count: 42 }]),
      records: JSON.stringify([{ name: "مشاور الف", sessions: 30 }]),
      summary: JSON.stringify({ grand: 120, perService: [{ title: "مشاوره فردی", count: 42 }] }),
      nConsultants: 7,
      uploadedById: adminId,
    },
  });
  console.log("reportFile ok");

  // 6) یک ردیف ExcelDataset واقعی‌نما
  await db.excelDataset.create({
    data: {
      name: "دادهٔ-آزمایشی.xlsx",
      sheetNames: JSON.stringify(["Sheet1"]),
      activeSheet: "Sheet1",
      columns: JSON.stringify([{ name: "نام", type: "text" }, { name: "مبلغ", type: "number" }]),
      rows: JSON.stringify([{ name: "Sheet1", columns: [], rows: [{ "نام": "الف", "مبلغ": 100 }] }]),
      profile: JSON.stringify({ nRows: 1, nCols: 2 }),
      nRows: 1,
      nRowsTotal: 1,
      uploadedById: adminId,
    },
  });
  console.log("excelDataset ok");

  // 7) یک CustomIndicator
  await db.customIndicator.create({
    data: {
      name: "جمع مبالغ",
      datasetId: (await db.excelDataset.findFirst({ where: { name: "دادهٔ-آزمایشی.xlsx" } })).id,
      kind: "AGG",
      config: JSON.stringify({ op: "SUM", column: "مبلغ" }),
      createdById: adminId,
    },
  }).catch((e) => console.log("indicator skipped:", e.message.slice(0, 80)));
  console.log("indicators ok");

  await db.$disconnect();
  console.log("DONE");
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
