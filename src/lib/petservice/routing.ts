/**
 * PetService VE — Distancias/tiempos de conducción REALES vía OSRM (gratis, sin key)
 *
 * El Haversine es "en línea recta": entre Puerto Ordaz y San Félix miente,
 * porque el río Caroní obliga a cruzar por el puente (represa Macagua).
 * OSRM router.project-osrm.org resuelve la red vial real → km reales + minutos.
 *
 * - /table service: 1 origen → N destinos en UNA llamada (max ~90 por chunk)
 * - Cache por par (redondeo a ~111 m) con TTL 12 h → repite búsquedas gratis
 * - Fallback gracioso: si OSRM no responde, la API usa Haversine y la UI
 *   rotula "(en línea recta)"
 */

export interface LatLngLike {
  lat: number;
  lng: number;
}

export interface DriveTable {
  /** km reales por destino (null = no calculable) */
  km: (number | null)[];
  /** minutos de conducción por destino (null = no calculable) */
  min: (number | null)[];
  /** true si al menos un chunk respondió */
  ok: boolean;
}

const OSRM_BASE = process.env.OSRM_BASE ?? "https://router.project-osrm.org";
const CHUNK = 90; // el server demo limita table size (≤100 coords totales)
const TIMEOUT_MS = 4500;
const TTL_MS = 12 * 60 * 60 * 1000;

interface CacheEntry {
  km: number | null;
  min: number | null;
  exp: number;
}
const pairCache = new Map<string, CacheEntry>();

// Limpieza perezosa (cada ~500 inserciones)
let writesSinceClean = 0;
function maybeClean() {
  if (++writesSinceClean < 500) return;
  writesSinceClean = 0;
  const now = Date.now();
  for (const [k, v] of pairCache) if (v.exp < now) pairCache.delete(k);
}

const r3 = (n: number) => n.toFixed(3);
const pairKey = (o: LatLngLike, d: LatLngLike) => `${r3(o.lat)},${r3(o.lng)}|${r3(d.lat)},${r3(d.lng)}`;

async function fetchChunk(origin: LatLngLike, dests: LatLngLike[]): Promise<({ km: number | null; min: number | null } | null)[]> {
  const coords = [`${origin.lng.toFixed(5)},${origin.lat.toFixed(5)}`, ...dests.map((d) => `${d.lng.toFixed(5)},${d.lat.toFixed(5)}`)].join(";");
  const url = `${OSRM_BASE}/table/v1/driving/${coords}?sources=0&annotations=distance,duration`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = (await res.json()) as { distances?: (number | null)[][]; durations?: (number | null)[][]; code?: string };
  if (data.code !== "Ok" || !data.distances?.[0] || !data.durations?.[0]) throw new Error("OSRM respuesta inválida");
  return dests.map((_, i) => {
    const d = data.distances?.[0]?.[i + 1];
    const t = data.durations?.[0]?.[i + 1];
    if (d == null || t == null) return { km: null, min: null };
    return { km: +(d / 1000).toFixed(1), min: Math.max(1, Math.round(t / 60)) };
  });
}

/**
 * Distancia/duración de conducción de `origin` a cada destino.
 * Nunca lanza: ante fallos devuelve pares null (la UI hace fallback).
 */
export async function driveTable(origin: LatLngLike, dests: LatLngLike[]): Promise<DriveTable> {
  const out: DriveTable = { km: dests.map(() => null), min: dests.map(() => null), ok: false };
  if (dests.length === 0) return out;

  const now = Date.now();
  const missing: { idx: number; latlng: LatLngLike }[] = [];
  dests.forEach((d, idx) => {
    const key = pairKey(origin, d);
    const hit = pairCache.get(key);
    if (hit && hit.exp > now) {
      out.km[idx] = hit.km;
      out.min[idx] = hit.min;
    } else {
      missing.push({ idx, latlng: d });
    }
  });

  // chunks de `CHUNK` destinos
  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
    try {
      const values = await fetchChunk(origin, chunk.map((c) => c.latlng));
      chunk.forEach((c, j) => {
        const v = values[j] ?? { km: null, min: null };
        out.km[c.idx] = v.km;
        out.min[c.idx] = v.min;
        pairCache.set(pairKey(origin, c.latlng), { ...v, exp: Date.now() + TTL_MS });
      });
      out.ok = true;
    } catch {
      // chunk falla → esos destinos quedan null (fallback Haversine en la UI)
    }
  }
  maybeClean();
  return out;
}

/** "12.4 km · ~22 min" para mostrar junto a la distancia recta */
export function fmtDrive(km: number | null | undefined, min: number | null | undefined): string | null {
  if (km == null || min == null) return null;
  const kmTxt = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  return `${kmTxt} · ~${min} min`;
}
