/**
 * Auditoría geo PROFUNDA por ciudad (Task 32 verificación).
 * 1) prestadores clavados EXACTAMENTE en el centro de la ciudad (artefacto import WEB)
 * 2) prestadores agrupados en pins idénticos (cualquier grupo >=2)
 * 3) resumen por ciudad: total, distancia media al centro, max
 * Uso: bun scripts/audit-geo-deep.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasourceUrl: `file:${process.cwd()}/db/custom.db`, log: ["error"] });

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

async function main() {
  const providers = await db.provider.findMany({
    where: { status: "VERIFIED" },
    select: { businessName: true, city: true, zoneName: true, lat: true, lng: true, source: true, bio: true, status: true },
    orderBy: { city: "asc" },
  });

  // 1) clavados en el centro exacto de la ciudad
  console.log("══ 1) PIN = CENTRO EXACTO DE CIUDAD (artefacto import) ══");
  let n1 = 0;
  for (const p of providers) {
    const c = CITY_CENTERS[p.city];
    if (!c) continue;
    if (p.lat.toFixed(4) === c.lat.toFixed(4) && p.lng.toFixed(4) === c.lng.toFixed(4)) {
      n1++;
      console.log(`  🎯 ${p.businessName} [${p.city}/${p.zoneName}] src=${p.source} status=${p.status}`);
    }
  }
  if (!n1) console.log("  (ninguno)");

  // 2) pins idénticos compartidos por >=2 (cualquier ciudad)
  console.log("\n══ 2) PINS IDÉNTICOS COMPARTIDOS (>=2 prestadores) ══");
  const groups = new Map<string, typeof providers>();
  for (const p of providers) {
    const k = `${p.city}|${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    const arr = groups.get(k) ?? [];
    arr.push(p);
    groups.set(k, arr);
  }
  for (const [k, arr] of groups) {
    if (arr.length >= 2) {
      const [city, coords] = k.split("|");
      console.log(`  📍 ${city} ${coords} — ${arr.length} prestadores:`);
      for (const p of arr) console.log(`      - ${p.businessName} [${p.zoneName}] src=${p.source}`);
    }
  }

  // 3) resumen por ciudad
  console.log("\n══ 3) RESUMEN POR CIUDAD ══");
  const byCity = new Map<string, { n: number; dists: number[]; srcs: Map<string, number> }>();
  for (const p of providers) {
    const c = CITY_CENTERS[p.city];
    if (!c) continue;
    const e = byCity.get(p.city) ?? { n: 0, dists: [], srcs: new Map() };
    e.n++;
    e.dists.push(haversineKm(p.lat, p.lng, c.lat, c.lng));
    e.srcs.set(p.source, (e.srcs.get(p.source) ?? 0) + 1);
    byCity.set(p.city, e);
  }
  for (const [city, e] of [...byCity.entries()].sort((a, b) => b.n - a.n)) {
    const avg = e.dists.reduce((a, b) => a + b, 0) / e.dists.length;
    const max = Math.max(...e.dists);
    const srcs = [...e.srcs.entries()].map(([s, n]) => `${s}:${n}`).join(" ");
    console.log(`  ${city.padEnd(16)} n=${String(e.n).padStart(3)}  distMedia=${avg.toFixed(1)}km  max=${max.toFixed(1)}km  [${srcs}]`);
  }

  // 4) outliers por ciudad (>15km del centro, para revisión manual)
  console.log("\n══ 4) OUTLIERS >15 KM DEL CENTRO DE SU CIUDAD ══");
  for (const p of providers) {
    const c = CITY_CENTERS[p.city];
    if (!c) continue;
    const d = haversineKm(p.lat, p.lng, c.lat, c.lng);
    if (d > 15) {
      const pin = (p.bio ?? "").split("\n").find((l) => l.includes("📍")) ?? "";
      console.log(`  ⚠️  ${p.businessName} [${p.city}/${p.zoneName}] ${d.toFixed(1)}km src=${p.source} bio: ${pin.trim().slice(0, 70)}`);
    }
  }

  await db.$disconnect();
}

main();
