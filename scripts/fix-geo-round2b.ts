import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasourceUrl: `file:${process.cwd()}/db/custom.db`, log: ["error"] });
// Mascotalandia (PO, Mercado de Unare) — exacto, no "Mascotalandia II" (Caracas)
const masc = await db.provider.findFirst({ where: { businessName: "Mascotalandia" } });
if (masc) {
  const bio = (masc.bio ?? "").split("\n");
  const i = bio.findIndex((l) => l.includes("📍"));
  const pin = "📍 Mercado Municipal de Unare, Av. 8, Unare II · Puerto Ordaz";
  if (i >= 0) bio[i] = pin; else bio.push(pin);
  await db.provider.update({ where: { id: masc.id }, data: { lat: 8.2753423, lng: -62.7574781, zoneName: "Unare II (Mercado Municipal)", bio: bio.join("\n") } });
  console.log(`✅ Mascotalandia [${masc.city}/${masc.zoneName}] corregida`);
} else console.log("❌ Mascotalandia no encontrada");
// Agrotécnica & Pet Shop - Agro & Pets (Edif. El Mirador) — exacto
const agro = await db.provider.findFirst({ where: { businessName: { startsWith: "Agrotécnica & Pet Shop" } } });
if (agro) {
  await db.provider.update({ where: { id: agro.id }, data: { lat: 8.2823112, lng: -62.7178731, zoneName: "Los Olivos (Edif. El Mirador)" } });
  console.log(`✅ ${agro.businessName} [${agro.city}/${agro.zoneName}] corregida`);
} else console.log("❌ Agrotécnica no encontrada");
// IG de Servimaskoticas (confirmar)
const serv = await db.provider.findFirst({ where: { businessName: { contains: "Oriente-Bolívar" } }, select: { businessName: true, instagram: true } });
console.log("SERV IG:", serv?.instagram);
await db.$disconnect();
