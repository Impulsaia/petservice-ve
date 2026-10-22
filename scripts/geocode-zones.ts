/**
 * Geocodificación Nominatim para sectores nuevos y direcciones de negocios reales.
 * Uso: bun scripts/geocode-zones.ts → .cache/zones-geocode.json
 */
import { mkdirSync, writeFileSync } from "node:fs";

const UA = "PetServiceVE-Research/1.0 (directorio de negocios de mascotas; contacto: petservice-ve.vercel.app)";

const TARGETS: { id: string; queries: string[] }[] = [
  // Sectores nuevos (ciudad Guayana)
  { id: "sector:core8", queries: ["Core 8, Unare, Puerto Ordaz", "Core 8, Ciudad Guayana"] },
  { id: "sector:gran-sabana", queries: ["Urb. Gran Sabana, San Félix, Ciudad Guayana", "Gran Sabana, Ciudad Guayana"] },
  { id: "sector:guamo", queries: ["El Guamo, Puerto Ordaz", "Guamo, Ciudad Guayana"] },
  { id: "sector:villa-bahia", queries: ["Villa Bahía, Puerto Ordaz", "Villa Bahia, Ciudad Guayana"] },
  { id: "sector:rio-negro", queries: ["Río Negro, Puerto Ordaz", "Rio Negro, Ciudad Guayana"] },
  { id: "sector:minifincas", queries: ["Minifincas, Unare, Puerto Ordaz", "Minifincas, Ciudad Guayana"] },
  { id: "sector:toro-muerto", queries: ["Toro Muerto, Puerto Ordaz", "Toro Muerto, Ciudad Guayana"] },
  { id: "sector:santa-rosa", queries: ["Santa Rosa, Puerto Ordaz", "Urb. Santa Rosa, Ciudad Guayana"] },
  // Direcciones de negocios
  { id: "biz:calle-ventuari", queries: ["Calle Ventuari, Puerto Ordaz"] },
  { id: "biz:av-guarapiche", queries: ["Avenida Guarapiche, Ciudad Guayana"] },
  { id: "biz:cc-buganvilla", queries: ["Centro Comercial Buganvilla, Puerto Ordaz", "C.C. Buganvilla, Ciudad Guayana"] },
  { id: "biz:cc-caroni-plaza", queries: ["Centro Comercial Caroní Plaza, Puerto Ordaz"] },
  { id: "biz:av-paseo-caroni", queries: ["Avenida Paseo Caroní, Puerto Ordaz"] },
  { id: "biz:calle-el-tablazo", queries: ["Calle El Tablazo, San Félix"] },
  { id: "biz:av-baralt-sf", queries: ["Avenida Baralt, San Félix"] },
  { id: "biz:cc-orinokia", queries: ["Orinokia Mall, Puerto Ordaz", "C.C. Orinokia, Ciudad Guayana"] },
];

const FALLBACK: Record<string, { lat: number; lng: number; est: boolean }> = {
  "sector:core8": { lat: 8.268, lng: -62.743, est: true },
  "sector:gran-sabana": { lat: 8.228, lng: -62.798, est: true },
  "sector:guamo": { lat: 8.284, lng: -62.776, est: true },
  "sector:villa-bahia": { lat: 8.263, lng: -62.732, est: true },
  "sector:rio-negro": { lat: 8.257, lng: -62.745, est: true },
  "sector:minifincas": { lat: 8.253, lng: -62.737, est: true },
  "sector:toro-muerto": { lat: 8.27, lng: -62.726, est: true },
  "sector:santa-rosa": { lat: 8.262, lng: -62.729, est: true },
};

async function geocode(q: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=ve`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) });
    const j = (await res.json()) as { lat?: string; lon?: string; display_name?: string }[];
    if (j?.[0]?.lat && j?.[0]?.lon) return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon), label: (j[0].display_name ?? "").slice(0, 110) };
  } catch {
    /* falla silenciosa */
  }
  return null;
}

async function main() {
  mkdirSync(".cache", { recursive: true });
  const out: Record<string, unknown> = {};
  for (const t of TARGETS) {
    let found: { lat: number; lng: number; label: string } | null = null;
    for (const q of t.queries) {
      found = await geocode(q);
      if (found) {
        console.log(`✓ ${t.id} ← "${q}" → ${found.lat.toFixed(4)},${found.lng.toFixed(4)} | ${found.label}`);
        break;
      }
      await new Promise((r) => setTimeout(r, 1300));
    }
    out[t.id] = found ?? FALLBACK[t.id] ?? null;
    if (!found) console.log(`· ${t.id} → fallback estimado`);
    await new Promise((r) => setTimeout(r, 1300));
  }
  writeFileSync(".cache/zones-geocode.json", JSON.stringify(out, null, 1));
  console.log("\n✅ .cache/zones-geocode.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
