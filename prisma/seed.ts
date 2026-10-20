/**
 * PetService VE — Seed CLI
 * Ejecutar: bun prisma/seed.ts
 */
import { seedAll } from "../src/lib/petservice/seed";
import { PrismaClient } from "@prisma/client";

seedAll()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    const db = new PrismaClient();
    await db.$disconnect();
    process.exit(0);
  });
