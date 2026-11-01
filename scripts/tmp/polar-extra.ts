import ZAI from 'z-ai-web-dev-sdk';

const QUERIES: [string, string][] = [
  ["agrocan-direc", "Agrocan Guayana Puerto Ordaz telefono direccion petshop"],
  ["hipercaroni-tel", "Hipermercado Caroni Puerto Ordaz telefono Av Atlantico"],
  ["sion-polar", "Sion Pet Shop Puerto Ordaz perrarina SuperCan Champs instagram"],
  ["safari-polar", "Safari Pet Shop Puerto Ordaz perrarina Dogourmet instagram"],
  ["bogux-polar", "Bogux Pet Shop Puerto Ordaz perrarina alimento perros instagram"],
  ["pariaguan-polar", "Agroalimentos Pariaguan Puerto Ordaz SuperCan perrarina"],
  ["huellitas-upata", "Huellitas Shop Upata perrarina alimento mascotas instagram"],
  ["zeus-cbba", "Zeus Pet Ciudad Bolivar perrarina Champs SuperCan instagram"],
  ["perolero-cbba", "El Perolero Ciudad Bolivar alimento mascotas perrarina"],
  ["mascotalandia-polar", "Mascotalandia Puerto Ordaz perrarina SuperCan Champs mercado Unare"],
];

async function main() {
  const zai = await ZAI.create();
  const out: Record<string, { name: string; url: string; snippet: string }[]> = {};
  for (const [key, q] of QUERIES) {
    try {
      const r = await zai.functions.invoke("web_search", { query: q, num: 5 });
      out[key] = r.map((i: any) => ({ name: i.name, url: i.url, snippet: (i.snippet ?? "").slice(0, 240) }));
      console.log(`✓ ${key}: ${r.length} resultados`);
    } catch (e: any) {
      console.log(`✗ ${key}: ${e.message?.slice(0, 80)}`);
      out[key] = [];
    }
    await new Promise((res) => setTimeout(res, 2500));
  }
  const { writeFileSync } = await import("fs");
  writeFileSync("/tmp/polar-extra.json", JSON.stringify(out, null, 2));
  console.log("OK → /tmp/polar-extra.json");
}
main().catch((e) => { console.error(e); process.exit(1); });
