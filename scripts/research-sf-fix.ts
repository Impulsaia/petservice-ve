/**
 * Búsqueda focalizada: Plus Codes / direcciones exactas para negocios de
 * San Félix con coordenadas sospechosas (lado oeste del Caroní).
 * Uso: bun scripts/research-sf-fix.ts → .cache/sf-fix.json
 */
import { writeFileSync } from "node:fs";
import ZAI from "z-ai-web-dev-sdk";

const TARGETS: { id: string; name: string; queries: string[] }[] = [
  {
    id: "ga-experiencias",
    name: "G-A Experiencias Animales",
    queries: ['"G-A Experiencias Animales" San Félix dirección', '"Experiencias Animales" veterinaria San Félix Bolívar'],
  },
  {
    id: "perolero-sf",
    name: "El Perolero San Félix",
    queries: ['"El Perolero" San Félix dirección mascotas', 'Perolero San Félix dirección acuario'],
  },
  {
    id: "mascotas-felices",
    name: "Consultorio Veterinario Mascotas Felices",
    queries: ['"Mascotas Felices" veterinaria "San Félix" dirección', '"Mascotas Felices" C.A. veterinaria San Félix Bolívar'],
  },
  {
    id: "los-olivos-sf",
    name: "Clínica Veterinaria Los Olivos (SF)",
    queries: ['"Clínica Veterinaria Los Olivos" "San Félix"', '"Los Olivos" veterinaria San Félix Bolívar dirección'],
  },
  {
    id: "kawi",
    name: "Agropecuaria Kawi",
    queries: ['"Agropecuaria Kawi" San Félix dirección', 'Kawi agropecuaria Puerto Ordaz San Félix'],
  },
  {
    id: "gobey",
    name: "Agropecuaria Gobey",
    queries: ['"Agropecuaria Gobey" San Félix dirección', 'Gobey agropecuaria Bolívar'],
  },
  {
    id: "teodokildas",
    name: "Clínica Veterinaria Las Teodokildas",
    queries: ['"Teodokildas" veterinaria dirección', '"Las Teodokildas" San Félix'],
  },
  {
    id: "chirica",
    name: "Agro Avícola Chirica",
    queries: ['"Agro Avícola Chirica" dirección', 'Agroavícola Chirica San Félix Puerto Ordaz'],
  },
];

const PLUS_RE = /\b[23456789CFGHJMPQRVWX]{4}\s*\+\s*[23456789CFGHJMPQRVWX]{2,3}\b/;

async function main() {
  const zai = await (ZAI as unknown as { create: () => Promise<{ functions: { invoke: (n: string, p: object) => Promise<Array<{ name: string; url: string; snippet: string }>> } }> }).create();
  const out: Record<string, { name: string; plusCodes: string[]; hints: string[] }> = {};
  for (const t of TARGETS) {
    out[t.id] = { name: t.name, plusCodes: [], hints: [] };
    for (const q of t.queries) {
      try {
        const results = await zai.functions.invoke("web_search", { query: q, num: 10 });
        for (const r of results ?? []) {
          const text = `${r.name ?? ""} ${r.snippet ?? ""}`;
          const m = text.match(PLUS_RE);
          if (m && !out[t.id].plusCodes.includes(m[0].replace(/\s/g, ""))) {
            out[t.id].plusCodes.push(m[0].replace(/\s/g, ""));
            out[t.id].hints.push(`[${q}] ${r.url} → ${text.slice(0, 160).replace(/\n/g, " ")}`);
          } else if (/direcc|calle|avenida|av\.|sector|zona/i.test(text) && /san f[eé]lix|puerto ordaz/i.test(text)) {
            out[t.id].hints.push(`[${q}] ${r.url} → ${text.slice(0, 160).replace(/\n/g, " ")}`);
          }
        }
      } catch (e) {
        console.error(`✗ ${q}:`, (e as Error).message);
      }
    }
    console.log(`${t.name}: ${out[t.id].plusCodes.length} plus codes, ${out[t.id].hints.length} hints`);
  }
  writeFileSync(".cache/sf-fix.json", JSON.stringify(out, null, 2));
  console.log("→ .cache/sf-fix.json");
}
main();
