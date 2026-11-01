import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasourceUrl: `file:${process.cwd()}/db/custom.db`, log: ["error"] });
const ap = await db.provider.findFirst({ where: { businessName: { contains: "AvilaPets" } } });
if (ap) {
  await db.provider.update({ where: { id: ap.id }, data: { lat: 8.3376, lng: -62.6714 } });
  console.log(`✅ AvilaPets desplazado 150m sobre Av. Libertador (evita pin idéntico a Agropecuaria Kawi)`);
}
await db.$disconnect();
