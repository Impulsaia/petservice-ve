/**
 * Reconstruye el catálogo City + Sector (necesario tras un rollback de la DB local).
 * - Cities: Bolívar (centros conocidos) + todas las (city, state) de los datos reales OSM (promedio de coords).
 * - Sectors: ZONES de constants.ts (sectores reales con coords).
 * Idempotente: upsert por claves únicas. Ejecutar ANTES de seedAll si la DB está vacía.
 * Uso: bun scripts/seed-catalog.ts
 */
import { PrismaClient } from "@prisma/client";
import { ZONES } from "../src/lib/petservice/constants";
import { REAL_OSM_ROWS } from "../src/lib/petservice/real-osm-data";

const db = new PrismaClient();

// Ciudades de Bolívar con centros conocidos (coinciden con CITY_BOUNDS de geo.ts)
const BOLIVAR_CENTERS: { name: string; state: string; lat: number; lng: number }[] = [
  { name: "Puerto Ordaz", state: "Bolívar", lat: 8.2735, lng: -62.7625 },
  { name: "San Félix", state: "Bolívar", lat: 8.2388, lng: -62.795 },
  { name: "Ciudad Bolívar", state: "Bolívar", lat: 8.1225, lng: -63.5475 },
  { name: "Upata", state: "Bolívar", lat: 8.0194, lng: -62.4066 },
];

async function main() {
  // ── 1) Ciudades de Bolívar (centros fijos) ──
  for (const c of BOLIVAR_CENTERS) {
    await db.city.upsert({
      where: { name_state: { name: c.name, state: c.state } },
      update: { lat: c.lat, lng: c.lng, active: true },
      create: { name: c.name, state: c.state, lat: c.lat, lng: c.lng, active: true },
    });
  }

  // ── 2) Ciudades de los datos reales OSM (promedio de coords de sus negocios) ──
  const groups = new Map<string, { state: string; latSum: number; lngSum: number; n: number }>();
  for (const r of REAL_OSM_ROWS) {
    const key = `${r.city}||${r.state}`;
    const g = groups.get(key) ?? { state: r.state, latSum: 0, lngSum: 0, n: 0 };
    g.latSum += r.lat;
    g.lngSum += r.lng;
    g.n += 1;
    groups.set(key, g);
  }
  let citiesCreated = 0;
  for (const [key, g] of groups) {
    const [name, state] = key.split("||");
    const exists = await db.city.findUnique({ where: { name_state: { name, state } } });
    if (!exists) {
      await db.city.create({ data: { name, state, lat: g.latSum / g.n, lng: g.lngSum / g.n, active: true } });
      citiesCreated++;
    } else if (!exists.active) {
      await db.city.update({ where: { id: exists.id }, data: { active: true } });
    }
  }
  console.log(`✅ City listas — Bolívar: ${BOLIVAR_CENTERS.length} fijas · OSM nuevas: ${citiesCreated}`);

  // ── 3) Sectores desde ZONES (constants) ──
  let sectors = 0;
  for (const z of ZONES) {
    const existing = await db.sector.findUnique({ where: { cityName_name: { cityName: z.city, name: z.name } } });
    if (existing) {
      await db.sector.update({ where: { id: existing.id }, data: { lat: z.lat, lng: z.lng, active: true } });
    } else {
      await db.sector.create({ data: { cityName: z.city, name: z.name, zone: "CENTRO", lat: z.lat, lng: z.lng, active: true } });
      sectors++;
    }
  }
  console.log(`✅ Sector listos — nuevos: ${sectors} · total ZONES: ${ZONES.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
