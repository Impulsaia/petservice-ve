import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasourceUrl: `file:${process.cwd()}/db/custom.db`, log: ["error"] });

async function main() {
  const shops = await db.service.findMany({
    where: { category: "DELIVERY" },
    select: {
      name: true, priceUsd: true, priceToUsd: true, modality: true, durationMin: true, description: true,
      provider: { select: { businessName: true, city: true, zoneName: true, badges: true, user: { select: { phone: true } } } },
    },
    take: 4,
  });
  for (const s of shops) {
    console.log(`• ${s.provider.businessName} [${s.provider.city}/${s.provider.zoneName}] svc="${s.name}" price=${s.priceUsd}-${s.priceToUsd ?? "?"} mod=${s.modality} dur=${s.durationMin}`);
    console.log(`  desc: ${s.description.slice(0, 140)}`);
    console.log(`  badges=${s.provider.badges} tel=${s.provider.user?.phone}`);
  }
  const totalDelivery = await db.service.count({ where: { category: "DELIVERY" } });
  const totalProviders = await db.provider.count();
  console.log(`\nDELIVERY services: ${totalDelivery} | providers total: ${totalProviders}`);
}
main().finally(() => db.$disconnect());
