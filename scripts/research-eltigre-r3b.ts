/**
 * Ronda 3b (v2): verificaciones pendientes, escritura incremental + reintentos.
 * Uso: bun scripts/research-eltigre-r3b.ts → .cache/eltigre-round3b.json
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import ZAI from "z-ai-web-dev-sdk";

const QUERIES: string[] = [
  "Danas Kennel El Tigre veterinaria Pueblo Nuevo",
  "Zoo Mundo El Tigre mascotas tienda",
  "Agro Total El Tigre alimento mascotas perrarina",
  "Agropecuaria Europa El Tigre mascotas alimento perros",
  "Avícola Sabana Libre El Tigrito mascotas perrarina",
  "veterinario Marco Cerrada El Tigre",
  "Pelú Dogs El Tigre peluquería canina",
  "Tarjeta Soy Tigre mascotas pet shop veterinaria municipio",
  "Multimascotas Oriente El Tigre perrarina alimento perros",
  "Mascotas Knitas El Tigre perrarina alimento",
  "Nossa Agro El Tigre mascotas perrarina perros",
  "Agrobrasil El Tigrito alimento mascotas perros",
];
const OUT = ".cache/eltigre-round3b.json";
interface Hit { query: string; name: string; url: string; snippet: string; host: string }

function load(): Hit[] { try { return JSON.parse(readFileSync(OUT, "utf8")); } catch { return []; } }
function save(h: Hit[]) { writeFileSync(OUT, JSON.stringify(h, null, 1)); }

async function main() {
  mkdirSync(".cache", { recursive: true });
  const zai = await ZAI.create();
  let hits = load();
  const done = new Set(hits.map((h) => h.query));
  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i];
    if (done.has(q)) { process.stdout.write(`skip ${q}\n`); continue; }
    let ok = 0;
    for (let a = 1; a <= 3; a++) {
      try {
        const res = (await zai.functions.invoke("web_search", { query: q, num: 7 })) as any[];
        for (const r of res ?? []) if (r.name && r.url) hits.push({ query: q, name: r.name, url: r.url, snippet: (r.snippet ?? "").slice(0, 500), host: r.host_name ?? "" });
        ok = res?.length ?? 0; save(hits); break;
      } catch (e: any) {
        const m = String(e?.message ?? e);
        if (m.includes("429")) { await new Promise((r) => setTimeout(r, 15000 * a)); continue; }
        break;
      }
    }
    process.stdout.write(`[${i + 1}/${QUERIES.length}] ${q.slice(0, 40)} → ${ok}\n`);
    await new Promise((r) => setTimeout(r, 6000));
  }
  console.log(`✅ total ${hits.length} hits`);
}
main().catch((e) => { console.error(e); process.exit(1); });
