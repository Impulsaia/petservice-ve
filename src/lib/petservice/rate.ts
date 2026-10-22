import { db } from "@/lib/db";

/**
 * Tasa oficial BCV USD → Bs con actualización automática.
 *
 * Cadena de fuentes (en orden de confianza, con fallback):
 *  1. ve.dolarapi.com  — espejo de la tasa oficial publicada por el BCV (JSON estable)
 *  2. pydolarve.org    — agregador venezolano (endpoint tipo-cambio BCV)
 *  3. www.bcv.org.ve   — scraping directo del sitio del Banco Central de Venezuela
 *
 * Si todas fallan se conserva el último valor guardado (nunca se pisa con basura).
 */

const RATE_TTL_MS = 60 * 60 * 1000; // considera la tasa "vieja" tras 1 hora
const MIN_RETRY_MS = 10 * 60 * 1000; // reintento externo cada 10 min máx. por instancia
const TIMEOUT_MS = 6000;

let lastExternalAttempt = 0; // guarda por instancia (serverless: por frío) para no martillar

export interface RateFetch {
  rate: number;
  source: string; // "bcv-dolarapi" | "bcv-pydolarve" | "bcv-web"
}

function validRate(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0.5 && n < 1_000_000;
}

async function timedFetch(url: string, init?: RequestInit): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 PetServiceVE/2",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Fuente 1: DolarAPI Venezuela (tasa oficial BCV) */
async function fromDolarApi(): Promise<RateFetch | null> {
  const res = await timedFetch("https://ve.dolarapi.com/v1/dolares/oficial");
  if (!res?.ok) return null;
  try {
    const d = (await res.json()) as { promedio?: number };
    if (validRate(d.promedio)) return { rate: d.promedio, source: "bcv-dolarapi" };
  } catch { /* ignore */ }
  return null;
}

/** Fuente 2: pyDolarVenezuela (BCV) */
async function fromPyDolar(): Promise<RateFetch | null> {
  const res = await timedFetch("https://pydolarve.org/api/v2/tipo-cambio");
  if (!res?.ok) return null;
  try {
    const d = (await res.json()) as { price?: number; monitors?: { bcv?: { price?: number } } };
    const p = validRate(d.price) ? d.price : validRate(d.monitors?.bcv?.price) ? d.monitors?.bcv?.price : null;
    if (p) return { rate: p, source: "bcv-pydolarve" };
  } catch { /* ignore */ }
  return null;
}

/** Fuente 3: scraping del propio bcv.org.ve (mejor esfuerzo) */
async function fromBcvWeb(): Promise<RateFetch | null> {
  const res = await timedFetch("https://www.bcv.org.ve/");
  if (!res?.ok) return null;
  try {
    const html = await res.text();
    const m = html.match(/class="dollar"[\s\S]{0,300}?>([\d.,]+)</) ?? html.match(/id="dollar"[\s\S]{0,300}?>([\d.,]+)</);
    if (!m) return null;
    const rate = Number(m[1].replace(/\./g, "").replace(",", "."));
    if (validRate(rate)) return { rate, source: "bcv-web" };
  } catch { /* ignore */ }
  return null;
}

/** Consulta las fuentes externas en cascada y devuelve la primera tasa válida. */
export async function fetchBcvRate(): Promise<RateFetch | null> {
  return (await fromDolarApi()) ?? (await fromPyDolar()) ?? (await fromBcvWeb());
}

function isStale(updatedAt: Date | null): boolean {
  return !updatedAt || Date.now() - updatedAt.getTime() > RATE_TTL_MS;
}

/**
 * Sincroniza la tasa con BCV si corresponde:
 *  - force=true → consulta externa inmediata (admin / cron)
 *  - si autoRate y la tasa está vieja (>1h) → intenta refrescar (con throttle de 10 min)
 * Nunca devuelve null salvo que no exista la fila Settings.
 */
export async function syncRateIfNeeded(force = false) {
  const s = await db.settings.findUnique({ where: { id: "main" } });
  if (!s) return null;

  if (!force) {
    if (!s.autoRate) return s;
    if (!isStale(s.usdToBsUpdatedAt)) return s;
    if (Date.now() - lastExternalAttempt < MIN_RETRY_MS) return s;
  }
  lastExternalAttempt = Date.now();

  const fresh = await fetchBcvRate();
  if (!fresh) return s; // falla externa → conservar valor actual (queda marcado como viejo y se reintenta)

  return await db.settings.update({
    where: { id: "main" },
    data: { usdToBs: fresh.rate, usdToBsSource: fresh.source, usdToBsUpdatedAt: new Date() },
  });
}

/** Vista pública de la tasa para API/UI */
export function rateView(s: { usdToBs: number; usdToBsSource: string; usdToBsUpdatedAt: Date | null; autoRate: boolean }) {
  return {
    usdToBs: s.usdToBs,
    usdToBsSource: s.usdToBsSource,
    usdToBsUpdatedAt: s.usdToBsUpdatedAt ? s.usdToBsUpdatedAt.toISOString() : null,
    autoRate: s.autoRate,
  };
}
