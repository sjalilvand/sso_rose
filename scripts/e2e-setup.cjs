/* آماده‌سازی دادهٔ تست E2E — ساخت ادمین، زیرمجموعه، سامانهٔ SSO و وظیفه */
const { PrismaClient } = require("@prisma/client");
const { scryptSync, randomBytes } = require("crypto");
const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  const centers = await db.center.findMany({ orderBy: { code: "asc" }, take: 2 });
  const hq = await db.center.findUnique({ where: { code: "009003-HQ" } });
  const esf = await db.center.findUnique({ where: { code: "009007" } });

  const admin = await db.user.upsert({
    where: { email: "saeed@rose.ir" },
    update: { passwordHash: hashPassword("test12345") },
    create: {
      email: "saeed@rose.ir",
      name: "سعید جلیوند",
      passwordHash: hashPassword("test12345"),
      role: "SUPER_ADMIN",
      unit: "مدیریت",
      username: "1282777076",
      phone: "09130593680",
      centerId: hq?.id || centers[0]?.id || null,
    },
  });

  const sub = await db.user.upsert({
    where: { email: "1286982634@rose.ir" },
    update: { passwordHash: hashPassword("test12345") },
    create: {
      email: "1286982634@rose.ir",
      username: "1286982634",
      name: "محمدرضا آذری فر",
      passwordHash: hashPassword("test12345"),
      role: "THERAPIST",
      unit: "درمان",
      jobTitle: "روان‌شناس",
      province: "اصفهان",
      clinic: "کلینیک اصفهان",
      clinicId: esf?.id || null,
      centerId: hq?.id || null,
      managerId: admin.id,
      phone: "09132146583",
    },
  });
  await db.user.update({ where: { id: admin.id }, data: { managerId: null } });

  // مدیریت سازمانی با مدیر = ادمین
  const mg = await db.management.upsert({
    where: { name: "مدیریت درمان" },
    update: { managerId: admin.id, centerId: esf?.id || null },
    create: { name: "مدیریت درمان", description: "بخش درمان مرکز", managerId: admin.id, centerId: esf?.id || null },
  });
  await db.user.update({ where: { id: sub.id }, data: { managementId: mg.id } });

  await db.task.upsert({
    where: { id: "e2e-task-1" },
    update: {},
    create: {
      id: "e2e-task-1",
      title: "تهیهٔ گزارش ماهانهٔ کلینیک",
      priority: "HIGH",
      assigneeId: sub.id,
      creatorId: admin.id,
    },
  });

  // سامانهٔ SSO با کلید مشخص برای تست /api/sso/profile
  await db.clinicSystem.upsert({
    where: { clientId: "rose-techno-8a4e1f" },
    update: { clientSecret: "test-secret-e2e" },
    create: {
      name: "سامانه حضور و غیاب (تکنورز)",
      url: "http://130.185.73.157:8085",
      clientId: "rose-techno-8a4e1f",
      clientSecret: "test-secret-e2e",
      connectionLevel: "ADVANCED",
    },
  });

  console.log("E2E seed OK — admin:", admin.email, "| sub:", sub.email, "| mg:", mg.name, "| centers:", (await db.center.count()));
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
