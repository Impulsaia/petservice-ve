/**
 * Investigación El Tigre - Ronda 2: seguimiento por candidato + reintentos ronda 1.
 * Uso: bun scripts/research-eltigre-r2.ts → .cache/eltigre-round2.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import ZAI from "z-ai-web-dev-sdk";

const QUERIES: string[] = [
  // Reintentos ronda 1 (fallaron por 429)
  "Pelú Dogs El Tigre peluquería canina",
  "Veterinaria San José El Tigrito San José de Guanipa",
  "Agropecuaria Máximo El Tigre dirección",
  "Mi Mascota El Tigre veterinaria pet shop",
  // Seguimiento por candidato
  "Multimascotas Oriente El Tigre pet shop dirección teléfono",
  "grupoveterinariomultisalud veterinaria El Tigre",
  "Clínica Veterinaria Dr. Efraín Mejías El Tigre Pueblo Nuevo",
  "Elitepitbulls El Tigre veterinaria facebook instagram",
  "Animal Global El Tigrito consultorio veterinario teléfono",
  "Medidog consultorio veterinario El Tigrito teléfono",
  "Dog House veterinaria El Tigrito San José de Guanipa horario",
  "Agrobrasil San José de Guanipa perrarina mascotas productos",
  "Tiendas Damasco El Tigre qué venden",
  "La Granja vzla El Tigre perrarina minimarket dirección",
  "Agroveterinaria Oriente C.A El Tigre dirección sede",
  "Nossa Agro El Tigre horario dirección perrarinas",
  "Happy Dogs El Tigre peluquería canina dirección",
  "Mascota Vets El Tigre dirección teléfono veterinaria",
  "Peluditos Grooming El Tigre instagram teléfono",
  "Mascolove estética canina El Tigrito dirección teléfono",
  "Mascotas Knitas El Tigre pet shop dirección teléfono",
  "VetNorte El Tigre veterinaria dirección teléfono",
  "Mascotas San Lazaro El Tigre veterinaria dirección",
  "Agropecuaria Europa El Tigre dirección tienda",
  "Agro Total C.A El Tigre agropecuaria sucursal dirección",
  "SuperCan Dogourmet perrarina El Tigre tienda",
  "veterinaria El Tigre infoguia clínicas",
  "Centro Clínico Veterinario El Tigre carrera calle dirección",
];

interface Hit { query: string; name: string; url: string; snippet: string; host: string }

async function invokeWithRetry(zai: Awaited<ReturnType<typeof ZAI.create>>, q: string, num: number): Promise<any[] | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return (await zai.functions.invoke("web_search", { query: q, num })) as any[];
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("429")) {
        await new Promise((r) => setTimeout(r, 12000 * attempt));
        continue;
      }
      throw e;
    }
  }
  return null;
}

async function main() {
  mkdirSync(".cache", { recursive: true });
  const zai = await ZAI.create();
  const hits: Hit[] = [];
  for (let i = 0; i < QUERIES.length; i++) {
    const q = QUERIES[i];
    try {
      const res = await invokeWithRetry(zai, q, 7);
      for (const r of res ?? []) {
        if (r.name && r.url) hits.push({ query: q, name: r.name, url: r.url, snippet: (r.snippet ?? "").slice(0, 500), host: r.host_name ?? "" });
      }
      process.stdout.write(`[${i + 1}/${QUERIES.length}] → ${res?.length ?? 0}\n`);
    } catch {
      process.stdout.write(`[${i + 1}/${QUERIES.length}] → ERR\n`);
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  writeFileSync(".cache/eltigre-round2.json", JSON.stringify(hits, null, 1));
  console.log(`✅ ${hits.length} resultados → .cache/eltigre-round2.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
