// Backfill: set readable SSO credentials for existing systems (matches seed.ts)
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const MAP: Record<string, { clientId: string; clientSecret: string }> = {
  "راه زندگی": {
    clientId: "rose-rahe-zendegi-3f9a2c",
    clientSecret: "9f2c7b1e5d84a630c7e1f4b2d9a8c315e6d0f7a2b4c8e193d5f0a7c2e8b4d619",
  },
  "رز آکادمی": {
    clientId: "rose-academy-7b1d4e",
    clientSecret: "3a7d9c1e5b8f2046d0c3e7a9b1f4d628c5e0a3d7f1b9c4e6d2a8f0b3c7e5d142",
  },
  "رز سنتر": {
    clientId: "rose-center-2e8a5c",
    clientSecret: "6e1b8d4f0a2c7e95b3d1f6a8c0e4d725f9a1c3e7b5d8f204a6c0e9d3b7f1a5c8",
  },
  "رز سای": {
    clientId: "rose-psy-5c3f9b",
    clientSecret: "1d5f9b3e7a0c4e82f6b0d2a8c4e1f735a9d0c6e2b8f4a0d6c2e8b1f5a3d7c940",
  },
  "تکنورز": {
    clientId: "rose-techno-8a4e1f",
    clientSecret: "4b8e2f6a0d1c5e93a7f3b9d1c0e6f428b5a9d3e1c7f5a0b2d8e4c6f0a2b7d139",
  },
};

async function main() {
  const systems = await db.clinicSystem.findMany();
  for (const s of systems) {
    const creds = MAP[s.name];
    if (creds) {
      await db.clinicSystem.update({ where: { id: s.id }, data: creds });
      console.log(`✓ ${s.name} → ${creds.clientId}`);
    }
  }
}

main().finally(() => db.$disconnect());
