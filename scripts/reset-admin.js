// reset-admin.js - Rose Hub admin password reset tool
// Hash format is identical to src/lib/auth.ts (scrypt, "salt:hash", 64-byte key)
// Usage:
//   node reset-admin.js                        -> list users (admins marked [ADMIN])
//   node reset-admin.js "NewPassword"          -> reset first SUPER_ADMIN
//   node reset-admin.js "NewPassword" admin@rose.ir -> reset a specific user
//   node reset-admin.js --logout-all           -> force-logout every session
//   node reset-admin.js "NewPassword" --logout-all  -> both in one run
const { scryptSync, randomBytes } = require("crypto");
const fs = require("fs");
const path = require("path");

const logoutAll = process.argv.includes("--logout-all");
const listOnly = process.argv.includes("--list");
const args = process.argv
  .slice(2)
  .filter((a) => a !== "--list" && a !== "--logout-all");
const newPass = args[0] || "";
const targetId = args[1] || "";
const SEL = { id: true, email: true, username: true, name: true, role: true, status: true };

// load DATABASE_URL from .env (quotes stripped — same as the running app)
const { resolveDatabaseUrl } = require("./lib-env.cjs");
resolveDatabaseUrl();

const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

(async () => {
  if (logoutAll) {
    const r = await db.session.updateMany({ data: { revoked: true } });
    console.log("REVOKED SESSIONS: " + r.count + " (all users were logged out)");
  }

  if (newPass) {
    // pick the target user: explicit identifier first, then first SUPER_ADMIN
    let user = null;
    if (targetId) {
      user = await db.user.findFirst({
        where: { OR: [{ email: targetId }, { username: targetId }] },
        select: SEL,
      });
      if (!user) console.log("User not found by identifier, falling back to first SUPER_ADMIN...");
    }
    if (!user) {
      user = await db.user.findFirst({
        where: { role: "SUPER_ADMIN" },
        orderBy: { createdAt: "asc" },
        select: SEL,
      });
    }
    if (!user) {
      console.log("ERROR: no SUPER_ADMIN found. Run without arguments to list users,");
      console.log("then pass an email as the second argument.");
      process.exit(1);
    }

    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(newPass, salt, 64).toString("hex");
    // updateMany (not update) to avoid re-reading the full row
    const res = await db.user.updateMany({
      where: { id: user.id },
      data: { passwordHash: salt + ":" + hash, status: "ACTIVE" },
    });
    if (res.count !== 1) {
      console.log("ERROR: update failed (count=" + res.count + ")");
      process.exit(1);
    }

    console.log("");
    console.log("=========================================");
    console.log("  PASSWORD CHANGED SUCCESSFULLY");
    console.log("=========================================");
    console.log("  Login page : http://130.185.73.157:8082/login");
    console.log("  Email      : " + user.email);
    if (user.username) console.log("  Username   : " + user.username);
    console.log("  Name       : " + user.name);
    console.log("  New pass   : " + newPass);
    console.log("  Status     : ACTIVE");
    console.log("=========================================");
    console.log("  Store this password in a safe place.");
  } else if (!logoutAll) {
    const users = await db.user.findMany({ select: SEL, orderBy: { createdAt: "asc" } });
    console.log("---- Users in Rose Hub database ----");
    for (const u of users) {
      console.log(
        (u.role === "SUPER_ADMIN" ? "[ADMIN] " : "        ") +
          u.email +
          (u.username ? "  (user: " + u.username + ")" : "") +
          "  " + u.name + "  role=" + u.role + "  status=" + u.status
      );
    }
    console.log("------------------------------------");
    console.log('To reset: node reset-admin.js "NewPassword" [email-or-username]');
    console.log("To force-logout everyone: node reset-admin.js --logout-all");
  }

  await db.$disconnect();
})().catch((e) => {
  console.error("ERROR: " + (e && e.message ? e.message : e));
  process.exit(1);
});
