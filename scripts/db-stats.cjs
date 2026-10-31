// Quick data counts - proves the app is pointed at the REAL database.
// Informational only: never fails the update. Printed by update-rosehub.ps1
// in the health check section.
//   node scripts/db-stats.cjs
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

(async () => {
  try {
    const users = await prisma.user.count();
    const active = await prisma.user.count({ where: { status: "ACTIVE" } });
    const systems = await prisma.clinicSystem.count();
    console.log(`  Data check: Users: ${users} (ACTIVE: ${active}) | Systems: ${systems}`);
    if (users === 0) {
      console.log("  [!] WARNING: 0 users - the app may be pointing at an empty database!");
    }
    await prisma.$disconnect();
  } catch (e) {
    console.log(`  [!] Data check failed: ${e.message.split("\n")[0]}`);
    process.exit(0);
  }
})();
