/**
 * Ronda 2: seguimiento de candidatos reales → teléfonos, direcciones, zonas.
 * Uso: bun scripts/research-followup.ts → .cache/zones-followup.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import ZAI from "z-ai-web-dev-sdk";

const QUERIES: string[] = [
  "DOGSPITAL clínica veterinaria Puerto Ordaz dirección ubicación",
  "El Perolero Core 8 Puerto Ordaz productos mascotas teléfono",
  "El Perolero Ciudad Bolívar teléfono dirección",
  "peluquería grooming Minifincas Unare Puerto Ordaz 0424",
  "Hospital Veterinario Santa Rosa Puerto Ordaz dirección teléfono",
  "Agropeluquería N.R. San Félix dirección",
  "Paticas PetShop estética mascotas Ciudad Guayana dirección",
  "Guayana Pets tienda de mascotas ubicación Puerto Ordaz",
  "Clínica Veterinaria San Félix sanfelixvet teléfono",
  "Centro Veterinario San Félix Facebook teléfono",
  "Clínica de Especialidades Veterinarias CEV Puerto Ordaz dirección",
  "Healthy Pets veterinaria Las Américas San Félix",
  "Pets y Vet veterinaria San Félix dirección",
  "Mascotísima C.A Ciudad Bolívar teléfono dirección",
  "Clínica Veterinaria Caroní Puerto Ordaz teléfono",
  "Colitas Pet House Puerto Ordaz grooming",
  "Pelucanina Puerto Ordaz peluquería canina",
  "Kninos y Felinos mascotas Ciudad Guayana dirección",
  "veterinaria Las Teodokildas Ciudad Guayana",
  "Clínica Veterinaria Los Olivos Ciudad Guayana dirección",
  "urb Gran Sabana Ciudad Guayana sector",
  "sector Río Negro Puerto Ordaz ubicación",
  "veterinaria Villa Bahía Puerto Ordaz",
  "veterinaria Core 8 Unare Puerto Ordaz",
  "veterinaria Toro Muerto Puerto Ordaz",
  "veterinaria El Guamo Puerto Ordaz",
  "veterinaria Río Negro Puerto Ordaz mascotas",
  "tienda mascotas Toro Muerto Puerto Ordaz Instagram",
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
        if (r.name && r.url) hits.push({ query: q, name: r.name, url: r.url, snippet: (r.snippet ?? "").slice(0, 500), host: r.host_name ?? "" });
      }
      process.stdout.write(`[${i + 1}/${QUERIES.length}] ${q} → ${res?.length ?? 0}\n`);
    } catch (e) {
      process.stdout.write(`[${i + 1}/${QUERIES.length}] ${q} → ERR\n`);
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  writeFileSync(".cache/zones-followup.json", JSON.stringify(hits, null, 1));
  console.log(`\n✅ ${hits.length} resultados → .cache/zones-followup.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
