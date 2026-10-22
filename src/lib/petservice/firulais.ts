/**
 * PetService VE — Firulais 🐕 (asistente FAQ)
 *
 * Motor de matching determinista entre preguntas de usuarios y las entradas
 * de la base de conocimiento (modelo FirulaisEntry). Se usa en:
 *  - POST /api/ai/chat  (responde antes del fallback LLM y loguea los miss)
 *  - POST /api/admin/firulais/test (simulador sin logging ni hits)
 *
 * Normalización: minúsculas + sin acentos + sin puntuación. Las keywords se
 * guardan ya normalizadas (igual que aquí) para que el matching sea estable.
 */

/** Umbral de score mínimo para considerar que una entrada responde la pregunta */
export const FIRULAIS_THRESHOLD = 1.2;

/** Palabras vacías que no aportan al matching */
const STOP = new Set([
  "de", "la", "el", "los", "las", "que", "para", "con", "por", "una", "uno",
  "del", "al", "en", "y", "o", "es", "son", "me", "mi", "su", "tu", "te", "un",
  "yo", "se", "lo", "ha", "hay", "mas", "muy", "esta", "este", "esto", "eso",
  "como", "donde", "cuando", "cual", "cuales", "sobre", "hay", "puedo", "puedes",
]);

/** minúsculas + sin acentos + solo letras/números/espacios */
export function normalizeEs(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normaliza la LISTA de keywords separadas por coma preservando el separador
 * (normalizeEs a secas convertiría las comas en espacios y rompería la lista).
 * Devuelve keywords únicas, en minúsculas y sin acentos, separadas por coma.
 */
export function normalizeKeywords(raw: string): string {
  return raw
    .split(",")
    .map((k) => normalizeEs(k))
    .filter(Boolean)
    .filter((k, i, arr) => arr.indexOf(k) === i)
    .join(",");
}

/** Tokens útiles de una frase normalizada (sin stopwords, ≥3 letras) */
function tokens(s: string): string[] {
  return s.split(" ").filter((t) => t.length >= 3 && !STOP.has(t));
}

export interface FirulaisScoredEntry {
  id: string;
  question: string;
  answer: string;
  keywords: string;
}

export interface FirulaisMatch {
  entryId: string;
  question: string;
  answer: string;
  score: number;
}

/**
 * Puntúa cada entrada contra la pregunta:
 *  - Frase exacta (keyword multi-palabra) presente en la pregunta → +2.5
 *  - Keyword de una palabra presente como palabra exacta → +2.0
 *  - Coincidencia parcial por prefijo (≥4 letras) → +0.8
 *  - Solapamiento de tokens keyword↔pregunta → +0.8 por token distinto
 */
export function matchFirulais(
  rawQuestion: string,
  entries: FirulaisScoredEntry[]
): FirulaisMatch | null {
  const nq = normalizeEs(rawQuestion);
  if (!nq) return null;
  const padded = ` ${nq} `;
  const qTokens = new Set(tokens(nq));

  let best: FirulaisMatch | null = null;

  for (const entry of entries) {
    let score = 0;

    const keywords = entry.keywords
      .split(",")
      .map((k) => normalizeEs(k))
      .filter(Boolean);

    for (const kw of keywords) {
      const kwTokens = tokens(kw);
      // 1) Frase (multi-palabra) u ocurrencia exacta dentro de la pregunta
      if (padded.includes(` ${kw} `) || nq === kw) {
        score += kw.includes(" ") ? 2.5 : 2.0;
        continue;
      }
      // 2) Keyword de una palabra = token exacto de la pregunta
      if (kwTokens.length === 1 && qTokens.has(kwTokens[0])) {
        score += 2.0;
        continue;
      }
      // 3) Coincidencia parcial por prefijo (stemming barato: "veterinari"~"veterinaria").
      //    Cuenta máximo una vez por keyword para no inflar el score.
      let partial = false;
      for (const kt of kwTokens) {
        if (partial) break;
        if (kt.length < 4) continue;
        for (const qt of qTokens) {
          if (qt.length >= 4 && (qt.startsWith(kt) || kt.startsWith(qt))) {
            score += 0.8;
            partial = true;
            break;
          }
        }
      }
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { entryId: entry.id, question: entry.question, answer: entry.answer, score };
    }
  }

  if (best && best.score >= FIRULAIS_THRESHOLD) return best;
  return null;
}
