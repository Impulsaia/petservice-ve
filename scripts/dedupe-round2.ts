/**
 * Task 32 — Dedupe: los nuevos importados (2026-10-31, source=WEB) que duplican
 * negocios ya verificados (2026-10-21). Elimina el duplicado NUEVO y transfiere
 * la información útil (dirección/zoneName/coords/redes) al ORIGINAL.
 * Uso: bun scripts/dedupe-round2.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasourceUrl: `file:${process.cwd()}/db/custom.db`, log: ["error"] });

// [nombreExactoDelDuplicadoNuevo, parchesParaElOriginal]
const DEDUPE: { dupName: string; keepContains: string; patch?: { zoneName?: string; bioAppend?: string } }[] = [
  { dupName: "Clínica Veterinaria Las Teodokildas C.A.", keepContains: "Las Teodokildas", patch: { zoneName: "Unare III" } },
  { dupName: "Mascotalandia PZO", keepContains: "Mascotalandia", patch: { zoneName: "Unare II / Sierra Parima" } },
  { dupName: "Animal's Center", keepContains: "Animalscenter", patch: { zoneName: "Castillito" } },
  { dupName: "Coquetitos Pet Shop & Grooming", keepContains: "Coquetitos Pet Shop", patch: { zoneName: "C.C. Caroní Plaza" } },
  { dupName: "Agro & Pets (Agrotécnica & Pet Shop)", keepContains: "Agrotécnica & Pet Shop - Agro & Pets", patch: { zoneName: "Los Olivos" } },
  { dupName: "Guayana Pets Tienda de Mascotas", keepContains: "Guayana Pets", patch: { zoneName: "Av. Guayana / Redoma La Piña" } },
  { dupName: "Crazy Pets Orinokia", keepContains: "Crazy Pets (C.C. Orinokia)" },
];

async function main() {
  for (const d of DEDUPE) {
    const dup = await db.provider.findFirst({ where: { businessName: d.dupName }, include: { user: { select: { phone: true } } } });
    if (!dup) { console.log(`↩️  duplicado ya no existe: ${d.dupName}`); continue; }
    const keep = await db.provider.findFirst({ where: { businessName: { contains: d.keepContains }, id: { not: dup.id } }, include: { user: { select: { phone: true } } } });
    if (!keep) { console.log(`⚠️ no hay original para ${d.dupName}`); continue; }

    // Transfiere datos útiles del duplicado al original (el original manda si ya tiene)
    const patch: Record<string, unknown> = {};
    if (d.patch?.zoneName && !keep.zoneName) patch.zoneName = d.patch.zoneName;
    else if (d.patch?.zoneName) patch.zoneName = d.patch.zoneName;
    if (dup.instagram && !keep.instagram) patch.instagram = dup.instagram;
    if (dup.facebook && !keep.facebook) patch.facebook = dup.facebook;
    if (dup.website && !keep.website) patch.website = dup.website;
    if (dup.user.phone && !keep.user.phone) {
      await db.user.update({ where: { id: keep.userId }, data: { phone: dup.user.phone } });
    }
    if (Object.keys(patch).length) await db.provider.update({ where: { id: keep.id }, data: patch });

    // El original de Teodokildas estaba con ciudad equivocada (San Félix)
    if (keep.businessName.includes("Teodokildas") && keep.city !== "Puerto Ordaz") {
      await db.provider.update({ where: { id: keep.id }, data: { city: "Puerto Ordaz", zoneName: "Unare III", source: "WEB" } });
    }

    // Borra servicios del duplicado y el duplicado (el user placeholder queda huérfano, sin acceso)
    await db.service.deleteMany({ where: { providerId: dup.id } });
    await db.booking.deleteMany({ where: { providerId: dup.id } });
    await db.provider.delete({ where: { id: dup.id } });
    console.log(`🗑️  ${d.dupName} → fusionado en «${keep.businessName.slice(0, 45)}»`);
  }
  console.log("Total prestadores:", await db.provider.count());
  await db.$disconnect();
}

main();
