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

/**
 * Bounds reales de TODAS las ciudades del catálogo nacional (tabla City +
 * extensión de los prestadores verificados de cada ciudad, con margen).
 * Generado desde la DB — permite que el mapa encuadre CUALQUIER ciudad al
 * cambiarla, sin esperar el refetch async de prestadores (bug «el mapa se
 * queda en la ciudad anterior»).
 */
export const NATIONAL_CITY_BOUNDS: Record<string, CityBounds> = {
  Barcelona: { minLat: 10.0739, maxLat: 10.202, minLng: -64.7715, maxLng: -64.6441, kmWide: 14, kmTall: 14.2 },
  Barinas: { minLat: 8.5877, maxLat: 8.7949, minLng: -70.4456, maxLng: -70.1781, kmWide: 29.3, kmTall: 23 },
  Barquisimeto: { minLat: 9.9845, maxLat: 10.1163, minLng: -69.3849, maxLng: -69.2465, kmWide: 15.2, kmTall: 14.6 },
  Caracas: { minLat: 10.2772, maxLat: 10.6694, minLng: -67.147, maxLng: -66.5128, kmWide: 69.4, kmTall: 43.5 },
  "Ciudad Bolívar": { minLat: 8.078, maxLat: 8.1744, minLng: -63.6184, maxLng: -63.4917, kmWide: 13.9, kmTall: 10.7 },
  "El Tigre": { minLat: 8.8355, maxLat: 8.9492, minLng: -64.2986, maxLng: -64.1474, kmWide: 16.6, kmTall: 12.6 },
  Guanare: { minLat: 9.0003, maxLat: 9.0703, minLng: -69.7806, maxLng: -69.7106, kmWide: 7.7, kmTall: 7.8 },
  "La Guaira": { minLat: 10.4498, maxLat: 10.5198, minLng: -66.9765, maxLng: -66.9065, kmWide: 7.7, kmTall: 7.8 },
  Maracaibo: { minLat: 10.4848, maxLat: 10.7358, minLng: -71.8946, maxLng: -71.5516, kmWide: 37.6, kmTall: 27.9 },
  Maracay: { minLat: 10.1611, maxLat: 10.2311, minLng: -67.4973, maxLng: -67.4273, kmWide: 7.7, kmTall: 7.8 },
  Maturín: { minLat: 9.6876, maxLat: 9.82, minLng: -63.2306, maxLng: -63.0967, kmWide: 14.7, kmTall: 14.7 },
  Mérida: { minLat: 8.5589, maxLat: 8.6289, minLng: -71.1923, maxLng: -71.1223, kmWide: 7.7, kmTall: 7.8 },
  Porlamar: { minLat: 10.9569, maxLat: 11.0269, minLng: -63.8679, maxLng: -63.7979, kmWide: 7.7, kmTall: 7.8 },
  "Puerto La Cruz": { minLat: 10.0889, maxLat: 10.2568, minLng: -64.7285, maxLng: -64.5954, kmWide: 14.6, kmTall: 18.6 },
  "Puerto Ordaz": { minLat: 8.1889, maxLat: 8.3564, minLng: -62.8696, maxLng: -62.6733, kmWide: 21.5, kmTall: 18.6 },
  "San Cristóbal": { minLat: 7.7473, maxLat: 7.828, minLng: -72.2577, maxLng: -72.165, kmWide: 10.2, kmTall: 9 },
  "San Félix": { minLat: 8.3008, maxLat: 8.4078, minLng: -62.7064, maxLng: -62.596, kmWide: 12.1, kmTall: 11.9 },
  Upata: { minLat: 7.9545, maxLat: 8.0553, minLng: -62.4579, maxLng: -62.3523, kmWide: 11.6, kmTall: 11.2 },
};

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
  return CITY_BOUNDS[city] ?? NATIONAL_CITY_BOUNDS[city] ?? CITY_BOUNDS[DEFAULT_CITY];
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
