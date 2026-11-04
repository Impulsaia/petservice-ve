/**
 * Investigación El Tigre - Ronda 3: directorios (page_reader) + casos ambiguos.
 * Uso: bun scripts/research-eltigre-r3.ts → .cache/eltigre-round3.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import ZAI from "z-ai-web-dev-sdk";

const SEARCHES: string[] = [
  "Zoo Mundo El Tigre mascotas tienda",
  "Multisalud veterinaria El Tigre Anzoátegui sucursal",
  "Agro Total El Tigre perrarina mascotas alimento",
  "Agropecuaria Europa El Tigrito perrarina mascotas",
  "Avícola Sabana Libre El Tigrito perrarina alimento mascotas",
  "Marco Cerrada veterinario El Tigre consultorio",
  "Pelú Dogs El Tigre",
  "veterinaria El Tigrito instagram consultorio",
  "Mascotitas Veterinaria El Tigre tarjeta soy tigre",
  "veterinaria El Tigre horario atención dirección",
];

const PAGES: string[] = [
  "https://infoguia.com/ct.asp?key=medicos-veterinarios-clinicas-veterinarias-el-tigre&cat=139&ciud=230",
  "https://todainfo.com/region/el-tigrito-san-jose-de-guanipa-anzoategui",
  "https://www.cylex.com.ve/el+tigre/cl%C3%ADnica+veterinaria+dr.+humberto+a%C3%B1ez+g-11149110.html",
  "https://todainfo.com/directorio/multimascotas-oriente",
  "https://www.agrobrasil.com.ve",
];

interface SearchHit { query: string; name: string; url: string; snippet: string; host: string }

async function main() {
  mkdirSync(".cache", { recursive: true });
  const zai = await ZAI.create();
  const out: { searches: SearchHit[]; pages: { url: string; ok: boolean; text: string }[] } = { searches: [], pages: [] };

  for (let i = 0; i < SEARCHES.length; i++) {
    const q = SEARCHES[i];
    try {
      const res = (await zai.functions.invoke("web_search", { query: q, num: 7 })) as any[];
      for (const r of res ?? []) if (r.name && r.url) out.searches.push({ query: q, name: r.name, url: r.url, snippet: (r.snippet ?? "").slice(0, 500), host: r.host_name ?? "" });
      process.stdout.write(`S[${i + 1}/${SEARCHES.length}] → ${res?.length ?? 0}\n`);
    } catch { process.stdout.write(`S[${i + 1}] → ERR\n`); }
    await new Promise((r) => setTimeout(r, 1200));
  }

  for (let i = 0; i < PAGES.length; i++) {
    const url = PAGES[i];
    try {
      const res = (await zai.functions.invoke("page_reader", { url })) as any;
      const text = typeof res === "string" ? res : (res?.text ?? res?.content ?? JSON.stringify(res)).toString();
      out.pages.push({ url, ok: true, text: String(text).slice(0, 20000) });
      process.stdout.write(`P[${i + 1}/${PAGES.length}] → OK ${String(text).length} chars\n`);
    } catch (e: any) {
      out.pages.push({ url, ok: false, text: String(e?.message ?? e).slice(0, 300) });
      process.stdout.write(`P[${i + 1}] → ERR\n`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  writeFileSync(".cache/eltigre-round3.json", JSON.stringify(out, null, 1));
  console.log(`✅ ${out.searches.length} search hits, ${out.pages.length} páginas`);
}

main().catch((e) => { console.error(e); process.exit(1); });
