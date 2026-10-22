/**
 * PetService VE — Descarga POIs reales de mascotas (OpenStreetMap/Overpass)
 * para TODAS las ciudades activas y genera src/lib/petservice/real-osm-data.ts
 *
 * Fuente 100% gratuita y legal (ODbL — se muestra atribución en la app).
 * Uso: bun scripts/fetch-osm-pois.ts
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

const db = new PrismaClient();

const MIRRORS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const UA = "PetServiceVE/1.0 (directorio de mascotas; ODbL attribution)";
const BBOX_DEG = 0.3; // ~33 km alrededor de cada ciudad

interface OsmTagged {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
}

async function overpass(query: string): Promise<OsmTagged[]> {
  const body = new URLSearchParams({ data: query });
  for (const mirror of MIRRORS) {
    try {
      const res = await fetch(mirror, {
        method: "POST",
        body,
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { elements: OsmTagged[] };
      return json.elements ?? [];
    } catch (e) {
      console.warn(`    ⚠️ ${new URL(mirror).host} → ${(e as Error).message}`);
    }
  }
  throw new Error("Overpass no disponible en ningún espejo");
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, dLat = ((bLat - aLat) * Math.PI) / 180, dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function kindOf(tags: Record<string, string>): RealOsmRow["kind"] | null {
  if (tags.amenity === "veterinary") return "VET";
  if (tags.shop === "pet_grooming") return "GROOM";
  if (tags.shop === "pet" || tags.shop === "animal") return "SHOP";
  if (tags.amenity === "animal_boarding") return "BOARD";
  return null;
}

export interface RealOsmRow {
  osmId: string;
  kind: "VET" | "SHOP" | "GROOM" | "BOARD";
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  address: string;
  phones: string[];
  hours: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  website: string;
  email: string;
  rif: string;
}

function first(t: Record<string, string>, keys: string[]): string {
  for (const k of keys) if (t[k]) return t[k].trim();
  return "";
}

function parsePhones(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[;,\/]/).map((s) => s.trim()).filter(Boolean)) {
    let d = part.replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("58")) {
      // ok
    } else if (d.length === 11 && d.startsWith("0")) {
      d = "58" + d.slice(1);
    } else if (d.length === 10 && /^[24]/.test(d)) {
      d = "58" + d;
    } else {
      continue;
    }
    const pretty = `+58 ${d.slice(2, 5)}-${d.slice(5)}`;
    if (!out.includes(pretty)) out.push(pretty);
  }
  return out;
}

function readDirSafe(dir: string): string[] {
  try { return readdirSync(dir); } catch { return []; }
}

async function main() {
  const cities = await db.city.findMany({ where: { active: true }, orderBy: [{ name: "asc" }] });
  console.log(`🏙️ ${cities.length} ciudades activas`);

  const bboxes = cities.map(
    (c) =>
      `(${(c.lat - BBOX_DEG).toFixed(3)},${(c.lng - BBOX_DEG).toFixed(3)},${(c.lat + BBOX_DEG).toFixed(3)},${(c.lng + BBOX_DEG).toFixed(3)})`
  );
  const bboxChain = bboxes.join("");

  const MERGE_ONLY = process.argv.includes("--merge-only");
  const seen = new Map<string, OsmTagged>();
  let okCities = 0, failCities = 0, cachedCities = 0;
  const cacheDir = join(process.cwd(), ".cache", "osm-city");
  mkdirSync(cacheDir, { recursive: true });
  for (const c of cities) {
    if (MERGE_ONLY) continue;
    const cacheFile = join(cacheDir, `${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`);
    let els: OsmTagged[] | null = null;
    try {
      els = JSON.parse(readFileSync(cacheFile, "utf8")) as OsmTagged[];
      cachedCities++;
    } catch { /* sin cache */ }
    if (!els) {
      const bb = `(${(c.lat - BBOX_DEG).toFixed(3)},${(c.lng - BBOX_DEG).toFixed(3)},${(c.lat + BBOX_DEG).toFixed(3)},${(c.lng + BBOX_DEG).toFixed(3)})`;
      const q = `[out:json][timeout:40];(
        nwr["amenity"="veterinary"]${bb};
        nwr["shop"="pet"]${bb};
        nwr["shop"~"^pet_grooming|animal$"]${bb};
        nwr["amenity"="animal_boarding"]${bb};
      );out center tags;`;
      try {
        els = await overpass(q);
        writeFileSync(cacheFile, JSON.stringify(els));
      } catch (e) {
        failCities++;
        console.warn(`  ❌ ${c.name}: ${(e as Error).message}`);
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      void 0;
    }
    for (const el of els) seen.set(`${el.type}/${el.id}`, el);
    okCities++;
    console.log(`  ✅ ${c.name} (+${els.length})`);
    await new Promise((r) => setTimeout(r, 600));
  }
  console.log(`📦 Elementos crudos: ${seen.size} (OK=${okCities}, cache=${cachedCities}, fallidas=${failCities})`);

  const rows: RealOsmRow[] = [];
  const skippedNoName = { n: 0 }, skippedFar = { n: 0 }, skippedDupCity = { n: 0 };
  const perCityName = new Set<string>(); // misma ciudad + mismo nombre normalizado

  for (const el of seen.values()) {
    const t = el.tags ?? {};
    const kind = kindOf(t);
    if (!kind) continue;
    const name = first(t, ["name", "brand", "operator"]);
    if (!name) { skippedNoName.n++; continue; }

    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) { skippedFar.n++; continue; }

    // ciudad activa más cercana
    let best: (typeof cities)[number] | null = null, bestKm = Infinity;
    for (const c of cities) {
      const km = haversineKm(lat, lng, c.lat, c.lng);
      if (km < bestKm) { bestKm = km; best = c; }
    }
    if (!best || bestKm > 40) { skippedFar.n++; continue; }

    // dedupe ciudad+nombre
    const nk = `${best.name}::${name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).slice(0, 3).join(" ")}`;
    if (perCityName.has(nk)) { skippedDupCity.n++; continue; }
    perCityName.add(nk);

    const addressParts = [
      [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" "),
      t["addr:suburb"] || t["addr:neighbourhood"],
      t["addr:city"] || (t["addr:full"] ? "" : ""),
      t["addr:full"],
    ].filter(Boolean);

    rows.push({
      osmId: `${el.type}/${el.id}`,
      kind,
      name,
      city: best.name,
      state: best.state,
      lat: Number(lat.toFixed(5)),
      lng: Number(lng.toFixed(5)),
      address: addressParts.join(", ").slice(0, 200),
      phones: parsePhones(first(t, ["phone", "contact:phone", "contact:mobile", "contact:whatsapp"])),
      hours: first(t, ["opening_hours"]).slice(0, 120),
      instagram: first(t, ["contact:instagram", "instagram"]).slice(0, 80),
      facebook: first(t, ["contact:facebook", "facebook"]).slice(0, 100),
      tiktok: first(t, ["contact:tiktok", "tiktok"]).slice(0, 80),
      website: first(t, ["website", "contact:website", "url"]).slice(0, 140),
      email: first(t, ["email", "contact:email"]).slice(0, 100),
      rif: first(t, ["ref:vatin:ve", "ref:vatin"]).slice(0, 30),
    });
  }

  // ── Fusionar con caché Nominatim (.cache/nom-city/*.json) si existe ──
  const merged = new Map<string, RealOsmRow>();
  for (const r of rows) merged.set(r.osmId, r);
  const nomDir = join(process.cwd(), ".cache", "nom-city");
  try {
    const files = readDirSafe(nomDir);
    let nomCount = 0;
    for (const f of files.filter((x) => x.endsWith(".json"))) {
      const nomRows = JSON.parse(readFileSync(join(nomDir, f), "utf8")) as RealOsmRow[];
      for (const n of nomRows) {
        const ex = merged.get(n.osmId);
        if (!ex) { merged.set(n.osmId, n); nomCount++; continue; }
        // completar campos vacíos del row de Overpass con Nominatim
        if (!ex.address && n.address) ex.address = n.address;
        if (!ex.hours && n.hours) ex.hours = n.hours;
        if (!ex.instagram && n.instagram) ex.instagram = n.instagram;
        if (!ex.facebook && n.facebook) ex.facebook = n.facebook;
        if (!ex.tiktok && n.tiktok) ex.tiktok = n.tiktok;
        if (!ex.website && n.website) ex.website = n.website;
        if (!ex.email && n.email) ex.email = n.email;
        if (!ex.rif && n.rif) ex.rif = n.rif;
        for (const p of n.phones) if (!ex.phones.includes(p)) ex.phones.push(p);
      }
    }
    if (nomCount) console.log(`🔗 Nominatim aportó ${nomCount} negocios adicionales`);
  } catch { /* sin nominatim */ }
  const finalRows = Array.from(merged.values());

  const byKind: Record<string, number> = {};
  const byCity: Record<string, number> = {};
  for (const r of finalRows) {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    byCity[r.city] = (byCity[r.city] ?? 0) + 1;
  }
  console.log("Por tipo:", JSON.stringify(byKind), "\nPor ciudad:", JSON.stringify(byCity));
  console.log(`Saltados: sin nombre=${skippedNoName.n}, lejos=${skippedFar.n}, duplicados=${skippedDupCity.n}`);

  // ordenar por ciudad para diffs legibles
  finalRows.sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));

  mkdirSync(join(process.cwd(), ".cache"), { recursive: true });
  writeFileSync(join(process.cwd(), ".cache", "osm-pois.json"), JSON.stringify(finalRows, null, 2));

  const ts = `// AUTO-GENERADO por scripts/fetch-osm-pois.ts — NO editar a mano.
// Negocios REALES de mascotas desde OpenStreetMap (© OpenStreetMap contributors, ODbL).
// Regenerar: bun scripts/fetch-osm-pois.ts
export interface RealOsmRow {
  osmId: string;
  kind: "VET" | "SHOP" | "GROOM" | "BOARD";
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  address: string;
  phones: string[];
  hours: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  website: string;
  email: string;
  rif: string;
}

export const REAL_OSM_ROWS: RealOsmRow[] = ${JSON.stringify(finalRows, null, 0)};
export const REAL_OSM_ATTRIBUTION = "Datos de negocios © OpenStreetMap contributors (ODbL)";
`;
  writeFileSync(join(process.cwd(), "src", "lib", "petservice", "real-osm-data.ts"), ts);
  console.log(`✅ real-osm-data.ts generado con ${finalRows.length} negocios reales`);
  process.exit(0);
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
