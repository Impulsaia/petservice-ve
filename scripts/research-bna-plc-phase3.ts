/**
 * Task 34-c — Fase 3: page_reader sobre directorios + geocodificación Nominatim.
 * Uso: bun scripts/research-bna-plc-phase3.ts
 */
import { writeFileSync } from "node:fs";

const PAGES: { key: string; url: string }[] = [
  { key: "agromedica-todainfo", url: "https://todainfo.com/directorio/agromedica-veterinaria-c-a" },
  { key: "mascotascristal-alcastars", url: "https://www.alcastars.com.ve/anzoategui/barcelona/clinica-veterinaria-mascotas-cristal" },
  { key: "kotas-todainfo", url: "https://todainfo.com/directorio/clinica-veterinaria-kotas" },
  { key: "superpets-alcastars", url: "https://www.alcastars.com.ve/anzoategui/lecheria/super-pets" },
  { key: "fauna-todainfo", url: "https://todainfo.com/directorio/fauna-anzoategui-c-a" },
  { key: "medimascotas-alcastars", url: "https://www.alcastars.com.do/anzoategui/barcelona/medimascotas" },
  { key: "vitapet-ventanal", url: "https://ventanal.app/barcelona/animales-y-mascotas/vita-pet-ca" },
  { key: "perla-ventanal", url: "https://ventanal.app/lecheria/animales-y-mascotas/clinica-veterinaria-perla-spa-shop-ca" },
  { key: "groomingtime-ventanal", url: "https://ventanal.app/lecheria/animales-y-mascotas/grooming-time-peluqueria-canina-y-tienda-de-mascotas" },
  { key: "petmania-ventanal", url: "https://ventanal.app/barcelona/animales-y-mascotas/petmania-vet-and-shop" },
];

// Direcciones a geocodificar (solo negocios con dirección verificada)
const GEO: { key: string; q: string }[] = [
  { key: "vitapet", q: "Avenida Domingo Guzmán Lander, Colinas del Neveri, Barcelona, Anzoátegui" },
  { key: "reino_mascotas", q: "Avenida Principal Fundación Mendoza, Barcelona, Anzoátegui" },
  { key: "petmania", q: "Casa Grande Center, Nueva Barcelona, Barcelona, Anzoátegui" },
  { key: "vetersalud", q: "Avenida Principal Boyacá, Barcelona, Anzoátegui" },
  { key: "agropdk", q: "Avenida Principal Los Mesones, Barcelona, Anzoátegui" },
  { key: "sabana_libre", q: "Avenida Costanera, Barcelona, Anzoátegui" },
  { key: "medimascotas", q: "Avenida Domingo Guzmán Lander, Barcelona, Anzoátegui" },
  { key: "perla", q: "Avenida Diego Bautista Urbaneja, Lechería, Anzoátegui" },
  { key: "perrogato", q: "Urbanización Río Viejo, Lechería, Anzoátegui" },
  { key: "groomingtime", q: "Urbanización Río Viejo, Lechería, Anzoátegui" },
  { key: "superpets", q: "Avenida Diego Bautista Urbaneja, Lechería, Anzoátegui" },
];

const UA = "PetServiceVE-Research/1.0 (marketplace data collection; contact: research@petservice.example)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readPages(zai: any) {
  const out: Record<string, { title?: string; text?: string; error?: string }> = {};
  for (const p of PAGES) {
    try {
      const res = (await zai.functions.invoke("page_reader", { url: p.url })) as any;
      out[p.key] = { title: res?.title ?? "", text: (res?.text ?? res?.content ?? "").slice(0, 2500) };
      console.log(`READ OK ${p.key}: ${(out[p.key].text ?? "").length} chars`);
    } catch (e: any) {
      out[p.key] = { error: String(e?.message ?? e).slice(0, 120) };
      console.log(`READ FAIL ${p.key}: ${out[p.key].error}`);
    }
    await sleep(1200);
  }
  return out;
}

function inMetro(lat: number, lng: number): boolean {
  return lat >= 10.10 && lat <= 10.28 && lng >= -64.78 && lng <= -64.58;
}

async function geocodeAll() {
  const out: Record<string, { q: string; lat: number | null; lng: number | null; display: string | null }> = {};
  for (const g of GEO) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(g.q)}&format=json&limit=1&countrycodes=ve`;
      const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "es" } });
      const js: any[] = await res.json();
      if (js && js.length > 0) {
        const lat = parseFloat(js[0].lat), lng = parseFloat(js[0].lon);
        out[g.key] = { q: g.q, lat: inMetro(lat, lng) ? lat : null, lng: inMetro(lat, lng) ? lng : null, display: js[0].display_name ?? null };
        console.log(`GEO ${g.key}: ${lat},${lng} ${inMetro(lat, lng) ? "OK" : "FUERA-AREA"} → ${String(js[0].display_name).slice(0, 90)}`);
      } else {
        out[g.key] = { q: g.q, lat: null, lng: null, display: null };
        console.log(`GEO ${g.key}: SIN RESULTADO`);
      }
    } catch (e: any) {
      out[g.key] = { q: g.q, lat: null, lng: null, display: null };
      console.log(`GEO ${g.key}: ERR ${String(e?.message ?? e).slice(0, 80)}`);
    }
    await sleep(1100);
  }
  return out;
}

async function main() {
  const zai = await (await import("z-ai-web-dev-sdk")).default.create();
  const pages = await readPages(zai);
  writeFileSync(".cache/research-bna-plc-pages.json", JSON.stringify(pages, null, 1));
  const geo = await geocodeAll();
  writeFileSync(".cache/research-bna-plc-geo.json", JSON.stringify(geo, null, 1));
  console.log("\n✅ fases 3 completadas");
}

main();
