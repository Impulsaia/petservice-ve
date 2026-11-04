// research-eltigre.ts — Búsqueda de negocios de servicios para mascotas en El Tigre / San José de Guanipa (Anzoátegui, VE)
// Uso: bun scripts/research-eltigre.ts              -> ejecuta QUERIES base
//      bun scripts/research-eltigre.ts "q1" "q2"   -> ejecuta queries de seguimiento pasadas por argv
import { writeFileSync } from "node:fs";
import ZAI from "z-ai-web-dev-sdk";

const BASE_QUERIES = [
  "veterinaria El Tigre Anzoátegui teléfono",
  "clínica veterinaria El Tigre Venezuela dirección",
  "veterinaria San José de Guanipa teléfono",
  "pet shop El Tigre Anzoátegui",
  "agropecuaria El Tigre mascotas perrarinas",
  "peluquería canina El Tigre",
  "grooming mascotas El Tigre",
  "veterinaria 24 horas El Tigre",
  "alimento para perros El Tigre tienda",
  "site:instagram.com veterinaria El Tigre",
  "site:instagram.com petshop El Tigre",
  "facebook veterinaria El Tigre Anzoátegui",
  "veterinaria El Tigre cylex.ve",
  "veterinaria El Tigrito Anzoátegui",
  "clinicaveterinaria El Tigre Anzoátegui paginasamarillas",
  "tienda de mascotas El Tigre Anzoátegui dirección",
];

const queries = process.argv.slice(2).length > 0 ? process.argv.slice(2) : BASE_QUERIES;
const zai = await ZAI.create();
const all: Record<string, { name?: string; url?: string; snippet?: string; host_name?: string }[]> = {};

for (const q of queries) {
  try {
    const res = (await zai.functions.invoke("web_search", { query: q, num: 8 })) as {
      name?: string; url?: string; snippet?: string; host_name?: string;
    }[];
    all[q] = res;
    console.log(`OK (${res.length}) ${q}`);
  } catch (e: any) {
    all[q] = [];
    console.log(`FAIL ${q} :: ${e?.message ?? e}`);
  }
  await new Promise((r) => setTimeout(r, 700));
}

const tag = process.argv.slice(2).length > 0 ? "followup" : "base";
writeFileSync(`/tmp/eltigre-raw-${tag}.json`, JSON.stringify(all, null, 2));
console.log(`\nGuardado: /tmp/eltigre-raw-${tag}.json — queries: ${queries.length}`);
