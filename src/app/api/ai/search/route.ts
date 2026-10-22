import { NextResponse, after } from "next/server";
import { rateLimit, clientIp, sameOriginOrError, readJson, cleanText } from "@/lib/petservice/auth";
import { ZONES } from "@/lib/petservice/constants";
import { flushDb } from "@/lib/db";
import { createZai } from "@/lib/petservice/zai";

/**
 * POST /api/ai/search — Búsqueda semántica
 * "busco peluquería pa' mi michi en San Félix" → filtros estructurados
 * Estrategia híbrida: parser local determinista (rápido, gratis) + LLM como
 * fallback para lenguaje complejo. Devuelve { category, petType, zone, q }.
 * Adaptado al español de Venezuela: michi, gatico, pelu, bañito, pa', pana…
 */

export const maxDuration = 30;

const VALID_CATEGORIES = ["GROOMING", "DELIVERY", "PET_SITTING", "DOG_WALKING", "TRAINING", "PET_TAXI", "SPA_MOVIL", "VET"];
const ZONE_NAMES = ZONES.map((z) => z.name);

/** Quita acentos para comparar zonas (san felix = San Félix) */
function deaccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Regex que coincide con el texto con o sin acentos (americas = América) */
function accentInsensitivePattern(text: string): string {
  const MAP: Record<string, string> = { a: "aáàäâã", e: "eéèëê", i: "iíìïî", o: "oóòöôõ", u: "uúùüû", n: "nñ" };
  const esc = /[.*+?^${}()|[\]\\]/g;
  return text
    .split("")
    .map((c) => {
      const lower = c.toLowerCase();
      if (MAP[lower]) return `[${MAP[lower]}${MAP[lower].toUpperCase()}]`;
      return c.replace(esc, "\\$&");
    })
    .join("");
}

/** Alias regionales de Venezuela → ciudad del catálogo (el más específico primero) */
const CITY_ALIASES: [RegExp, string][] = [
  [/guayana este|guayana oriental|san f[eé]lix/i, "San Félix"],
  [/ciudad guayana|puerto ordaz|guayana/i, "Puerto Ordaz"],
  [/ciudad bol[ií]var|angostura/i, "Ciudad Bolívar"],
  [/upata/i, "Upata"],
];

/**
 * Detecta la zona mencionada en la búsqueda:
 * 1) coincidencia exacta (sin acentos) del nombre de la zona
 * 2) alias de ciudad → zona principal de esa ciudad
 */
function findZone(query: string): string | null {
  const s = deaccent(query.toLowerCase());
  for (const z of ZONE_NAMES) {
    if (s.includes(deaccent(z.toLowerCase()))) return z;
  }
  for (const [re, city] of CITY_ALIASES) {
    if (re.test(s)) {
      const principal = ZONES.find((zz) => zz.city === city && !/ \(|\bSur\b|\bEste\b/.test(zz.name)) ?? ZONES.find((zz) => zz.city === city);
      return principal?.name ?? null;
    }
  }
  return null;
}

const CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/pelu\w*|grooming|ba[ñn]o|ba[ñn]a\w*|ba[ñn]it|corte|corta|estilism|desmate|deshedding/i, "GROOMING"],
  [/veterinari\w*|\bvet\b|\bvets\b|consulta\w*|vacuna\w*|vacun\w*|desparasit\w*|chequeo|chequear|urgenc\w*|enferm\w*|parasit\w*|libreta sanitaria|certificado de salud/i, "VET"],
  [/delivery|domicilio.*(comida|alimento|medicina)|comida|comidita|alimento|medicina|antipulga|accesorio|arena|llevar|lleva/i, "DELIVERY"],
  [/sitting|cuidad|cuid[eé]\w*|cuida\w*|hospeda|viaje|vacacion|aloja/i, "PET_SITTING"],
  [/paseo|pasea|pasead\w*|caminat|dog walking/i, "DOG_WALKING"],
  [/adiestra|entrena|obediencia|conducta|comporta/i, "TRAINING"],
  [/taxi|traslad|transport|lleva.*(vet|cl[ií]nica|aeropuerto)/i, "PET_TAXI"],
  [/spa|m[óo]vil.*(ba[ñn]o|lav)|unidad m[óo]vil/i, "SPA_MOVIL"],
];

/** Parser local determinista — cubre el 90% de las búsquedas naturales */
function parseLocal(query: string) {
  let category: string | null = null;
  for (const [re, cat] of CATEGORY_KEYWORDS) {
    if (re.test(query)) { category = cat; break; }
  }
  let petType: string | null = null;
  if (/\bgat[oaos]?\b|\bgatico?\w*|\bgatit\w*|\bmichi\w*|\bminino\b|\bfelino\b/i.test(query)) petType = "GATO";
  else if (/\bperr[oaos]?\b|\bperrit\w*|\bcachorr\w*|\bfirulais\b/i.test(query)) petType = "PERRO";
  const zone = findZone(query);
  // q: resto de palabras concretas. ORDEN IMPORTANTE: primero se quitan las
  // zonas/ciudades (porque STOP eliminaría artículos que forman parte del
  // nombre, ej: "El Roble" → "Roble") y después los stopwords.
  let q = query;
  for (const z of ZONE_NAMES) {
    const zk = deaccent(z.toLowerCase());
    if (deaccent(q.toLowerCase()).includes(zk)) {
      q = q.replace(new RegExp(accentInsensitivePattern(zk), "gi"), " ");
    }
  }
  for (const [re] of CITY_ALIASES) q = q.replace(re, " ");
  const STOP = /\b(busco|busca|necesito|quiero|deseo|dame|hola|chamo|chama|pana|por|para|pa|porfa|favor|gracias|mi|mis|un|una|unos|unas|el|la|los|las|de|del|en|que|me|se|esta|este|esta|semana|hoy|ma[ñn]ana|fin|urgente|cerca|domicilio|a|y|o|al|donde|quien|quienes|tengo|es|alguien|desde|hacia|s[áa]bado|domingo|viernes|jueves|martes|lunes|mi[ée]rcoles)\b/gi;
  q = q.replace(STOP, " ").replace(/\s+/g, " ").trim();
  if (petType === "GATO") q = q.replace(/\bgat[oaos]?\b|\bgatico?\w*|\bgatit\w*|\bmichi\w*|\bminino\b|\bfelino\b/gi, " ");
  if (petType === "PERRO") q = q.replace(/\bperr[oaos]?\b|\bperrit\w*|\bcachorr\w*|\bfirulais\b/gi, " ");
  if (category) {
    if (category === "GROOMING") q = q.replace(/\bpelu\w*|\bgrooming\b|\bba[ñn]o\b|\bba[ñn]a\w*|\bba[ñn]it\w*|\bcorte\b|\bestilism\w*/gi, " ");
    if (category === "DOG_WALKING") q = q.replace(/\bpaseo\b|\bpasea\w*/gi, " ");
    if (category === "DELIVERY") q = q.replace(/\bdelivery\b|\bcomida\b|\bcomidita\b|\balimento\b|\bmedicina\w*|\barena\b/gi, " ");
    if (category === "PET_SITTING") q = q.replace(/\bsitting\b|\bcuid[eé]\w*|\bcuida(dor|dora)?\b|\bcuidad\w*/gi, " ");
    if (category === "TRAINING") q = q.replace(/\badiestra\w*|\bentrena\w*/gi, " ");
    if (category === "PET_TAXI") q = q.replace(/\btaxi\b|\bpet\b|\btraslad\w*|\btransport\w*/gi, " ");
    if (category === "SPA_MOVIL") q = q.replace(/\bspa\b|\bm[óo]vil\b/gi, " ");
    if (category === "VET") q = q.replace(/\bvet\b|\bveterinari\w*|\bconsulta\w*|\bvacuna\w*|\bvacun\w*|\bdesparasit\w*|\bchequeo\w*|\burgenc\w*|\benferm\w*/gi, " ");
  }
  q = q.replace(/\s+/g, " ").trim();
  // Residuos triviales (<3 chars) no aportan al filtro textual
  if (q.length < 3) q = "";
  return { category, petType, zone, q };
}

export async function POST(req: Request) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  // Rate limit anti-abuso: 30 búsquedas/minuto por IP
  const rl = rateLimit(`aisearch:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Demasiadas búsquedas. Espera un momento 🐾", retryAfterS: rl.retryAfterS }, { status: 429 });

  const body = await readJson<Record<string, unknown>>(req, 4096);
  if (!body) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  const query = cleanText(body.query, 120);
  if (query.length < 3) return NextResponse.json({ error: "query muy corta" }, { status: 400 });

  // 1) Parser local primero (determinista, sin costo)
  const local = parseLocal(query);
  if (local.category || local.zone) {
    return NextResponse.json({ filters: local, engine: "local" });
  }

  // 2) Fallback LLM para lenguaje complejo
  try {
    const zai = await createZai();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content: `Eres un parser de búsquedas para un marketplace de servicios para mascotas en el estado Bolívar, Venezuela. Convierte la búsqueda del usuario (español venezolano: michi=gato, perrito, pelu=peluquería, bañito=baño) a JSON estricto con esta forma EXACTA (sin texto adicional, sin markdown):
{"category": string|null, "petType": "PERRO"|"GATO"|null, "zone": string|null, "q": string}

- category: una de ${VALID_CATEGORIES.join(", ")}, o null si no aplica. Mapea lenguaje natural: "peluquería/pelu/baño/bañito/corte"→GROOMING, "veterinario/veterinaria/vet/consulta/vacuna/vacunación/desparasitación/chequeo/urgencia/certificado de salud"→VET, "delivery/comida/alimento/arena"→DELIVERY, "cuidado/sitting/viaje/cuidador"→PET_SITTING, "paseo/paseador/pasear"→DOG_WALKING, "adiestramiento/entrenamiento/conducta"→TRAINING, "taxi/traslado/transporte"→PET_TAXI, "spa/spa móvil"→SPA_MOVIL
- petType: "PERRO" si menciona perro/perrito/cachorro/firulais; "GATO" si menciona gato/gatito/michi/minino/felino; null si no especifica
- zone: una zona de esta lista si la menciona (o alguna de las ciudades: Puerto Ordaz, San Félix, Ciudad Bolívar, Upata): ${ZONE_NAMES.join(", ")}. Si no menciona zona válida → null
- q: SOLO palabras clave concretas (raza, marca, producto). EXCLUYE palabras temporales y de relleno. Si no queda nada concreto → ""
Responde SOLO el JSON.`,
        },
        { role: "user", content: query },
      ],
      thinking: { type: "disabled" },
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Sin JSON en la respuesta");
    const parsed = JSON.parse(match[0]);

    const cleanQ = typeof parsed.q === "string" && parsed.q.trim() !== query.trim()
      ? parsed.q.slice(0, 60)
      : "";

    return NextResponse.json({
      filters: {
        category: VALID_CATEGORIES.includes(parsed.category) ? parsed.category : local.category,
        petType: ["PERRO", "GATO"].includes(parsed.petType) ? parsed.petType : local.petType,
        zone: (parsed.zone ? findZone(String(parsed.zone)) : null) ?? local.zone,
        q: cleanQ,
      },
      engine: "llm",
    });
  } catch (e) {
    console.error("AI search error:", e);
    // 3) Degradación elegante: devuelve lo que pudo parsear localmente
    return NextResponse.json({ filters: local, engine: "local-fallback" });
  }
}
