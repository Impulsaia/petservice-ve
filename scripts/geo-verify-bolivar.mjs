/**
 * Verificación geográfica Bolívar (Task 29):
 * 1. Decodifica Plus Codes de Google presentes en los bios (posición REAL según Google Maps).
 * 2. Re-geocodifica direcciones de negocios "San Félix" con viewbox del lado Este
 *    (nuestras coords quedaron del lado oeste del Caroní por error de investigación).
 * 3. Re-geocodifica los 8 sectores nuevos de Puerto Ordaz/San Félix.
 * Guarda .cache/geo-fix.json con propuestas de corrección (no toca la DB).
 */
import { readFileSync, writeFileSync, existsSync } from "fs";

const CACHE = ".cache/geo-fix.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NOM = "https://nominatim.openstreetmap.org";

async function nominatim(q, { viewbox = null, limit = 1, retries = 3 } = {}) {
  const qs = new URLSearchParams({ q, format: "jsonv2", limit: String(limit), "accept-language": "es" });
  if (viewbox) {
    qs.set("viewbox", viewbox);
    qs.set("bounded", "1");
  }
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${NOM}/search?${qs}`, { headers: { "User-Agent": "petservice-ve-geo-fix/1.0" }, signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const j = await res.json();
        await sleep(1200); // cortesía con Nominatim (1 req/s)
        return j;
      }
    } catch { /* retry */ }
    await sleep(2500 * (i + 1));
  }
  return [];
}

// ── Plus Code decoder ──
const ALPH = "23456789CFGHJMPQRVWX";
function decodePlusCode(code) {
  const clean = code.replace("+", "");
  const lat = -90 + [20, 1, 0.05, 0.0025, 0.000125].reduce((acc, res, i) => acc + ALPH.indexOf(clean[i * 2]) * res, 0);
  const lng = -180 + [20, 1, 0.05, 0.0025, 0.000125].reduce((acc, res, i) => acc + ALPH.indexOf(clean[i * 2 + 1]) * res, 0);
  return { lat, lng };
}
function recoverShort(short, refLat, refLng) {
  let lat = refLat + 90, lng = refLng + 180, full = "";
  for (const res of [20, 1, 0.05, 0.0025, 0.000125]) full += ALPH[Math.floor(lat / res) % 20] + ALPH[Math.floor(lng / res) % 20];
  return full.slice(0, full.length - short.replace("+", "").length) + short.replace("+", "");
}
const PLUS_RE = /\b[23456789CFGHJMPQRVWX]{2,4}\+[23456789CFGHJMPQRVWX]{2,6}\b/;

// ── Viewboxes: [oeste, sur, este, norte] ──
const VB_SF = "-62.73,8.14,-62.55,8.42";       // San Félix Este del Caroní
const VB_PZO_SW = "-62.90,8.14,-62.70,8.32";   // zona suroeste PZO (Gran Sabana, Guamo, Toro Muerto…)

async function main() {
  const out = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : { sectors: {}, providers: [] };

  // ── 1) Sectores a verificar ──
  const sectors = [
    { name: "Core 8", q: "Urbanización Gran Sabana, Puerto Ordaz", vb: VB_PZO_SW, hint: [8.2228, -62.8279] },
    { name: "Guamo", q: "El Guamo, Puerto Ordaz", vb: VB_PZO_SW },
    { name: "Villa Bahía", q: "Villa Bahía, Puerto Ordaz", vb: VB_PZO_SW },
    { name: "Río Negro", q: "Río Negro, Puerto Ordaz", vb: VB_PZO_SW },
    { name: "Minifincas", q: "Minifincas, Puerto Ordaz", vb: VB_PZO_SW },
    { name: "Toro Muerto", q: "Toro Muerto, Puerto Ordaz", vb: VB_PZO_SW },
    { name: "Santa Rosa", q: "Fila de Santa Rosa, Puerto Ordaz", vb: VB_PZO_SW },
  ];
  for (const s of sectors) {
    if (out.sectors[s.name]?.lat) continue; // ya resuelto
    const r = await nominatim(s.q, { viewbox: s.vb });
    if (r[0]) out.sectors[s.name] = { q: s.q, lat: +r[0].lat, lng: +r[0].lon, label: r[0].display_name.slice(0, 110) };
    console.log(`sector ${s.name}:`, out.sectors[s.name] ? `${out.sectors[s.name].lat}, ${out.sectors[s.name].lng} — ${out.sectors[s.name].label}` : "sin resultado");
  }

  // ── 2) Negocios de San Félix: cargar DB ──
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  const sf = await db.provider.findMany({
    where: { city: "San Félix" },
    select: { id: true, businessName: true, bio: true, lat: true, lng: true },
  });
  console.log(`\nSan Félix: ${sf.length} negocios`);
  const existing = new Set(out.providers.map((p) => p.id));

  for (const p of sf) {
    if (existing.has(p.id)) continue;
    const item = { id: p.id, name: p.businessName, oldLat: p.lat, oldLng: p.lng, source: null, lat: null, lng: null, label: null };

    // 2a) Plus Code en el bio → posición EXACTA de Google Maps
    const m = p.bio.match(PLUS_RE);
    if (m) {
      try {
        const full = recoverShort(m[0], 8.24, -62.66); // ref: centro SF
        const { lat, lng } = decodePlusCode(full);
        if (Math.abs(lat - 8.24) < 0.35 && Math.abs(lng + 62.66) < 0.35) {
          item.source = `pluscode:${m[0]}`;
          item.lat = lat; item.lng = lng;
          out.providers.push(item);
          console.log(`✔ pluscode ${p.businessName}: (${p.lat.toFixed(4)},${p.lng.toFixed(4)}) → (${lat.toFixed(4)},${lng.toFixed(4)}) [${m[0]}]`);
          continue;
        }
      } catch { /* cae a geocode */ }
    }

    // 2b) Dirección del bio → Nominatim con viewbox Este del Caroní
    const addrLine = p.bio.split("\n").find((l) => l.startsWith("📍"));
    if (addrLine) {
      const raw = addrLine.replace("📍", "").split("·")[0].trim();
      const r = await nominatim(`${raw}, San Félix, Municipio Caroní, Bolívar, Venezuela`, { viewbox: VB_SF });
      if (r[0]) {
        const lat = +r[0].lat, lng = +r[0].lon;
        if (lat > 8.1 && lat < 8.45 && lng > -62.73 && lng < -62.5) {
          item.source = "nominatim";
          item.lat = lat; item.lng = lng;
          item.label = r[0].display_name.slice(0, 110);
          out.providers.push(item);
          console.log(`✔ geocode ${p.businessName}: (${p.lat.toFixed(4)},${p.lng.toFixed(4)}) → (${lat.toFixed(4)},${lng.toFixed(4)}) — ${r[0].display_name.slice(0, 70)}`);
          continue;
        }
      }
    }
    console.log(`· sin fix ${p.businessName} (queda (${p.lat.toFixed(4)},${p.lng.toFixed(4)}))`);
  }
  await db.$disconnect();

  writeFileSync(CACHE, JSON.stringify(out, null, 2));
  console.log(`\nGuardado ${CACHE}: ${out.providers.length} propuestas, ${Object.keys(out.sectors).length} sectores`);
}
main();
