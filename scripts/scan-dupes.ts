import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasourceUrl: `file:${process.cwd()}/db/custom.db`, log: ["error"] });
const rows = await db.provider.findMany({ select: { businessName: true, city: true, lat: true, lng: true, status: true, user: { select: { phone: true } } } });
const key = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\(.*?\)/g, "").replace(/\b(c\.a\.|c\.a|s\.a\.|servicios|inversiones|tienda|pet shop|veterinaria|clínica|clinica|consultorio|estética|estetica|agropecuaria|agro)\b/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const groups = new Map<string, typeof rows>();
for (const r of rows) {
  const k = `${r.city}|${key(r.businessName)}`;
  if (!k.split("|")[1]) continue;
  const arr = groups.get(k) ?? []; arr.push(r); groups.set(k, arr);
}
for (const [k, arr] of groups) {
  if (arr.length >= 2) {
    console.log(`\n🔁 ${k}`);
    for (const r of arr) console.log(`   - ${r.businessName} | ${r.status} | ${r.lat.toFixed(4)},${r.lng.toFixed(4)} | tel: ${r.user?.phone ?? "—"}`);
  }
}
await db.$disconnect();
