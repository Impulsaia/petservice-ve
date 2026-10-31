/**
 * PetService VE — Auditoría geográfica de TODOS los prestadores.
 *
 * Cruza las coordenadas guardadas con:
 *  1) el centroide del sector (ZONES) que declara zoneName en su ciudad
 *  2) el 📍 declarado en la bio (si menciona otro sector → sospecha)
 *  3) la ciudad declarada (coords a >20 km del centro de la ciudad → sospecha)
 *
 * Uso: bun scripts/audit-geo.ts [--fix-json /tmp/geo-fixes.json]
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasourceUrl: `file:${process.cwd()}/db/custom.db`, log: ["error"] });

// ZONES/CITIES re-exportadas de constants (sin depender de paths de Next)
const ZONES: { name: string; city: string; lat: number; lng: number }[] = [
  // Puerto Ordaz
  { name: "Alta Vista", city: "Puerto Ordaz", lat: 8.2934, lng: -62.7454 },
  { name: "Unare", city: "Puerto Ordaz", lat: 8.2646, lng: -62.7403 },
  { name: "Villa América", city: "Puerto Ordaz", lat: 8.2808, lng: -62.7715 },
  { name: "Los Mangos", city: "Puerto Ordaz", lat: 8.295, lng: -62.7687 },
  { name: "Villa Colombia", city: "Puerto Ordaz", lat: 8.2752, lng: -62.7657 },
  { name: "Cachamay", city: "Puerto Ordaz", lat: 8.2735, lng: -62.7245 },
  { name: "La Llovizna", city: "Puerto Ordaz", lat: 8.2608, lng: -62.7312 },
  { name: "Core 8", city: "Puerto Ordaz", lat: 8.22855, lng: -62.82539 },
  { name: "Gran Sabana", city: "Puerto Ordaz", lat: 8.2266, lng: -62.8278 },
  { name: "Guamo", city: "Puerto Ordaz", lat: 8.27478, lng: -62.78208 },
  { name: "Villa Bahía", city: "Puerto Ordaz", lat: 8.24032, lng: -62.79117 },
  { name: "Río Negro", city: "Puerto Ordaz", lat: 8.26626, lng: -62.74637 },
  { name: "Minifincas", city: "Puerto Ordaz", lat: 8.253, lng: -62.737 },
  { name: "Toro Muerto", city: "Puerto Ordaz", lat: 8.26806, lng: -62.72681 },
  { name: "Santa Rosa", city: "Puerto Ordaz", lat: 8.25999, lng: -62.76068 },
  // San Félix
  { name: "San Félix Centro", city: "San Félix", lat: 8.3696, lng: -62.66454 },
  { name: "Chirica", city: "San Félix", lat: 8.34754, lng: -62.64713 },
  { name: "El Roble", city: "San Félix", lat: 8.35404, lng: -62.67028 },
  { name: "Los Olivos", city: "San Félix", lat: 8.34454, lng: -62.66113 },
  { name: "Las Américas", city: "San Félix", lat: 8.34154, lng: -62.66463 },
  { name: "Dalla Costa", city: "San Félix", lat: 8.34117, lng: -62.68045 },
  { name: "Caratal", city: "San Félix", lat: 8.28821, lng: -62.58243 },
];

const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  "Puerto Ordaz": { lat: 8.2746, lng: -62.762 },
  "San Félix": { lat: 8.3512, lng: -62.6653 },
  "Ciudad Bolívar": { lat: 8.1222, lng: -63.5486 },
  Upata: { lat: 8.0194, lng: -62.4066 },
  Caracas: { lat: 10.4806, lng: -66.9036 },
  Maracaibo: { lat: 10.6545, lng: -71.6409 },
  Barquisimeto: { lat: 10.0774, lng: -69.3222 },
  Maturín: { lat: 9.748, lng: -63.1741 },
  "Puerto La Cruz": { lat: 10.2167, lng: -64.6167 },
  Barinas: { lat: 8.6227, lng: -70.2534 },
  "San Cristóbal": { lat: 7.7669, lng: -72.225 },
  Porlamar: { lat: 10.9597, lng: -63.8553 },
  Mérida: { lat: 8.5897, lng: -71.1561 },
  Maracay: { lat: 10.2469, lng: -67.5958 },
  Guanare: { lat: 9.0417, lng: -69.7419 },
  "La Guaira": { lat: 10.6, lng: -66.9333 },
};

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, dLat = ((bLat - aLat) * Math.PI) / 180, dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

interface Flag { name: string; city: string; zone: string; lat: number; lng: number; issues: string[] }

async function main() {
  const providers = await db.provider.findMany({
    select: { businessName: true, city: true, zoneName: true, lat: true, lng: true, source: true, bio: true },
  });

  // Coordenadas duplicadas (muchos proveedores clavados en el mismo punto)
  const coordCount = new Map<string, number>();
  for (const p of providers) {
    const k = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    coordCount.set(k, (coordCount.get(k) ?? 0) + 1);
  }

  const flags: Flag[] = [];
  for (const p of providers) {
    const issues: string[] = [];

    // 1) coords vs centroide del sector declarado
    const zone = ZONES.find((z) => z.city === p.city && norm(z.name) === norm(p.zoneName ?? ""));
    if (zone) {
      const d = haversineKm(p.lat, p.lng, zone.lat, zone.lng);
      if (d > 2.5) issues.push(`coords a ${d.toFixed(1)} km del centroide de «${zone.name}»`);
    }

    // 2) bio menciona otro sector de la misma ciudad
    const bioPin = (p.bio ?? "").split("\n").find((l) => l.includes("📍")) ?? "";
    if (p.zoneName) {
      const other = ZONES.find(
        (z) => z.city === p.city && norm(z.name) !== norm(p.zoneName) && bioPin.toLowerCase().includes(z.name.toLowerCase())
      );
      if (other) issues.push(`bio dice «${other.name}» pero zoneName=«${p.zoneName}»`);
    }

    // 3) ciudad vs coords
    const center = CITY_CENTERS[p.city];
    if (center) {
      const dc = haversineKm(p.lat, p.lng, center.lat, center.lng);
      if (dc > 20) issues.push(`coords a ${dc.toFixed(0)} km del centro de ${p.city} (¿ciudad equivocada?)`);
    }

    // 4) pin duplicado exacto compartido por >=4 prestadores (sospecha de centroide pegado)
    const k = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    if ((coordCount.get(k) ?? 0) >= 4) issues.push(`pin compartido exacto con ${coordCount.get(k) - 1} más (${k})`);

    if (issues.length) flags.push({ name: p.businessName, city: p.city, zone: p.zoneName ?? "", lat: p.lat, lng: p.lng, issues });
  }

  console.log(`\n══ AUDITORÍA GEO: ${providers.length} prestadores, ${flags.length} con señas ══\n`);
  for (const f of flags) {
    console.log(`⚠️  ${f.name} [${f.city}/${f.zone}] ${f.lat.toFixed(4)},${f.lng.toFixed(4)}`);
    for (const i of f.issues) console.log(`    - ${i}`);
  }
  await db.$disconnect();
}

main();
