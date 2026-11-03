/**
 * Research Task 34-a: negocios REALES de servicios para mascotas en Maturín, Monagas, VE.
 * Ronda 1: descubrimiento amplio vía web_search (z-ai-web-dev-sdk).
 * Uso: bun scripts/research-maturin.ts  → .cache/maturin-r1.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import ZAI from "z-ai-web-dev-sdk";

const QUERIES: string[] = [
  // Veterinarias
  "veterinaria Maturín Monagas teléfono",
  "clínica veterinaria Maturín dirección",
  "veterinaria 24 horas Maturín Monagas",
  "consultorio veterinario Maturín Monagas",
  "veterinaria Maturín Instagram",
  "site:instagram.com veterinaria Maturín",
  // Petshop / agropecuarias / perrarinas
  "pet shop Maturín Monagas tienda mascotas",
  "perrarinas Maturín",
  "agropecuaria Maturín mascotas alimento",
  "alimento para perros Maturín tienda",
  "tienda de mascotas Maturín Monagas dirección",
  "site:instagram.com petshop Maturín",
  // Grooming
  "peluquería canina Maturín",
  "grooming mascotas Maturín",
  "baño mascotas Maturín peluquería",
  // Candidatos sugeridos (verificar existencia)
  "Veterinaria Los Mangos Maturín",
  "Agropecuaria La Querencia Maturín",
  "Veterinaria Dr. Mata Maturín",
  "Zoo Mascotas Maturín",
  "Veterinaria CaniFresh Maturín",
  "Dog Center Maturín mascotas",
  "Agropecuaria El Demoledor Maturín",
  "AMVET Maturín veterinaria",
  "Mundo Animal Maturín mascotas",
  "Veterinaria Boquerón Maturín",
  "Clinicapet Maturín",
  "Agropecuaria Monagas Maturín mascotas",
  "Tienda Animalia Maturín",
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
        if (r.name && r.url) hits.push({ query: q, name: r.name, url: r.url, snippet: (r.snippet ?? "").slice(0, 450), host: r.host_name ?? "" });
      }
      process.stdout.write(`[${i + 1}/${QUERIES.length}] ${q} → ${res?.length ?? 0}\n`);
    } catch (e) {
      process.stdout.write(`[${i + 1}/${QUERIES.length}] ${q} → ERROR ${(e as Error).message}\n`);
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  writeFileSync(".cache/maturin-r1.json", JSON.stringify(hits, null, 1));
  console.log(`\n✅ ${hits.length} resultados → .cache/maturin-r1.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
