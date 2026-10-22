/**
 * CORRECCIÓN GEOGRÁFICA INTEGRAL — Estado Bolívar (Task 29)
 *
 * Problema verificado en campo (usuario) + evidencia OSM/Plus Codes:
 * - El centro de la ciudad San Félix y 14 sectores estaban ~11 km al OESTE
 *   del río Caroní (lado Puerto Ordaz). El puente más cercano está al norte
 *   (represa Macagua) → distancias reales en carro 31+ min vs "1.7 km" recta.
 * - 11 negocios con Plus Code de Google en su ficha tenían coords generadas
 *   por jitter (centro de sector + ruido) en lugar de decodificar el código.
 * - Sectores nuevos PZO (Core 8, Guamo, Villa Bahía, Río Negro, Toro Muerto,
 *   Santa Rosa) con coords estimadas → reemplazo por suburb OSM verificado.
 *
 * Fuentes: Overpass (suburbios OSM), decodificador Plus Code (algoritmo
 * abierto de Google), Nominatim (validación inversa de calles).
 * Idempotente. Uso: bun scripts/fix-bolivar-geo.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// ── Plus Code decoder (alfabeto oficial Open Location Code) ──
const ALPH = "23456789CFGHJMPQRVWX";
function decodeFull(code: string): { lat: number; lng: number } {
  const c = code.replace("+", "");
  let lat = -90, lng = -180;
  const res = [20, 1, 0.05, 0.0025, 0.000125];
  for (let i = 0; i < 5; i++) {
    lat += ALPH.indexOf(c[i * 2]) * res[i];
    lng += ALPH.indexOf(c[i * 2 + 1]) * res[i];
  }
  return { lat: +lat.toFixed(5), lng: +lng.toFixed(5) };
}
function recoverShort(short: string, refLat: number, refLng: number): string {
  let lat = refLat + 90, lng = refLng + 180, full = "";
  for (const r of [20, 1, 0.05, 0.0025, 0.000125]) full += ALPH[Math.floor(lat / r) % 20] + ALPH[Math.floor(lng / r) % 20];
  const s = short.replace(/\s|\+/g, "");
  // los códigos cortos de bios vienen de fichas de Google (8 dígitos antes del +)
  return full.slice(0, 8 - (short.split("+")[0].length)) + s;
}
function hav(a: number, b: number, c: number, d: number): number {
  const R = 6371, dLat = ((c - a) * Math.PI) / 180, dLng = ((d - b) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a * Math.PI) / 180) * Math.cos((c * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Referencias de recuperación por ciudad (misma celda 1°×1° → decodificación única)
const CITY_REF: Record<string, [number, number]> = {
  "San Félix": [8.34, -62.66],
  "Puerto Ordaz": [8.28, -62.76],
  "Ciudad Bolívar": [8.12, -63.55],
  Upata: [8.02, -62.41],
};

// ── 1) Ciudad San Félix: centro real (nodo place=city OSM) ──
const CITY_FIX: Record<string, { lat: number; lng: number }> = {
  "San Félix": { lat: 8.34754, lng: -62.64713 },
};

// ── 2) Sectores con coords verificadas (suburbios OSM / Nominatim) ──
const SECTOR_FIX: { name: string; city: string; lat: number; lng: number; moveToCity?: string }[] = [
  // Puerto Ordaz (Overpass: place=suburb verificado)
  { name: "Core 8", city: "Puerto Ordaz", lat: 8.22855, lng: -62.82539 },        // Urbanización Gran Sabana (Core 8)
  { name: "Guamo", city: "Puerto Ordaz", lat: 8.27478, lng: -62.78208 },         // El Guamo
  { name: "Villa Bahía", city: "Puerto Ordaz", lat: 8.24032, lng: -62.79117 },   // Villa Bahía
  { name: "Río Negro", city: "Puerto Ordaz", lat: 8.26626, lng: -62.74637 },     // Río Negro
  { name: "Toro Muerto", city: "Puerto Ordaz", lat: 8.26806, lng: -62.72681 },   // Toro Muerto
  { name: "Santa Rosa", city: "Puerto Ordaz", lat: 8.25999, lng: -62.76068 },    // Lomas de Santa Rosa
  // "Gran Sabana" estaba como sector de San Félix pero es lado PZO (Parroquia Unare)
  { name: "Gran Sabana", city: "San Félix", lat: 8.2266, lng: -62.8278, moveToCity: "Puerto Ordaz" },
  // San Félix — verificados al Este del Caroní (Nominatim)
  { name: "San Félix Centro", city: "San Félix", lat: 8.3696, lng: -62.66454 },  // Calle Bolívar, Pquia Simón Bolívar
  { name: "Chirica", city: "San Félix", lat: 8.34754, lng: -62.64713 },
  { name: "El Roble", city: "San Félix", lat: 8.35404, lng: -62.67028 },
  { name: "Caratal", city: "San Félix", lat: 8.28821, lng: -62.58243 },
  { name: "Dalla Costa", city: "San Félix", lat: 8.34117, lng: -62.68045 },
];

// Sectores de SF sin geocode propio: ancla ciudad Este + offset mínimo determinista
const SF_ANCHOR = { lat: 8.34754, lng: -62.64713 };
const SF_UNRESOLVED = ["11 de Abril", "Caruachi", "El Niño", "El Palúu", "Guaicara", "La Cruz", "Las Américas", "Los Tanques", "Villa Española"];

// ── 3) Negocios: Plus Code de su ficha Google → posición exacta ──
const PROVIDER_PLUSCODE: { match: string; code: string }[] = [
  { match: "Centro Veterinario (San Félix)", code: "9984+G93" },
  { match: "Agropecuaria Los Naranjos", code: "88PX+85P" },
  { match: "Agropecuaria Del Barrio", code: "89X9+6J2" },
  { match: "Sion Pet Shop", code: "76MW+FM9" },
  { match: "Ferre-Agro Perza", code: "876R+JP3" },
  { match: "Agrícola Villa Alianza", code: "874J+FGC" },
  { match: "Ponme Guapo", code: "76F9+29" },
  { match: "Bogux Pet Shop", code: "77V8+RC4" },
  { match: "Crazy Pets,", code: "77R4+RP8" },
  { match: "Imperio Animal", code: "4CPW+7J5" },
  { match: "Monagro", code: "2J63+335" },
];

async function main() {
  console.log("═══ 1) Centros de ciudad ═══");
  for (const [name, f] of Object.entries(CITY_FIX)) {
    const c = await db.city.findFirst({ where: { name } });
    if (c) {
      await db.city.update({ where: { id: c.id }, data: { lat: f.lat, lng: f.lng } });
      console.log(`✔ ${name}: (${c.lat}, ${c.lng}) → (${f.lat}, ${f.lng})`);
    }
  }

  console.log("\n═══ 2) Sectores ═══");
  for (const s of SECTOR_FIX) {
    const existing = await db.sector.findUnique({ where: { cityName_name: { cityName: s.city, name: s.name } } });
    if (!existing) { console.log(`· ${s.name} (${s.city}): no existe en DB`); continue; }
    const targetCity = s.moveToCity ?? s.city;
    if (s.moveToCity) {
      // mover de ciudad: recrear con clave nueva
      await db.sector.update({ where: { id: existing.id }, data: { cityName: targetCity, lat: s.lat, lng: s.lng } });
      console.log(`✔ ${s.name}: ${s.city} → ${targetCity} (${s.lat}, ${s.lng})`);
    } else {
      await db.sector.update({ where: { id: existing.id }, data: { lat: s.lat, lng: s.lng } });
      console.log(`✔ ${s.name} (${targetCity}): (${existing.lat}, ${existing.lng}) → (${s.lat}, ${s.lng})`);
    }
  }
  for (const name of SF_UNRESOLVED) {
    const existing = await db.sector.findUnique({ where: { cityName_name: { cityName: "San Félix", name } } });
    if (!existing) continue;
    // offset determinista ±0.004° para no apilar chips idénticos
    const h = (name.split("").reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % 21) - 10;
    const lat = +(SF_ANCHOR.lat + (h % 3) * 0.003).toFixed(5);
    const lng = +(SF_ANCHOR.lng + ((h % 5) - 2) * 0.0035).toFixed(5);
    await db.sector.update({ where: { id: existing.id }, data: { lat, lng } });
    console.log(`≈ ${name} (SF, ancla ciudad): (${existing.lat}, ${existing.lng}) → (${lat}, ${lng})`);
  }

  console.log("\n═══ 3) Negocios por Plus Code ═══");
  const providers = await db.provider.findMany({ select: { id: true, businessName: true, city: true, lat: true, lng: true, bio: true } });
  let fixed = 0;
  for (const p of providers) {
    const row = PROVIDER_PLUSCODE.find((r) => p.businessName.includes(r.match));
    if (!row) continue;
    const ref = CITY_REF[p.city] ?? null;
    if (!ref) { console.log(`· ${p.businessName}: ciudad ${p.city} sin ref`); continue; }
    try {
      const full = recoverShort(row.code, ref[0], ref[1]);
      const { lat, lng } = decodeFull(full);
      if (Math.abs(lat - ref[0]) > 0.5 || Math.abs(lng - ref[1]) > 0.5) {
        console.log(`· ${p.businessName}: decodificado fuera de rango, se ignora`);
        continue;
      }
      const d = hav(p.lat, p.lng, lat, lng);
      await db.provider.update({ where: { id: p.id }, data: { lat, lng } });
      console.log(`✔ ${p.businessName.slice(0, 45)}: (${p.lat.toFixed(4)},${p.lng.toFixed(4)}) → (${lat},${lng}) Δ${d.toFixed(1)} km [${row.code}]`);
      fixed++;
    } catch (e) {
      console.log(`✗ ${p.businessName}: ${(e as Error).message}`);
    }
  }
  console.log(`\nNegocios corregidos: ${fixed}`);
  await db.$disconnect();
}
main();
