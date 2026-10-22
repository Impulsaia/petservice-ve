/**
 * PetService VE — Geolocalización (SQLite sin PostGIS → Haversine en JS)
 * Cobertura: Estado Bolívar — Puerto Ordaz, San Félix, Ciudad Bolívar y Upata
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Distancia en km entre dos coordenadas */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ─────────────── Ciudades y bounds para los mapas SVG ───────────────

export interface CityBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  /** ancho/alto reales del mapa en km (para escalar el radio de búsqueda) */
  kmWide: number;
  kmTall: number;
}

export const CITY_BOUNDS: Record<string, CityBounds> = {
  "Puerto Ordaz": {
    minLat: 8.235,
    maxLat: 8.312,
    minLng: -62.825,
    maxLng: -62.7,
    kmWide: 13.9,
    kmTall: 8.6,
  },
  "San Félix": {
    minLat: 8.2,
    maxLat: 8.278,
    minLng: -62.855,
    maxLng: -62.695,
    kmWide: 17.3,
    kmTall: 8.7,
  },
  "Ciudad Bolívar": {
    minLat: 8.095,
    maxLat: 8.15,
    minLng: -63.58,
    maxLng: -63.515,
    kmWide: 7.2,
    kmTall: 6.1,
  },
  Upata: {
    minLat: 7.993,
    maxLat: 8.038,
    minLng: -62.43,
    maxLng: -62.383,
    kmWide: 5.2,
    kmTall: 5.0,
  },
};

export const DEFAULT_CITY = "Puerto Ordaz";

export function getCityBounds(city: string): CityBounds {
  return CITY_BOUNDS[city] ?? CITY_BOUNDS[DEFAULT_CITY];
}

/** Proyecta lat/lng a porcentaje (0-100) dentro del mapa SVG de una ciudad */
export function projectToMap(p: LatLng, city: string = DEFAULT_CITY): { x: number; y: number; inBounds: boolean } {
  const { minLat, maxLat, minLng, maxLng } = getCityBounds(city);
  const inBounds = p.lat >= minLat && p.lat <= maxLat && p.lng >= minLng && p.lng <= maxLng;
  const x = ((p.lng - minLng) / (maxLng - minLng)) * 100;
  const y = (1 - (p.lat - minLat) / (maxLat - minLat)) * 100;
  return { x: Math.max(2, Math.min(98, x)), y: Math.max(3, Math.min(97, y)), inBounds };
}

/** Etiqueta de distancia legible */
export function fmtDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}
