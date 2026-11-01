/**
 * Task 32-c — Corrige los 8 prestadores de San Félix con pin al oeste del Caroní
 * (orilla equivocada) + Agropecuaria Puerto Ordaz (era de PO con ciudad SF).
 * Uso: bun scripts/fix-sf-crossriver.ts
 */
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync, writeFileSync } from "fs";

const db = new PrismaClient({ datasourceUrl: `file:${process.cwd()}/db/custom.db`, log: ["error"] });
const UA = "PetServiceVE/2.0 (directorio de mascotas; one-time geo fix; contact: impulsaia@gmail.com)";
const CACHE = "/tmp/geo-cache3.json";
const cache: Record<string, { lat: number; lng: number } | null> = existsSync(CACHE)
  ? JSON.parse(readFileSync(CACHE, "utf8"))
  : {};

async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  if (q in cache) return cache[q];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ve");
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) });
    const j = res.ok ? ((await res.json()) as { lat: string; lon: string; display_name: string }[]) : [];
    const out = j[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : null;
    cache[q] = out;
    writeFileSync(CACHE, JSON.stringify(cache));
    if (out) console.log(`      ↳ "${q}" → ${out.lat.toFixed(4)},${out.lng.toFixed(4)} (${j[0].display_name.slice(0, 50)})`);
    return out;
  } catch {
    return null;
  } finally {
    await new Promise((r) => setTimeout(r, 1150));
  }
}

const SF_CENTER = { lat: 8.3475, lng: -62.6471 };

const FIXES: { match: string; queries: string[]; fallback: { lat: number; lng: number }; city?: string; zone?: string }[] = [
  { match: "Dra. Rondón", queries: ["Calle Araure, San Félix"], fallback: SF_CENTER },
  { match: "Lookanino", queries: ["Lookanino San Félix"], fallback: SF_CENTER, zone: "San Félix" },
  { match: "Agropecuaria Kawi", queries: ["Avenida Libertador, San Félix"], fallback: SF_CENTER, zone: "Av. Libertador" },
  { match: "Agropecuaria Gobey", queries: [], fallback: SF_CENTER, zone: "San Félix" },
  { match: "Agropecuaria Puerto Ordaz", queries: ["Calle La Urbana, Puerto Ordaz"], fallback: { lat: 8.3214, lng: -62.7171 }, city: "Puerto Ordaz", zone: "Castillito · Calle La Urbana" },
  { match: "El Perolero San Félix", queries: [], fallback: SF_CENTER, zone: "San Félix" },
  { match: "Clínica Veterinaria Los Olivos", queries: [], fallback: { lat: 8.34454, lng: -62.66113 }, zone: "Los Olivos" },
  { match: "Mascotas Felices", queries: ["Avenida Baralt, San Félix"], fallback: SF_CENTER, zone: "Av. Baralt" },
];

async function main() {
  for (const f of FIXES) {
    const p = await db.provider.findFirst({ where: { businessName: { contains: f.match } } });
    if (!p) { console.log(`⚠️ no encontrado: ${f.match}`); continue; }
    let g: { lat: number; lng: number } | null = null;
    for (const q of f.queries) {
      g = await geocode(q);
      if (g) break;
    }
    if (!g) g = f.fallback;
    await db.provider.update({
      where: { id: p.id },
      data: { lat: g.lat, lng: g.lng, ...(f.city ? { city: f.city } : {}), ...(f.zone ? { zoneName: f.zone } : {}) },
    });
    console.log(`📍 ${p.businessName.slice(0, 45)} → ${g.lat.toFixed(4)},${g.lng.toFixed(4)} ${f.city ? `· ciudad=${f.city}` : ""} ${f.zone ? `· zone="${f.zone}"` : ""}`);
  }
  await db.$disconnect();
}

main();
