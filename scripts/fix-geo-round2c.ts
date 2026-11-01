import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasourceUrl: `file:${process.cwd()}/db/custom.db`, log: ["error"] });

// ── 1) Dogspital: mover a C.C. Río Caura (evidencia IG @dogspital.pzo: piso 1, local 14-B, Av. Atlántico)
const dog = await db.provider.findFirst({ where: { businessName: "Dogspital" } });
if (dog) {
  const bio = (dog.bio ?? "").split("\n");
  const i = bio.findIndex((l) => l.includes("📍"));
  if (i >= 0) bio[i] = "📍 C.C. Río Caura, piso 1, local 14-B, Av. Atlántico · Puerto Ordaz";
  await db.provider.update({ where: { id: dog.id }, data: { lat: 8.26710, lng: -62.75900, zoneName: "C.C. Río Caura (Av. Atlántico)", bio: bio.join("\n") } });
  console.log(`✅ Dogspital movido a C.C. Río Caura (local 14-B, junto a Agropet Machico)`);
}
// ── 2) Mascotísima: IG de la ficha duplicada → ficha principal (Google, Edificio Francisco)
const masc = await db.provider.findFirst({ where: { businessName: "Mascotísima, C.A." } });
if (masc) {
  await db.provider.update({ where: { id: masc.id }, data: { instagram: "https://www.instagram.com/mascotisima/" } });
  console.log(`✅ IG @mascotisima fusionado en Mascotísima, C.A.`);
}
// ── 3) Suspensiones (duplicados de la ronda 2b)
const toSuspend = ["DOGSPITAL Clínica Veterinaria", "Crazy Pets (C.C. Orinokia)%none", "Crazy Pets", "Mascotísima", "Mascotísima Pet Shop"];
const targets: { name: string; note: string }[] = [
  { name: "DOGSPITAL Clínica Veterinaria", note: "Ficha duplicada de «Dogspital» (mismo teléfono 0424-9299390). Auditoría geográfica 32." },
  { name: "Crazy Pets", note: "Ficha duplicada de «Crazy Pets (C.C. Orinokia)» (misma tienda en Orinokia Mall, Av. Las Américas). Auditoría geográfica 32." },
  { name: "Mascotísima", note: "Ficha duplicada de «Mascotísima, C.A.» (Av. 5 de Julio, Edif. Francisco). Auditoría geográfica 32." },
  { name: "Mascotísima Pet Shop", note: "Ficha duplicada de «Mascotísima, C.A.» (IG @mascotisima fusionado). Auditoría geográfica 32." },
];
for (const t of targets) {
  const p = await db.provider.findFirst({ where: { businessName: t.name } });
  if (!p) { console.log(`❌ no encontrada: ${t.name}`); continue; }
  if (p.status === "SUSPENDED") { console.log(`⏭ ya suspendida: ${t.name}`); continue; }
  await db.provider.update({ where: { id: p.id }, data: { status: "SUSPENDED", suspensionNote: t.note } });
  console.log(`🚫 ${t.name} (id ${p.id})`);
}
await db.$disconnect();
