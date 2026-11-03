/**
 * Task 34-c — Fase 2: queries dirigidas por candidato + grooming + polar brands.
 * Uso: bun scripts/research-bna-plc-phase2.ts
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import ZAI from "z-ai-web-dev-sdk";

interface Hit { query: string; name: string; url: string; snippet: string; host: string }

const QUERIES: string[] = [
  // identificar / completar candidatos
  "Vita Pet veterinaria Barcelona Anzoátegui dirección teléfono",
  "Agromédica Veterinaria C.A. Barcelona Anzoátegui dirección teléfono",
  "Medimascotas C.A. Barcelona Avenida Guzmán Lander mascotas",
  "Reino Mascotas Barcelona Fundación Mendoza veterinaria teléfono",
  "Vetersalud veterinaria Barcelona Boyacá teléfono",
  "Petmania Vet Shop Barcelona Casa Grande teléfono horario",
  "Perla Spa Shop clínica veterinaria Lechería teléfono",
  "Clínica Veterinaria Dr. Perrogato Lechería dirección",
  "Doctor Vet Lechería Rigoberto Arellán veterinaria domicilio",
  "Mascotas Cristal veterinaria Anzoátegui 24 horas dirección",
  "clínica veterinaria Sábana Libre Barcelona Av. Costanera",
  "Clínica Veterinaria +Kotas Puerto La Cruz dirección teléfono",
  "Fauna Anzoátegui Puerto La Cruz tienda mascotas dirección",
  "Full Agro Puerto La Cruz mascotas dirección teléfono",
  "veterinaria C.C. La Isla Chuparín Puerto La Cruz teléfono",
  "veterinaria sector El Pensil Puerto La Cruz teléfono",
  "Super Pets Lechería Avenida Anzoátegui veterinaria dirección",
  "Hospital Veterinario Lechería Anzoátegui dirección teléfono",
  "clínica veterinaria La Candelaria Lechería Avenida Diego Bautista Urbaneja",
  // grooming (ronda 1 falló por 429)
  "peluquería canina Barcelona Anzoátegui Instagram",
  "peluquería canina grooming Lechería Anzoátegui",
  "estética canina Puerto La Cruz Anzoátegui Instagram",
  "spa peluquería mascotas Puerto La Cruz dirección",
  "estética canina Nueva Barcelona Lechería grooming",
  // petshop extras
  "Pets Planet Puerto La Cruz Lechería tienda mascotas",
  "perrarina Champ's delivery 0281-2697212 Puerto La Cruz",
  "SuperCan Dogourmet tienda Barcelona Anzoátegui mascotas",
  "tienda mascotas Avenida Intercomunal Barcelona Anzoátegui",
  "Comercial Agrario Mi Fauna JC Barcelona mascotas",
  "veterinaria Bergantín Barcelona Anzoátegui",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OUT = ".cache/research-bna-plc-raw2.json";

function loadHits(): Hit[] {
  try {
    if (existsSync(OUT)) return JSON.parse(readFileSync(OUT, "utf8"));
  } catch {}
  return [];
}

function save(hits: Hit[]) {
  writeFileSync(OUT, JSON.stringify(hits, null, 1));
}

async function searchWithRetry(zai: any, q: string, tries = 3): Promise<any[] | null> {
  let delay = 5000;
  for (let t = 0; t < tries; t++) {
    try {
      return (await zai.functions.invoke("web_search", { query: q, num: 8 })) ?? [];
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("429")) {
        process.stdout.write(`  429 → reintento en ${delay / 1000}s\n`);
        await sleep(delay);
        delay = Math.min(delay * 2, 20000);
      } else {
        process.stdout.write(`  ERR: ${msg.slice(0, 80)}\n`);
        return null;
      }
    }
  }
  return null;
}

async function main() {
  mkdirSync(".cache", { recursive: true });
  const zai = await ZAI.create();
  const hits = loadHits();
  const done = new Set(hits.map((h) => h.query));
  console.log(`reanudando: ${hits.length} hits previos, ${done.size} queries hechas`);
  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i];
    if (done.has(q)) { console.log(`[skip] ${q}`); continue; }
    const res = await searchWithRetry(zai, q);
    if (res) {
      for (const r of res) {
        if (r.name && r.url) hits.push({ query: q, name: r.name, url: r.url, snippet: (r.snippet ?? "").slice(0, 450), host: r.host_name ?? "" });
      }
      process.stdout.write(`[${i + 1}/${QUERIES.length}] ${q} → ${res.length}\n`);
    } else {
      process.stdout.write(`[${i + 1}/${QUERIES.length}] ${q} → FAIL\n`);
    }
    save(hits);
    await sleep(1500);
  }
  console.log(`\n✅ ${hits.length} resultados → ${OUT}`);
}

main();
