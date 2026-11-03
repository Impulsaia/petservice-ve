import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasourceUrl: `file:${process.cwd()}/db/custom.db`, log: ["error"] });

const BRANDS = ["supercan", "dogourmet", "champs", "don kat", "donkat", "oh mai gat", "ohmaigat", "polar"];

async function main() {
  const providers = await db.provider.findMany({
    where: { status: { not: "SUSPENDED" } },
    select: { id: true, businessName: true, city: true, zoneName: true, bio: true, badges: true,
      services: { select: { category: true, name: true } } },
    orderBy: { city: "asc" },
  });
  console.log("=== BIOS QUE YA MENCIONAN MARCAS POLAR ===");
  for (const p of providers) {
    const hay = (p.bio + " " + p.services.map((s) => s.name + " " + s.category).join(" ")).toLowerCase();
    const hits = BRANDS.filter((b) => hay.includes(b));
    if (hits.length) console.log(`🎯 ${p.businessName} [${p.city}] → ${hits.join(", ")}`);
  }
  console.log("\n=== CANDIDATOS ALIMENTOS (DELIVERY o nombre agro/petshop/tienda) ===");
  const cands: string[] = [];
  for (const p of providers) {
    const hasDelivery = p.services.some((s) => s.category === "DELIVERY");
    const nameFood = /agro|pet ?shop|tienda|aliment|vet ?shop|animal/i.test(p.businessName);
    if (hasDelivery || nameFood) cands.push(`${p.businessName} | ${p.city} | ${p.zoneName}`);
  }
  console.log(cands.join("\n"));
  console.log(`\nTOTAL CANDIDATOS: ${cands.length}`);
}
main().finally(() => db.$disconnect());
