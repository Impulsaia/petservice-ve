/**
 * Investigación de negocios reales de mascotas en zonas específicas de Puerto Ordaz
 * (Core 8, Gran Sabana, Guamo, Villa Bahía, Río Negro, Minifincas, Toro Muerto),
 * aledañas de San Félix y Ciudad Bolívar. Fuente: SDK web_search (z-ai-web-dev-sdk).
 * Uso: bun scripts/research-zone-providers.ts  → .cache/zones-research.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import ZAI from "z-ai-web-dev-sdk";

const PZO_SECTORS = ["Core 8", "Gran Sabana", "Guamo", "Villa Bahía", "Río Negro", "Minifincas", "Toro Muerto"];

const QUERIES: string[] = [
  // Puerto Ordaz — sectores pedidos
  ...PZO_SECTORS.flatMap((s) => [`veterinaria "${s}" Puerto Ordaz teléfono`, `peluquería canina mascotas "${s}" Puerto Ordaz`]),
  // Aledañas PZO (Unare, Villa América, Los Mangos, Santa Rosa, El Peñón…)
  "veterinaria Unare Puerto Ordaz teléfono",
  "veterinaria Santa Rosa Puerto Ordaz teléfono",
  "veterinaria El Peñón Puerto Ordaz teléfono",
  "veterinaria 23 de Enero Puerto Ordaz teléfono",
  "pet shop tienda mascotas Unare Toro Muerto Puerto Ordaz",
  // San Félix y aledañas
  "veterinaria San Félix Ciudad Guayana teléfono dirección",
  "peluquería canina San Félix Ciudad Guayana",
  "tienda de mascotas San Félix Ciudad Guayana teléfono",
  "veterinaria Gran Sabana San Félix",
  "veterinaria Los Olivos San Félix teléfono",
  "veterinaria Las Américas San Félix teléfono",
  "veterinaria Villa Española San Félix",
  "veterinaria 11 de Abril San Félix teléfono",
  // Ciudad Bolívar y aledañas
  "veterinaria Ciudad Bolívar teléfono dirección",
  "peluquería canina Ciudad Bolívar teléfono",
  "tienda de mascotas Ciudad Bolívar teléfono",
  "veterinaria Vista Hermosa Ciudad Bolívar",
  "veterinaria La Sabanita Ciudad Bolívar teléfono",
  "veterinaria Coromoto Ciudad Bolívar",
  // Barridos generales con teléfonos (para aledañas que se escapen)
  "veterinarias Puerto Ordaz listado teléfonos guayana",
  "clinica veterinaria Puerto Ordaz Instagram",
];

interface Hit { query: string; name: string; url: string; snippet: string; host: string }

async function main() {
  mkdirSync(".cache", { recursive: true });
  const zai = await ZAI.create();
  const hits: Hit[] = [];
  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i];
    try {
      const res = (await zai.functions.invoke("web_search", { query: q, num: 8 })) as { name?: string; url?: string; snippet?: string; host_name?: string }[];
      for (const r of res ?? []) {
        if (r.name && r.url) hits.push({ query: q, name: r.name, url: r.url, snippet: (r.snippet ?? "").slice(0, 400), host: r.host_name ?? "" });
      }
      process.stdout.write(`[${i + 1}/${QUERIES.length}] ${q} → ${res?.length ?? 0}\n`);
    } catch (e) {
      process.stdout.write(`[${i + 1}/${QUERIES.length}] ${q} → ERROR ${(e as Error).message}\n`);
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  writeFileSync(".cache/zones-research.json", JSON.stringify(hits, null, 1));
  console.log(`\n✅ ${hits.length} resultados → .cache/zones-research.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
