import { NextRequest, NextResponse } from "next/server";

/**
 * PetService VE — Proxy a Overpass API (OpenStreetMap) para negocios de mascotas
 *
 * ¿Por qué un proxy propio?
 * - Sin CORS ni bloqueos del navegador; un solo punto de reintento
 * - Caché en memoria por bbox (15 min) → menos carga a Overpass (servicio gratuito público)
 * - Respuesta compacta (lat, lng, nombre, tipo) en vez del JSON crudo de Overpass
 *
 * Overpass es 100% gratuito y sin API key. Cascade: overpass-api.de → mirror kumi.systems
 */

export const dynamic = "force-dynamic";

interface OvElement {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface PetPoi {
  lat: number;
  lng: number;
  name: string;
  kind: string;
}

// ─── Caché en memoria (por instancia/serverless) ───
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 60;
const cache = new Map<string, { at: number; pois: PetPoi[] }>();

function cacheGet(key: string): PetPoi[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.pois;
}

function cacheSet(key: string, pois: PetPoi[]) {
  if (cache.size >= CACHE_MAX) {
    // expira primero la más vieja
    let oldestKey = "";
    let oldest = Infinity;
    for (const [k, v] of cache) {
      if (v.at < oldest) {
        oldest = v.at;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { at: Date.now(), pois });
}

function kindOf(tags: Record<string, string> | undefined): string {
  if (!tags) return "Negocio de mascotas";
  if (tags.amenity === "veterinary") return "Veterinaria 🏥";
  if (tags.leisure === "dog_park") return "Parque canino 🌳";
  if (tags.shop === "pet_grooming") return "Peluquería pet ✂️";
  if (tags.shop === "pet") return "Tienda de mascotas 🏪";
  if (tags.shop === "animal") return "Alimentos para animales 🌾";
  return "Negocio de mascotas";
}

async function fetchOverpass(query: string, signal: AbortSignal): Promise<Response> {
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];
  let lastErr: unknown = null;
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        signal,
        headers: { "User-Agent": "PetServiceVE/1.0 (marketplace de servicios para mascotas; Venezuela)" },
        cache: "no-store",
      });
      if (res.ok) return res;
      lastErr = new Error(`Overpass ${res.status}`);
    } catch (e) {
      lastErr = e;
      if (signal.aborted) break;
    }
  }
  throw lastErr ?? new Error("Overpass no disponible");
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const south = Number(sp.get("s"));
  const west = Number(sp.get("w"));
  const north = Number(sp.get("n"));
  const east = Number(sp.get("e"));

  // Validación estricta del bbox
  if (![south, west, north, east].every((v) => Number.isFinite(v)) || south >= north || west >= east) {
    return NextResponse.json({ error: "bbox inválido" }, { status: 400 });
  }
  if (north - south > 1.2 || east - west > 1.4) {
    return NextResponse.json({ error: "Zona demasiado amplia; acércate a la ciudad" }, { status: 400 });
  }

  // clave de caché por bbox redondeado (≈1 km)
  const key = [south, west, north, east].map((v) => v.toFixed(2)).join(",");
  const cached = cacheGet(key);
  if (cached) {
    return NextResponse.json({ pois: cached, cached: true });
  }

  const bbox = `${south},${west},${north},${east}`;
  const query =
    `[out:json][timeout:18];` +
    `(node["amenity"="veterinary"](${bbox});` +
    `node["shop"~"^(pet|pet_grooming|animal)$"](${bbox});` +
    `node["leisure"="dog_park"](${bbox});` +
    `way["amenity"="veterinary"](${bbox});` +
    `way["shop"~"^(pet|pet_grooming|animal)$"](${bbox});` +
    `way["leisure"="dog_park"](${bbox}););` +
    `out center 120;`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetchOverpass(query, ctrl.signal);
    const data = (await res.json()) as { elements?: OvElement[] };
    const pois: PetPoi[] = [];
    for (const el of data.elements ?? []) {
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (lat == null || lng == null) continue;
      pois.push({ lat, lng, name: el.tags?.name ?? "Negocio de mascotas", kind: kindOf(el.tags) });
      if (pois.length >= 120) break;
    }
    cacheSet(key, pois);
    return NextResponse.json({ pois, cached: false });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      {
        error: aborted
          ? "El servicio de OpenStreetMap tardó demasiado"
          : "No se pudo consultar OpenStreetMap (servidor ocupado o sin conexión)",
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}
