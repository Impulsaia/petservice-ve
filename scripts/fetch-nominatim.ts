/**
 * PetService VE — Complemento de OpenStreetMap vía Nominatim (búsqueda por nombre
 * acotada a la ciudad). Se fusiona luego con los resultados de Overpass.
 * Uso: bun scripts/fetch-nominatim.ts   (respeta 1 req/s de la política de Nominatim)
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";

const db = new PrismaClient();
const BASE = "https://nominatim.openstreetmap.org/search";
const UA = "PetServiceVE/1.0 (directorio de mascotas; demo; one-time import)";

const KEYWORDS = ["veterinaria", "veterinary", "mascotas", "pet shop", "peluqueria canina", "agropecuaria mascotas", "animal"];

interface NomResult {
  place_id: number;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  category: string;
  type: string;
  name: string;
  display_name: string;
  extratags?: Record<string, string>;
  address?: Record<string, string>;
}

async function search(q: string, viewbox: string): Promise<NomResult[]> {
  const url = `${BASE}?q=${encodeURIComponent(q)}&viewbox=${viewbox}&bounded=1&format=jsonv2&extratags=1&addressdetails=1&limit=50&countrycodes=ve`;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "es" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as NomResult[];
}

function classify(r: NomResult): "VET" | "SHOP" | "GROOM" | "BOARD" | null {
  const name = (r.name || "").toLowerCase();
  if (r.type === "veterinary") return "VET";
  if (r.type === "pet" || r.type === "pet_shop") return "SHOP";
  if (r.type === "pet_grooming") return "GROOM";
  if (r.type === "animal_boarding") return "BOARD";
  const interesting = /veterinar|mascota|peluquer|grooming|canina|felina|pet|animal|perros|gatos|agro/.test(name);
  if (!interesting) return null;
  if (/veterinar|clinic|pital|consulta/.test(name)) return "VET";
  if (/groom|peluquer|b[añ]o|est[eé]tica/.test(name)) return "GROOM";
  return "SHOP";
}

function parsePhones(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[;,\/]/).map((s) => s.trim()).filter(Boolean)) {
    let d = part.replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("58")) {
      // ok
    } else if (d.length === 11 && d.startsWith("0")) d = "58" + d.slice(1);
    else if (d.length === 10 && /^[24]/.test(d)) d = "58" + d;
    else continue;
    const pretty = `+58 ${d.slice(2, 5)}-${d.slice(5)}`;
    if (!out.includes(pretty)) out.push(pretty);
  }
  return out;
}

function toRow(r: NomResult, kind: NonNullable<ReturnType<typeof classify>>, cityName: string, state: string) {
  const t = r.extratags ?? {};
  const a = r.address ?? {};
  const addressParts = [
    [a.road, a.house_number].filter(Boolean).join(" "),
    a.suburb || a.neighbourhood || a.city_district,
    a.city || a.town || a.village,
  ].filter(Boolean);
  return {
    osmId: `${r.osm_type}/${r.osm_id}`,
    kind,
    name: (r.name || r.display_name.split(",")[0]).slice(0, 80),
    city: cityName,
    state,
    lat: Number(Number(r.lat).toFixed(5)),
    lng: Number(Number(r.lon).toFixed(5)),
    address: addressParts.join(", ").slice(0, 200),
    phones: parsePhones(t.phone || t["contact:phone"] || t["contact:mobile"] || t["contact:whatsapp"] || ""),
    hours: (t.opening_hours || "").slice(0, 120),
    instagram: (t["contact:instagram"] || t.instagram || "").slice(0, 80),
    facebook: (t["contact:facebook"] || t.facebook || "").slice(0, 100),
    tiktok: (t["contact:tiktok"] || t.tiktok || "").slice(0, 80),
    website: (t.website || t["contact:website"] || t.url || "").slice(0, 140),
    email: (t.email || t["contact:email"] || "").slice(0, 100),
    rif: (t["ref:vatin:ve"] || t["ref:vatin"] || "").slice(0, 30),
  };
}

async function main() {
  const cities = await db.city.findMany({ where: { active: true }, orderBy: [{ name: "asc" }] });
  const cacheDir = join(process.cwd(), ".cache", "nom-city");
  mkdirSync(cacheDir, { recursive: true });

  for (const c of cities) {
    const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const cacheFile = join(cacheDir, `${slug}.json`);
    if (readFileSyncSafe(cacheFile)) { console.log(`  ⏭️ ${c.name} (cache)`); continue; }

    const viewbox = `${c.lng - 0.3},${c.lat + 0.3},${c.lng + 0.3},${c.lat - 0.3}`;
    const byId = new Map<string, ReturnType<typeof toRow>>();

    for (const kw of KEYWORDS) {
      try {
        const results = await search(kw, viewbox);
        let added = 0;
        for (const r of results) {
          const kind = classify(r);
          if (!kind || !r.name) continue;
          const id = `${r.osm_type}/${r.osm_id}`;
          if (byId.has(id)) continue;
          byId.set(id, toRow(r, kind, c.name, c.state));
          added++;
        }
        console.log(`  🔎 ${c.name} · "${kw}" → +${added}/${results.length}`);
      } catch (e) {
        console.warn(`  ⚠️ ${c.name} · "${kw}": ${(e as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 1200)); // política Nominatim: 1 req/s
    }

    writeFileSync(cacheFile, JSON.stringify(Array.from(byId.values())));
    console.log(`  ✅ ${c.name}: ${byId.size} negocios`);
  }
  console.log("DONE-NOMINATIM");
  process.exit(0);
}

function readFileSyncSafe(f: string): boolean {
  try { readFileSync(f); return true; } catch { return false; }
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
