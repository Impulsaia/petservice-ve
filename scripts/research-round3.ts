/**
 * Ronda 3: cerrar teléfonos/direcciones de candidatos restantes.
 * Uso: bun scripts/research-round3.ts → .cache/zones-round3.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import ZAI from "z-ai-web-dev-sdk";

const QUERIES: string[] = [
  "Hospital Veterinario Santa Rosa Guayana Puerto Ordaz Instagram veterinario",
  "Coquetitos Pet Shop Puerto Ordaz dirección teléfono",
  "Veterinaria Mi Favorita Puerto Ordaz ubicación teléfono",
  "Guayana Pets tienda mascotas Puerto Ordaz ubicación",
  "Crazy Pets Puerto Ordaz mascotas dirección",
  "Clínica Veterinaria Caroni Ciudad Guayana teléfono dirección cylex",
  "Kaninos tienda de mascotas Puerto Ordaz dirección",
  "Las Teodokildas Ciudad Guayana veterinaria dirección",
  "CEV Clínica Especialidades Veterinarias Puerto Ordaz Instagram ubicación",
  "Mascotisima C.A Ciudad Bolívar Venezuela horario",
  "Dogspital Puerto Ordaz ubicación dirección calle",
  "Paticas pet shop Ciudad Guayana dirección calle",
  "Perolero San Félix Puerto Ordaz sede dirección",
  "veterinaria MiniFincas Unare Puerto Ordaz",
  "Agro Avícola Chirica San Félix teléfono dirección",
  "Consultorio Mascotas Felices Ciudad Guayana dirección",
  "tienda de mascotas Villa Bahía Toro Muerto Puerto Ordaz",
  "veterinaria Santa Rosa Puerto Ordaz Unare teléfono",
];

interface Hit { query: string; name: string; url: string; snippet: string; host: string }

async function main() {
  mkdirSync(".cache", { recursive: true });
  const zai = await ZAI.create();
  const hits: Hit[] = [];
  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i];
    try {
      const res = (await zai.functions.invoke("web_search", { query: q, num: 7 })) as { name?: string; url?: string; snippet?: string; host_name?: string }[];
      for (const r of res ?? []) {
        if (r.name && r.url) hits.push({ query: q, name: r.name, url: r.url, snippet: (r.snippet ?? "").slice(0, 500), host: r.host_name ?? "" });
      }
      process.stdout.write(`[${i + 1}/${QUERIES.length}] → ${res?.length ?? 0}\n`);
    } catch {
      process.stdout.write(`[${i + 1}/${QUERIES.length}] → ERR\n`);
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  writeFileSync(".cache/zones-round3.json", JSON.stringify(hits, null, 1));
  console.log(`✅ ${hits.length} resultados`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
