/**
 * PetService VE — Firulais 🐕 RESPUESTAS CON CATÁLOGO REAL
 *
 * Capa determinista que responde preguntas del tipo «¿quién hace X en Y?»,
 * «busco X para gatos en Y», «¿cuánto cuesta un baño?» con prestadores
 * VERIFICADOS reales de la plataforma (sin LLM, instantáneo y sin alucinar).
 *
 * Se usa en POST /api/ai/chat ANTES del LLM: en producción la API interna de
 * Z-AI no siempre es alcanzable desde Vercel, y estas preguntas merecen una
 * respuesta concreta con nombres, zonas y precios reales, no una intro.
 */

import { SUPPORT_WHATSAPP } from "./constants";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Palabras vacías frecuentes que no ayudan a detectar la intención */
const has = (q: string, words: string[]) => words.some((w) => q.includes(w));

export interface CatalogServiceProvider {
  businessName: string;
  zoneName: string;
  city: string;
  ratingAvg: number;
  polarBrands?: string | null;
  services: { name: string; category: string; priceUsd: number | null }[];
}

type Intent =
  | "GROOMING"
  | "VET"
  | "ALIMENTOS"
  | "PET_SITTING"
  | "DOG_WALKING"
  | "PET_TAXI"
  | "TRAINING"
  | "SPA_MOVIL"
  | "DELIVERY";

const INTENT_LABEL: Record<Intent, string> = {
  GROOMING: "peluquería y baño",
  VET: "veterinaria",
  ALIMENTOS: "alimentos y perrarinas",
  PET_SITTING: "pet sitting",
  DOG_WALKING: "paseos",
  PET_TAXI: "pet taxi",
  TRAINING: "adiestramiento",
  SPA_MOVIL: "spa móvil",
  DELIVERY: "delivery",
};

/** Palabras clave de intención (ya en minúsculas/sin acentos) — orden = prioridad */
const INTENT_WORDS: [Intent, string[]][] = [
  ["SPA_MOVIL", ["spa movil", "spa mobil", "baño movil", "bano movil", "bañera movil"]],
  ["VET", ["veterinar", "vacuna", "desparasit", "consulta veterin", "veterinario", "veterinaria", "salud de mi"]],
  ["PET_TAXI", ["pet taxi", "taxi", "transporte", "traslad", "llevar al vet", "llevar a la mascota", "mudanza"]],
  ["DOG_WALKING", ["paseo", "pasear", "dog walker", "caminar", "sacar a mi perro"]],
  ["PET_SITTING", ["pet sitting", "sitting", "hospedaje", "cuidador", "guarderia", "hotel para mascotas", "cuide", "cuidado a domicilio", "cuando viajo"]],
  ["TRAINING", ["adiestr", "entrenamiento", "obediencia", "conducta"]],
  ["ALIMENTOS", ["aliment", "perrarina", "gatarina", "croqueta", "concentrado", "concetro", "comida para", "comida de", "supercan", "super can", "dogourmet", "champs", "champ s", "don kat", "oh mai", "polar", "pet shop", "tienda de mascotas"]],
  ["DELIVERY", ["delivery", "domicilio de comida", "entrega a domicilio"]],
  ["GROOMING", ["grooming", "peluquer", "bano", "banito", "bañito", "banar", "corte", "estetica", "spa", "uñas", "unas", "oidos"]],
];

/** Detecta la intención de servicio de la pregunta (null si no hay) */
function detectIntent(q: string): Intent | null {
  for (const [intent, words] of INTENT_WORDS) {
    if (has(q, words)) return intent;
  }
  return null;
}

/** Categorías de servicio (Provider.services.category) que cubren cada intención */
const INTENT_CATEGORIES: Record<Intent, string[]> = {
  GROOMING: ["GROOMING", "SPA_MOVIL"],
  SPA_MOVIL: ["SPA_MOVIL", "GROOMING"],
  VET: ["VET"],
  ALIMENTOS: ["ALIMENTOS", "DELIVERY"],
  DELIVERY: ["DELIVERY", "ALIMENTOS"],
  PET_SITTING: ["PET_SITTING"],
  DOG_WALKING: ["DOG_WALKING"],
  PET_TAXI: ["PET_TAXI"],
  TRAINING: ["TRAINING"],
};

const money = (usd: number, rate: number) => `$${usd} (≈ Bs. ${Math.round(usd * rate)})`;

/**
 * Respuesta determinista con prestadores reales. Devuelve null si la pregunta
 * no es de este tipo (sin servicio detectable) — entonces siguen el FAQ y el LLM.
 */
export function catalogAnswer(
  rawQuestion: string,
  providers: CatalogServiceProvider[],
  usdToBs: number
): string | null {
  const q = norm(rawQuestion);
  if (!q || q.length < 4) return null;

  const intent = detectIntent(q);
  if (!intent) return null;

  const cats = INTENT_CATEGORIES[intent];
  const byCategory = providers.filter((p) => p.services.some((s) => cats.includes(s.category)));

  // ── Detección de lugar: ciudad del catálogo o zona real de un prestador ──
  const cityNames = [...new Set(providers.map((p) => p.city))];
  let matchedCity: string | null = null;
  for (const c of cityNames) {
    if (q.includes(norm(c))) { matchedCity = c; break; }
  }
  let matchedZone: string | null = null;
  if (!matchedCity) {
    const zoneNames = [...new Set(providers.map((p) => p.zoneName).filter(Boolean))] as string[];
    // zonas largas primero para preferir la coincidencia más específica
    zoneNames.sort((a, b) => b.length - a.length);
    for (const z of zoneNames) {
      if (norm(z).length >= 4 && q.includes(norm(z))) { matchedZone = z; break; }
    }
    if (matchedZone) {
      matchedCity = providers.find((p) => p.zoneName === matchedZone)?.city ?? null;
    }
  }

  // ── Selección de prestadores ──
  // Si la zona exacta no tiene prestadores de esa categoría pero su ciudad sí,
  // respondemos con los de la ciudad («cerca de {zona}») — más útil que un «no hay».
  let inPlace = byCategory;
  let place: string | null = null;
  let zoneWithoutCoverage = false;
  if (matchedZone) {
    inPlace = byCategory.filter((p) => p.zoneName === matchedZone);
    if (inPlace.length === 0 && matchedCity) {
      inPlace = byCategory.filter((p) => p.city === matchedCity);
      zoneWithoutCoverage = inPlace.length > 0;
    }
    place = zoneWithoutCoverage
      ? `${matchedCity} (cerca de ${matchedZone})`
      : `${matchedZone}${matchedCity ? `, ${matchedCity}` : ""}`;
  } else if (matchedCity) {
    inPlace = byCategory.filter((p) => p.city === matchedCity);
    place = matchedCity;
  }

  // Marca Polar específica → priorizar prestadores con esa insignia
  const brandWords: Record<string, string> = {
    supercan: "SUPERCAN", "super can": "SUPERCAN", dogourmet: "DOGOURMET",
    champs: "CHAMPS", "champ s": "CHAMPS", "don kat": "DONKAT", "oh mai": "OHMAIGAT",
  };
  let brandKey: string | null = null;
  for (const [w, k] of Object.entries(brandWords)) {
    if (q.includes(w)) { brandKey = k; break; }
  }
  const brandFiltered = brandKey ? inPlace.filter((p) => (p.polarBrands ?? "").includes(brandKey)) : [];
  const finalList = brandFiltered.length > 0 ? brandFiltered : inPlace;

  const petKind = has(q, ["gato", "gatos", "michi", "michis", "felino"])
    ? "gatos"
    : has(q, ["perro", "perros", "cachorro", "cachorros", "perrito"])
      ? "perros"
      : null;

  const top = [...finalList]
    .sort((a, b) => b.ratingAvg - a.ratingAvg)
    .slice(0, 3);

  // ── Con lugar y SIN prestadores de esa categoría ahí ──
  if (top.length === 0) {
    const otherCities = [...new Set(byCategory.map((p) => p.city))].slice(0, 4);
    const where = place ? `en ${place}` : "en tu zona";
    return `🐾 Por ahora no tengo prestadores de ${INTENT_LABEL[intent]} ${where}${petKind ? ` para ${petKind}` : ""}. Estamos certificando nuevos negocios todos los días 💪${otherCities.length ? ` — sí tenemos en: ${otherCities.join(", ")}.` : ""} Si quieres, te registramos como prestador o escríbenos al WhatsApp ${SUPPORT_WHATSAPP} y te avisamos en cuanto llegue uno cerca tuyo 🐶`;
  }

  // ── Respuesta con prestadores reales ──
  const lines = top.map((p, i) => {
    // Precios $0 o nulos = sin precio publicado → no mostrar «desde $0»
    const prices = p.services
      .filter((s) => cats.includes(s.category) && s.priceUsd != null && (s.priceUsd as number) > 0)
      .map((s) => s.priceUsd as number);
    const min = prices.length ? Math.min(...prices) : null;
    const score = p.ratingAvg > 0 ? ` · ⭐ ${p.ratingAvg.toFixed(1)}` : "";
    const price = min != null ? ` · desde ${money(min, usdToBs)}` : "";
    const zone = p.zoneName ? `, ${p.zoneName}` : "";
    return `${i + 1}. **${p.businessName}** (${p.city}${zone})${score}${price}`;
  });

  const polarNote = brandKey
    ? `\n🏅 Venden la marca que buscas (productos Empresas Polar) — confirma precio y entrega por WhatsApp.`
    : "";
  const otherCount = Math.max(0, finalList.length - top.length);

  return `🐾 ¡Claro! Para ${INTENT_LABEL[intent]}${petKind ? ` de ${petKind}` : ""}${place ? ` en ${place}` : ""} te recomiendo estos prestadores verificados:\n\n${lines.join("\n")}${otherCount > 0 ? `\n\nY hay ${otherCount} más en el buscador.` : ""}${polarNote}\n\nToca una ficha → «Reservar ahora», o filtra la categoría en el buscador con tu ciudad y sector. ¿Te ayudo a reservar? 🐶`;
}
