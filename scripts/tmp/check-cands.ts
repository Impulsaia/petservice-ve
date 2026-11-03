import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasourceUrl: `file:${process.cwd()}/db/custom.db`, log: ["error"] });
async function main() {
  const rows = await db.provider.findMany({
    where: { OR: [{ businessName: { contains: "Animal" } }, { businessName: { contains: "Center" } }, { businessName: { contains: "Centro" } }] },
    select: { businessName: true, city: true, zoneName: true, badges: true },
  });
  for (const r of rows) console.log(`- ${r.businessName} | ${r.city} | ${r.zoneName}`);
}
main().finally(() => db.$disconnect());
