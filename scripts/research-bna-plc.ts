/**
 * Task 34-c: Investigación de negocios de mascotas reales en
 * Barcelona y Puerto La Cruz (Anzoátegui, VE).
 * Uso: bun scripts/research-bna-plc.ts [fase]
 *   fase 1 = búsquedas amplias  → .cache/research-bna-plc-raw.json  (119 hits)
 *   fase 2 = queries dirigidas (followup-bna-plc.ts) → .cache/research-bna-plc-raw2.json (193 hits)
 *   fase 3 = geocodificación Nominatim → .cache/research-bna-plc-geo.json
 *   fase 4 = curación manual de evidencia → .cache/research-bna-plc-final.json == /tmp/research-bna-plc.json
 *            (17 negocios: 8 Barcelona + 9 Puerto La Cruz/Lechería; coords validadas bbox 10.10–10.28 / -64.78..-64.58)
 */
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import ZAI from "z-ai-web-dev-sdk";

interface Hit { query: string; name: string; url: string; snippet: string; host: string }

const QUERIES: string[] = [
  // ---- VETERINARIA ----
  "veterinaria Barcelona Anzoátegui Venezuela",
  "clínica veterinaria Barcelona Anzoátegui teléfono dirección",
  "veterinaria Lechería Anzoátegui",
  "veterinaria 24 horas Puerto La Cruz Anzoátegui",
  "clínica veterinaria Puerto La Cruz Anzoátegui dirección",
  "veterinaria Barcelona Anzoátegui Instagram",
  "site:instagram.com veterinaria Barcelona Anzoátegui",
  "site:instagram.com veterinaria Lechería",
  "veterinaria Diego Bautista Urbaneja Lechería",
  // ---- PETSHOP / AGROPECUARIA ----
  "pet shop Barcelona Anzoátegui",
  "perrarinas Barcelona Anzoátegui",
  "agropecuaria Barcelona Anzoátegui mascotas alimento",
  "pet shop Puerto La Cruz Anzoátegui",
  "alimento para perros Puerto La Cruz Anzoátegui tienda",
  "site:instagram.com petshop Barcelona Anzoátegui",
  "agropecuaria Puerto La Cruz perrarinas mascotas",
  // ---- GROOMING ----
  "peluquería canina Barcelona Anzoátegui",
  "grooming Lechería Anzoátegui mascotas",
  "estética canina Puerto La Cruz Anzoátegui",
  "spa mascotas Puerto La Cruz Lechería",
  // ---- SUGERIDOS A VERIFICAR ----
  "Veterinaria Los Caobos Barcelona Anzoátegui",
  "Clínica Veterinaria Anzoátegui Barcelona dirección",
  "Veterinaria Cachamay Barcelona Anzoátegui",
  "Agropecuaria La Pastora Barcelona Anzoátegui",
  "Mi Vete Barcelona Anzoátegui veterinaria",
  "Centro Veterinario Lechería Anzoátegui",
  "Pet Center Lechería Anzoátegui",
  "veterinaria Dr. Villarroel Barcelona Anzoátegui",
  "Caniches Barcelona Anzoátegui peluquería",
  "Estética Canina Patitas Barcelona Anzoátegui",
  "Agropecuaria Bergantín Anzoátegui",
  "VeteCuba Barcelona Anzoátegui veterinaria",
  "ZooVet Barcelona Anzoátegui",
  "Veterinaria El Cardón Puerto La Cruz",
  // ---- EXTRAS ÁREA METROPOLITANA ----
  "veterinaria Tronconal Barcelona Anzoátegui",
  "veterinaria El Cerrito Lechería Anzoátegui",
  "veterinaria Guaraguao Puerto La Cruz",
  "veterinaria Posuelos Lechería Anzoátegui",
];

async function main() {
  mkdirSync(".cache", { recursive: true });
  const zai = await ZAI.create();
  const hits: Hit[] = [];
  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i];
    try {
      const res = (await zai.functions.invoke("web_search", { query: q, num: 8 })) as { name?: string; url?: string; snippet?: string; host_name?: string }[];
      for (const r of res ?? []) {
        if (r.name && r.url) hits.push({ query: q, name: r.name, url: r.url, snippet: (r.snippet ?? "").slice(0, 450), host: r.host_name ?? "" });
      }
      process.stdout.write(`[${i + 1}/${QUERIES.length}] ${q} → ${res?.length ?? 0}\n`);
    } catch {
      process.stdout.write(`[${i + 1}/${QUERIES.length}] ${q} → ERR\n`);
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  writeFileSync(".cache/research-bna-plc-raw.json", JSON.stringify(hits, null, 1));
  appendFileSync("/tmp/research-bna-plc-log.txt", `\n=== FASE 1 ${new Date().toISOString()} — ${hits.length} hits ===\n`);
  console.log(`\n✅ ${hits.length} resultados → .cache/research-bna-plc-raw.json`);
}

main();
