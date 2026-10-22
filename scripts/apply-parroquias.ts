/**
 * Migración: sectores con PARROQUIAS reales en lugar de zonas cardinales genéricas.
 *
 * Reemplaza el campo `zone` de cada Sector (antes CENTRO/NORTE/SUR/ESTE/OESTE)
 * por el nombre de la PARROQUIA oficial donde está ubicado, según la división
 * político-territorial de Venezuela (INE) y fuentes verificadas:
 *
 *  - Municipio Caroní (11 parroquias oficiales): Unare, Cachamay, Universidad,
 *    Pozo Verde (rural), Simón Bolívar, Once de Abril, Dalla Costa, Cinco de Julio,
 *    Chirica, Vista al Sol, Yocoima.
 *    · Core 8 / Urb. Gran Sabana / El Guamo / Villa Bahía / Santa Rosa / Río Negro /
 *      Alta Vista → Pq. Unare (codigo-postal.co Pq. Unare + prensa local).
 *    · Villa Colombia / Villa Alianza / Castillito → Pq. Cachamay (codigo-postal.co).
 *    · Los Mangos / Mini Fincas / Los Olivos / Toro Muerto → Pq. Universidad
 *      ("incluye la zona de Alta Vista, Toro Muerto…" — ficha oficial de la parroquia).
 *    · El Roble → Pq. Simón Bolívar (Roble por Dentro, iglesia Adventista).
 *    · Las Américas → Pq. Once de Abril (codigo-postal.co).
 *    · Caratal → Pq. Yocoima (vía Upata, sur de San Félix).
 *  - Municipio Heres (Ciudad Bolívar, 9 parroquias): Centro Histórico → Catedral;
 *    Paseo Orinoco → Orinoco; La Coromoto → La Sabanita (calle principal de Sabanita).
 *  - Municipio Piar (Upata, 3 parroquias): todos los sectores urbanos → Pq. Upata.
 *
 * Además: el sector "Los Olivos" estaba erróneamente en San Félix — la Urb. Los
 * Olivos es de Puerto Ordaz (Pq. Universidad, 8050); se reasigna de ciudad y se
 * corrigen sus coordenadas (aprox. centro de la urbanización, junto a Av. Manuel Piar).
 *
 * Ejecutar:  bun scripts/apply-parroquias.ts   (idempotente)
 * Luego:     bun scripts/gen-demo-db.ts
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** sector name (por ciudad) → parroquia oficial */
const PARROQUIA_POR_SECTOR: Record<string, string> = {
  // ── Puerto Ordaz (municipio Caroní, orilla norte) ──
  "Alta Vista": "Unare",
  Unare: "Unare",
  "Villa Colombia": "Cachamay",
  Cachamay: "Cachamay",
  "Villa América": "Cachamay",
  "Los Mangos": "Universidad",
  Minifincas: "Universidad",
  "Toro Muerto": "Universidad",
  "Santa Rosa": "Unare",
  "Río Negro": "Unare",
  "Core 8": "Unare",
  "Gran Sabana": "Unare",
  Guamo: "Unare",
  "Villa Bahía": "Unare",
  "La Llovizna": "Universidad",
  // ── San Félix (municipio Caroní, orilla sur) ──
  "San Félix Centro": "Simón Bolívar",
  "El Roble": "Simón Bolívar",
  "La Cruz": "Simón Bolívar",
  "Los Tanques": "Simón Bolívar",
  "11 de Abril": "Once de Abril",
  "Las Américas": "Once de Abril",
  Guaicara: "Once de Abril",
  "El Niño": "Once de Abril",
  "Dalla Costa": "Dalla Costa",
  "Villa Española": "Dalla Costa",
  Caruachi: "Cinco de Julio",
  Chirica: "Chirica",
  "El Palúu": "Chirica",
  Caratal: "Yocoima",
  // ── Ciudad Bolívar (municipio Heres / Angostura del Orinoco) ──
  "Centro Histórico": "Catedral",
  "Paseo Orinoco": "Orinoco",
  "Vista Hermosa": "Vista Hermosa",
  "La Sabanita": "La Sabanita",
  "La Coromoto": "La Sabanita",
  // ── Upata (municipio Piar) ──
  "Upata Centro": "Upata",
  "Las Mercedes": "Upata",
  "La Concepción": "Upata",
  "El Cerro (Toro Patú)": "Upata",
};

/** sectores reubicados de ciudad (correcciones de datos de importación) */
const REUBICACIONES: { city: string; name: string; toCity: string; lat: number; lng: number }[] = [
  { city: "San Félix", name: "Los Olivos", toCity: "Puerto Ordaz", lat: 8.2894, lng: -62.7532 },
];

async function main() {
  const sectors = await db.sector.findMany();
  let actualizados = 0;
  let sinMapeo: string[] = [];
  let movidos = 0;

  for (const s of sectors) {
    // 1) Reubicaciones de ciudad (Los Olivos → Puerto Ordaz)
    const reubic = REUBICACIONES.find((r) => r.city === s.cityName && r.name === s.name);
    if (reubic) {
      await db.sector.update({
        where: { id: s.id },
        data: { cityName: reubic.toCity, zone: "Universidad", lat: reubic.lat, lng: reubic.lng },
      });
      movidos++;
      console.log(`↪︎ ${s.name}: ${s.cityName} → ${reubic.toCity} (Pq. Universidad, coords corregidas)`);
      continue;
    }

    // 2) Parroquia oficial
    const pq = PARROQUIA_POR_SECTOR[s.name];
    if (!pq) {
      // Solo los que siguen sin mapear; los ya migrados se conservan
      if (s.zone && s.zone !== "CENTRO") continue;
      sinMapeo.push(`${s.cityName}/${s.name}`);
      continue;
    }
    if (s.zone !== pq) {
      await db.sector.update({ where: { id: s.id }, data: { zone: pq } });
      actualizados++;
    }
  }

  console.log(`\n✅ Parroquias actualizadas: ${actualizados} · reubicados: ${movidos}`);
  if (sinMapeo.length) console.log(`⚠️ Sin mapeo (se mantienen): ${sinMapeo.join(", ")}`);

  // Resumen final por ciudad
  const final = await db.sector.findMany({ orderBy: [{ cityName: "asc" }, { zone: "asc" }, { name: "asc" }] });
  const porCiudad = new Map<string, Map<string, string[]>>();
  for (const s of final) {
    const porPq = porCiudad.get(s.cityName) ?? new Map<string, string[]>();
    const arr = porPq.get(s.zone ?? "—") ?? [];
    arr.push(s.name);
    porPq.set(s.zone ?? "—", arr);
    porCiudad.set(s.cityName, porPq);
  }
  for (const [city, porPq] of porCiudad) {
    console.log(`\n== ${city} ==`);
    for (const [pq, names] of [...porPq.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"))) {
      console.log(`  Pq. ${pq}: ${names.join(", ")}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
