/**
 * Geocodifica los sectores de San Félix (lado Este del Caroní) vía Nominatim.
 * Acepta solo resultados con lng > -62.72 (Este del río).
 * Uso: bun scripts/geocode-sf-sectors.ts → .cache/sf-sectors.json
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";

const CACHE = ".cache/sf-sectors.json";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SECTORS: Record<string, string[]> = {
  "San Félix Centro": ["San Félix centro, Venezuela", "Catedral de San Félix, Venezuela"],
  "11 de Abril": ["Once de Abril, San Félix", "Parroquia Once de Abril, Municipio Caroní"],
  Caratal: ["Caratal, San Félix", "Caratal, Municipio Caroní"],
  Caruachi: ["Caruachi, San Félix", "Villa Caruachi, San Félix"],
  "El Niño": ["El Niño, San Félix", "Sector El Niño, San Félix"],
  "El Palúu": ["El Palúu, San Félix", "Paluu, San Felix"],
  "El Roble": ["El Roble, San Félix", "Sector El Roble, Ciudad Guayana"],
  Guaicara: ["Guaicara, San Félix", "Quebrada Guaicara, San Félix"],
  "La Cruz": ["La Cruz, San Félix", "Sector La Cruz, San Félix"],
  "Las Américas": ["Las Américas, San Félix", "Urbanización Las Américas, San Félix"],
  "Los Tanques": ["Los Tanques, San Félix", "Sector Los Tanques, Ciudad Guayana"],
  "Villa Española": ["Villa Española, San Félix", "Villa Espanola, San Felix"],
  Chirica: ["Chirica, San Félix", "Parroquia Chirica, Municipio Caroní"],
  "Dalla Costa": ["Parroquia Dalla Costa, San Félix", "Dalla Costa, Ciudad Guayana"],
  Unare: ["Parroquia Unare, San Félix", "Unare, Ciudad Guayana"],
};

async function nominatim(q: string, retries = 3): Promise<Array<{ lat: string; lon: string; display_name: string }>> {
  const qs = new URLSearchParams({ q, format: "jsonv2", limit: "3", "accept-language": "es" });
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, {
        headers: { "User-Agent": "petservice-ve-sectors/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const j = await res.json();
        await sleep(1300);
        return j;
      }
    } catch { /* retry */ }
    await sleep(2000 * (i + 1));
  }
  return [];
}

async function main() {
  const out = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  for (const [name, queries] of Object.entries(SECTORS)) {
    if (out[name]?.lat) continue;
    for (const q of queries) {
      const results = await nominatim(q);
      // Preferir resultados del Este del Caroní (lng > -62.72) dentro de Bolívar
      const ok = results.find((r) => {
        const lat = +r.lat, lng = +r.lon;
        return lat > 8.05 && lat < 8.5 && lng > -62.72 && lng < -62.4;
      });
      if (ok) {
        out[name] = { lat: +ok.lat, lng: +ok.lon, label: ok.display_name.slice(0, 120), query: q };
        console.log(`✔ ${name}: ${ok.lat}, ${ok.lon} — ${ok.display_name.slice(0, 80)}`);
        break;
      }
    }
    if (!out[name]) console.log(`✗ ${name}: sin resultado válido al Este`);
  }
  writeFileSync(CACHE, JSON.stringify(out, null, 2));
  console.log(`→ ${CACHE} (${Object.keys(out).length} resueltos)`);
}
main();
