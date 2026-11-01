/**
 * Task 32 (ronda 2) — Correcciones geográficas verificadas en TODAS las ciudades.
 *
 * Evidencia: 3 agentes de investigación (32-b San Félix/CBBA, 32-c occidente,
 * 32-d PO/Maturín) + verificación propia con Nominatim (fwd/reverse) y web_search.
 * Artefactos: .cache/r32b-*.json, .cache/west-*.json, .cache/research-32d*.json,
 *             .cache/verify-own*.json
 *
 * Reglas aplicadas:
 *  - Pin POI/OSM/mall exacto  → se usa tal cual.
 *  - Ancla de sector/calle    → se usa con zoneName del sector real.
 *  - Negocio real sin sede verificable → pin representativo del sector/city
 *    confirmado (queda a ~1 km del lugar real) — SOLO si la evidencia ubica la
 *    ciudad/sector; si no hay NINGUNA evidencia → SUSPENDIDO.
 *  - Duplicados (mismo negocio) → se ocultan con status SUSPENDED (nunca se
 *    borran: conservan servicios/reservas/FK) y sus contactos se fusionan en
 *    la ficha principal.
 *
 * Uso: bun scripts/fix-geo-round2.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasourceUrl: `file:${process.cwd()}/db/custom.db`, log: ["error"] });

interface Fix {
  match: string; // substring único de businessName
  lat?: number;
  lng?: number;
  city?: string;
  zone?: string;
  bioPin?: string; // reemplaza la línea 📍 del bio (si existe o se agrega)
}

const FIXES: Fix[] = [
  // ─── San Félix (lote del pin falso 8.3475,-62.6471 compartido por 10) ───
  { match: "Dra. Rondón", lat: 8.3728092, lng: -62.6469794, zone: "Calle Araure (11 de Abril)" },
  {
    match: "Lookanino", lat: 8.223942, lng: -62.829673, city: "Puerto Ordaz",
    zone: "Las Teodokildas (Av. Caracas)",
    bioPin: "📍 Urb. Las Teodokildas, Mz 116 #24, Av. Caracas · Puerto Ordaz",
  },
  {
    match: "Agropeluquería N.R.", lat: 8.3680323, lng: -62.6372791, zone: "Bella Vista (11 de Abril)",
    bioPin: "📍 Urb. Bella Vista, Parroquia 11 de Abril · San Félix",
  },
  { match: "Agro Avícola Chirica", lat: 8.3511332, lng: -62.631585, zone: "Nueva Chirica (Av. Manuel Piar)" },
  {
    match: "Agropecuaria Gobey", lat: 8.3561709, lng: -62.6314867, zone: "Vista al Sol (Av. Manuel Piar)",
    bioPin: "📍 Av. Manuel Piar, frente a Corporación Reyfeca, Vista al Sol · San Félix",
  },
  { match: "G-A Experiencias", lat: 8.369, lng: -62.654, zone: "San Félix Centro" },
  { match: "Mascotas Felices", lat: 8.3715, lng: -62.659, zone: "San Félix Centro" },
  { match: "Misión Nevado", lat: 8.3680389, lng: -62.6486494, zone: "San Félix Centro" },
  { match: "AvilaPets", lat: 8.3381485, lng: -62.6708206, zone: "Av. Libertador (Dalla Costa)" },

  // ─── Puerto Ordaz ───
  {
    match: "Clínica Veterinaria Las Teodokildas", lat: 8.2256556, lng: -62.8346461, city: "Puerto Ordaz",
    zone: "Las Teodokildas (Av. Caracas)",
    bioPin: "📍 Las Teodokildas, Av. Caracas · Puerto Ordaz",
  },
  {
    match: "El Rancho", lat: 8.29546, lng: -62.73458, zone: "Alta Vista (Torre Atlantis)",
    bioPin: "📍 Torre Atlantis, Calle Cuchivero, Alta Vista · Puerto Ordaz",
  },
  {
    match: "Patitas a Salvo", lat: 8.26978, lng: -62.76353, zone: "Sector Río Caura (Polideportivo Venalum)",
    bioPin: "📍 Sector Río Caura, junto al Polideportivo Venalum, Av. Yuruaní · Puerto Ordaz",
  },
  {
    match: "Mascotalandia", lat: 8.2753423, lng: -62.7574781, zone: "Unare II (Mercado Municipal)",
    bioPin: "📍 Mercado Municipal de Unare, Av. 8, Unare II · Puerto Ordaz",
  },
  { match: "Coco Pet Shop", lat: 8.273015, lng: -62.767931, zone: "Unare II" },
  { match: "Agro & Pets", lat: 8.2823112, lng: -62.7178731, zone: "Los Olivos (Edif. El Mirador)" },
  { match: "CEV Ordaz", lat: 8.267728, lng: -62.733456, zone: "Villa Africana (Mini C.C. Buganvilla)" },

  // ─── Maturín (dos malls distintos compartían pin) ───
  { match: "Pet Shop Center", lat: 9.7799528, lng: -63.195587, zone: "Tipuro (C.C. Virgen del Valle)" },
  { match: "Mr Guau", lat: 9.784969, lng: -63.188754, zone: "Tipuro (C.C. Bello Campo)" },

  // ─── Ciudad Bolívar (ficha principal Servimaskoticas: zone + pin mall ya OK) ───
  { match: "Servimaskoticas Oriente-Bolívar", zone: "C.C. Don Lucio (Av. Libertador)" },

  // ─── Barquisimeto / Barinas / Maracaibo ───
  { match: "VetPlus", lat: 10.0566242, lng: -69.286733, zone: "Urb. Barici (calle E)" },
  { match: "Veterinaria Peluche", zone: "Santa Clara, Barinitas" },
  { match: "Granja La Rosa", zone: "Km 18 Vía Perijá (San Francisco)" },
];

const SUSPEND: { match: string; note: string }[] = [
  {
    match: "Furulais PZO",
    note: "Ficha duplicada de «Firulais Spa PZO» (mismo negocio: IG y ubicación idénticos). Ocultada en la auditoría geográfica 32; la cuenta, servicios y reservas se conservan intactos.",
  },
  {
    match: "Servimaskoticas (Servi+Koticas",
    note: "Ficha duplicada de «Servimaskoticas Oriente-Bolívar, C.A.» (misma clínica en C.C. Don Lucio). Contactos fusionados; ocultada en auditoría geográfica 32.",
  },
  {
    match: "Paticas — Estética y Clínica",
    note: "Ficha duplicada de «Paticas — Estética de Mascotas» (mismo teléfono 0424-9713238). Ocultada en auditoría geográfica 32.",
  },
  {
    match: "CEV — Clínica de Especialidades",
    note: "Ficha duplicada de «CEV Ordaz, C.A.» (misma clínica, Mini C.C. Buganvilla, Villa Africana). Ocultada en auditoría geográfica 32.",
  },
  {
    match: "El Perolero San Félix",
    note: "Puesto del «perolero» de usados de San Félix (venta por grupos de Facebook, sin sede fija verificable — no es la cadena agropecuaria El Perolero, cuya tienda formal es El Perolero Core 8, Puerto Ordaz). Ocultado en auditoría geográfica 32.",
  },
];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

async function main() {
  const providers = await db.provider.findMany({ select: { id: true, businessName: true, city: true, zoneName: true, lat: true, lng: true, bio: true, instagram: true } });

  console.log("══ APLICANDO CORRECCIONES GEO (ronda 2) ══\n");
  let applied = 0;
  for (const fix of FIXES) {
    const targets = providers.filter((p) => norm(p.businessName).includes(norm(fix.match)));
    if (targets.length !== 1) {
      console.log(`❌ «${fix.match}» → ${targets.length} coincidencias (esperaba 1): ${targets.map((t) => t.businessName).join(" | ")}`);
      continue;
    }
    const p = targets[0];
    const data: Record<string, string | number> = {};
    if (fix.lat != null) data.lat = fix.lat;
    if (fix.lng != null) data.lng = fix.lng;
    if (fix.city) data.city = fix.city;
    if (fix.zone) data.zoneName = fix.zone;
    if (fix.bioPin) {
      const bio = p.bio ?? "";
      const lines = bio.split("\n");
      const i = lines.findIndex((l) => l.includes("📍"));
      if (i >= 0) lines[i] = fix.bioPin;
      else lines.push(fix.bioPin);
      data.bio = lines.join("\n");
    }
    await db.provider.update({ where: { id: p.id }, data });
    applied++;
    const dLat = fix.lat != null ? (Math.abs(fix.lat - p.lat) * 111).toFixed(1) : "0";
    console.log(`✅ ${p.businessName} — ${p.city}→${fix.city ?? p.city} | ${p.zoneName}→${fix.zone ?? p.zoneName} | desplaz ${dLat} km lat`);
  }

  // Fusión de contactos: Servimaskoticas (IG + tel del duplicado) y CEV Ordaz (IG)
  const servKeep = providers.find((p) => p.businessName.includes("Servimaskoticas Oriente-Bolívar"));
  if (servKeep) {
    await db.provider.update({ where: { id: servKeep.id }, data: { instagram: "https://www.instagram.com/servi_mascoticas/" } });
    const servUser = await db.provider.findFirst({ where: { businessName: { contains: "Servi+Koticas" } }, select: { user: { select: { id: true, phone: true } } } });
    if (servUser?.user?.phone) {
      // el teléfono vive en la tabla user: se copia al usuario de la ficha principal solo si está vacío
      const mainUser = await db.provider.findUnique({ where: { id: servKeep.id }, select: { user: { select: { id: true, phone: true } } } });
      if (mainUser?.user && !mainUser.user.phone) {
        await db.user.update({ where: { id: mainUser.user.id }, data: { phone: servUser.user.phone } });
        console.log(`✅ Teléfono ${servUser.user.phone} fusionado en Servimaskoticas Oriente-Bolívar`);
      }
    }
  }
  const cevKeep = providers.find((p) => p.businessName.includes("CEV Ordaz"));
  if (cevKeep) {
    await db.provider.update({ where: { id: cevKeep.id }, data: { instagram: "https://www.instagram.com/ceveterinariapoz/" } });
    console.log(`✅ IG @ceveterinariapoz añadido a CEV Ordaz`);
  }

  console.log("\n══ SUSPENDIENDO DUPLICADOS / SIN SEDE VERIFICABLE ══\n");
  for (const s of SUSPEND) {
    const targets = providers.filter((p) => p.businessName.includes(s.match));
    if (targets.length !== 1) {
      console.log(`❌ SUSPEND «${s.match}» → ${targets.length} coincidencias`);
      continue;
    }
    await db.provider.update({ where: { id: targets[0].id }, data: { status: "SUSPENDED", suspensionNote: s.note } });
    console.log(`🚫 ${targets[0].businessName}`);
  }

  const total = await db.provider.count();
  const byStatus = await db.provider.groupBy({ by: ["status"], _count: { status: true } });
  console.log(`\n✅ ${applied} correcciones aplicadas. Total prestadores: ${total} — estados: ${byStatus.map((s) => `${s.status}:${s._count.status}`).join(" ")}`);
  await db.$disconnect();
}

main();
