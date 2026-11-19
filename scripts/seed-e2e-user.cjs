/**
 * seed-e2e-user.cjs — ساخت کاربر آزمایشی برای تست محلی سرور
 */
const { resolveDatabaseUrl } = require("./lib-env.cjs");
resolveDatabaseUrl();
const { PrismaClient } = require("@prisma/client");
const { scryptSync, randomBytes } = require("crypto");
const db = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

(async () => {
  const email = "e2e-admin@rose.local";
  const username = "1111111111";
  const password = "Test!Pass123";
  const existing = await db.user.findFirst({ where: { OR: [{ email }, { username }] } });
  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: { passwordHash: hashPassword(password), role: "SUPER_ADMIN", status: "ACTIVE", name: "تست مدیر" },
    });
    console.log("UPDATED:", existing.id);
  } else {
    const u = await db.user.create({
      data: {
        email, username, passwordHash: hashPassword(password),
        name: "تست مدیر", role: "SUPER_ADMIN", status: "ACTIVE",
      },
    });
    console.log("CREATED:", u.id);
  }
  console.log("LOGIN:", username, "/", password);
  await db.$disconnect();
})();
