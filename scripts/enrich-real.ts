/**
 * PetService VE — Enriquecimiento de negocios reales vía búsqueda web (SDK).
 * Para cada prestador REAL sin teléfono o sin Instagram busca en la web
 * (Instagram/Facebook/TikTok/directorios) datos de contacto y los valida
 * contra el nombre del negocio antes de guardarlos.
 *
 * Uso: bun scripts/enrich-real.ts [--limit 60]
 */
import { PrismaClient } from "@prisma/client";
import ZAI from "z-ai-web-dev-sdk";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const db = new PrismaClient();
const CACHE = join(process.cwd(), ".cache", "enrich.json");
const CACHE_DIR = join(process.cwd(), ".cache");
mkdirSync(CACHE_DIR, { recursive: true });

const stripAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const norm = (s: string) => stripAccents(s.toLowerCase()).replace(/[^a-z0-9]+/g, " ").trim();

const GENERIC = new Set(["veterinaria", "veterinary", "clinica", "pet", "shop", "grooming", "ca", "srl", "el", "la", "los", "las", "de", "del", "y"]);
function nameTokens(businessName: string): string[] {
  return norm(businessName).split(" ").filter((t) => t.length >= 3 && !GENERIC.has(t));
}

interface SearchResult { name?: string; snippet?: string; url?: string }

function extractIg(text: string): string | null {
  const m = text.match(/instagram\.com\/([A-Za-z0-9_.]{2,30})/) || text.match(/@([A-Za-z0-9_.]{3,30})/);
  if (!m) return null;
  const h = m[1].replace(/\.+$/, "");
  if (/^(p|reel|explore|accounts|stories|tv)$/.test(h)) return null;
  return "@" + h;
}
function extractFb(text: string): string | null {
  const m = text.match(/facebook\.com\/([A-Za-z0-9_.\-]{3,60})/);
  if (!m || /^(p|pages|groups|profile\.php|share|watch|hashtag)/.test(m[1])) return null;
  return m[1];
}
function extractTt(text: string): string | null {
  const m = text.match(/tiktok\.com\/@([A-Za-z0-9_.]{2,30})/);
  return m ? "@" + m[1] : null;
}
function extractEmail(text: string): string | null {
  const m = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (!m) return null;
  const e = m[0].toLowerCase();
  if (/(example|sentry|wixpress|noreply|@2x|\.png|\.jpg|\.webp)/.test(e)) return null;
  return e;
}
function extractPhones(text: string): string[] {
  const out: string[] = [];
  const re = /(?:\+?58[\s-]?)?0?(4(?:12|14|16|24|26))[\s-]?(\d{3})[\s-]?(\d{4})|0?(2\d{2})[\s-]?(\d{3})[\s-]?(\d{4})/g;
  for (const m of text.matchAll(re)) {
    let d = (m[0] || "").replace(/\D/g, "");
    if (d.length === 11 && d.startsWith("0")) d = "58" + d.slice(1);
    else if (d.length === 10 && /^[24]/.test(d)) d = "58" + d;
    else if (d.length === 12 && d.startsWith("58")) { /* ok */ }
    else continue;
    const pretty = `+58 ${d.slice(2, 5)}-${d.slice(5)}`;
    if (!out.includes(pretty)) out.push(pretty);
  }
  return out;
}

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 70;

  type CacheShape = Record<string, { done: boolean }>;
  let cache: CacheShape = {};
  try { cache = JSON.parse(readFileSync(CACHE, "utf8")) as CacheShape; } catch { /* nuevo */ }

  const zai = (await ZAI.create()) as unknown as {
    functions: { invoke: (name: string, params: Record<string, unknown>) => Promise<unknown> };
  };
  const search = async (query: string): Promise<SearchResult[]> => {
    try {
      const res = (await zai.functions.invoke("web_search", { query, num: 8 })) as SearchResult[];
      return Array.isArray(res) ? res : [];
    } catch (e) {
      console.warn(`  ⚠️ search: ${(e as Error).message}`);
      return [];
    }
  };

  const providers = await db.provider.findMany({
    where: { badges: { contains: "REAL" } },
    select: { id: true, businessName: true, city: true, bio: true, user: { select: { id: true, phone: true } } },
  });

  // prioridad: sin teléfono → sin instagram; máximo LIMIT consultas
  const todo = providers
    .filter((p) => !p.phone || !/instagram:/i.test(p.bio))
    .sort((a, b) => Number(!a.user.phone) - Number(!b.user.phone))
    .slice(0, LIMIT);

  console.log(`🔍 Enriqueciendo ${todo.length} negocios (de ${providers.length} reales)…`);
  let updated = 0;

  for (const p of todo) {
    if (cache[p.id]?.done) continue;
    const tokens = nameTokens(p.businessName);
    if (tokens.length === 0) continue;

    const results = await search(`${p.businessName} ${p.city} Venezuela instagram telefono contacto`);

    let ig: string | null = null, fb: string | null = null, tt: string | null = null, email: string | null = null;
    const phones: string[] = [];

    for (const r of results) {
      const text = `${r.name ?? ""} ${r.snippet ?? ""} ${r.url ?? ""}`;
      const nt = norm(text);
      const hits = tokens.filter((t) => nt.includes(t)).length;
      if (hits < Math.min(2, tokens.length)) continue; // validar que sea el MISMO negocio
      ig = ig ?? extractIg(text);
      fb = fb ?? extractFb(text);
      tt = tt ?? extractTt(text);
      email = email ?? extractEmail(text);
      for (const ph of extractPhones(text)) if (!phones.includes(ph)) phones.push(ph);
    }

    const addLines: string[] = [];
    if (ig && !/instagram:/i.test(p.bio)) addLines.push(`📸 Instagram: ${ig}`);
    if (fb && !/facebook:/i.test(p.bio)) addLines.push(`📘 Facebook: ${fb}`);
    if (tt && !/tiktok:/i.test(p.bio)) addLines.push(`🎵 TikTok: ${tt}`);
    if (email && !/@/.test(p.bio.split("\n").find((l) => l.startsWith("✉️")) ?? "")) addLines.push(`✉️ ${email}`);
    const newPhones = phones.filter((ph) => !p.bio.includes(ph));
    if (newPhones.length && !p.user.phone) addLines.push(`📞 ${newPhones.join(" · ")}`);

    if (addLines.length) {
      const bio = `${p.bio}\n${addLines.join("\n")}`.slice(0, 1200);
      const phone = p.user.phone ?? newPhones[0] ?? null;
      await db.provider.update({ where: { id: p.id }, data: { bio } });
      if (phone && !p.user.phone) await db.user.update({ where: { id: p.user.id }, data: { phone } });
      updated++;
      console.log(`  ✅ ${p.businessName} → ${addLines.join(" | ")}`);
    } else {
      console.log(`  · ${p.businessName} — sin datos confiables`);
    }

    cache[p.id] = { done: true };
    writeFileSync(CACHE, JSON.stringify(cache));
    await new Promise((r) => setTimeout(r, 900));
  }

  console.log(`\n🎉 ${updated} negocios enriquecidos`);
  process.exit(0);
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
