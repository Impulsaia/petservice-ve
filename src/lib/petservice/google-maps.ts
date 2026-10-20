/**
 * PetService VE — Carga y utilidades de Google Maps JavaScript API
 *
 * - Loader singleton con detección de errores (key inválida, cuota, red)
 * - Estilos de mapa "filtrado a mascotas": oculta POIs genéricos (restaurants,
 *   tiendas, hoteles…), conserva parques y vías — solo se muestran nuestros
 *   prestadores y (opcional) negocios de mascotas de Google Places
 * - Iconos SVG de pines (prestador por categoría, búsqueda, places)
 */

export class MapsAuthError extends Error {
  constructor(msg = "Google rechazó la clave de API (inválida, sin billing o con restricciones de dominio)") {
    super(msg);
    this.name = "MapsAuthError";
  }
}
export class MapsNetworkError extends Error {
  constructor(msg = "No se pudo cargar Google Maps (revisa tu conexión)") {
    super(msg);
    this.name = "MapsNetworkError";
  }
}

type Gmaps = typeof google.maps;

let loadPromise: Promise<Gmaps> | null = null;
let loadedKey: string | null = null;
let authFailureHandler: (() => void) | null = null;

/** Registra un callback que se dispara cuando Google rechaza la autenticación (en vivo, tras cargar) */
export function setMapsAuthFailureHandler(fn: (() => void) | null) {
  authFailureHandler = fn;
}

declare global {
  interface Window {
    gm_authFailure?: () => void;
    __psGmapsReady?: () => void;
    __psOpenProvider?: (id: string) => void;
  }
}

/** Inyecta (una sola vez) el script oficial y resuelve con `google.maps` */
export function loadGoogleMaps(key: string, timeoutMs = 12000): Promise<Gmaps> {
  if (loadPromise && loadedKey === key) return loadPromise;
  if (loadPromise && loadedKey !== key) resetGoogleMapsLoader();

  loadedKey = key;
  loadPromise = new Promise<Gmaps>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new MapsNetworkError("Google Maps solo está disponible en el navegador"));
      return;
    }
    // Ya cargado con esta key
    if (window.google?.maps?.Map) {
      resolve(window.google.maps);
      return;
    }

    let settled = false;
    let authFailed = false;

    window.gm_authFailure = () => {
      authFailed = true;
      authFailureHandler?.();
      if (!settled) {
        settled = true;
        reject(new MapsAuthError());
      }
    };
    window.__psGmapsReady = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (authFailed) {
        reject(new MapsAuthError());
        return;
      }
      if (window.google?.maps?.Map) resolve(window.google.maps);
      else reject(new MapsNetworkError("Google Maps no devolvió la API esperada"));
    };

    const script = document.createElement("script");
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
      `&callback=__psGmapsReady&v=weekly&language=es&region=VE&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new MapsNetworkError());
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new MapsNetworkError("Google Maps tardó demasiado en responder"));
    }, timeoutMs);

    document.head.appendChild(script);
  });

  loadPromise.catch(() => {
    // Permitir reintento tras un fallo
    loadPromise = null;
    loadedKey = null;
  });
  return loadPromise;
}

/** Limpia el cache del loader (para "Reintentar") */
export function resetGoogleMapsLoader() {
  loadPromise = null;
  loadedKey = null;
  document.querySelector("script[src*='maps.googleapis.com/maps/api/js']")?.remove();
}

// ───────────────────────── Estilos del mapa ─────────────────────────

/**
 * Mapa "filtrado a servicios de mascotas": sin POIs comerciales genéricos
 * (restaurantes, tiendas, hoteles, transporte…) para que solo destaquen los
 * prestadores de la plataforma (y los negocios de mascotas si se activan).
 * Los parques quedan encendidos (útil para paseos) y el resto es limpio.
 */
export const PET_FILTERED_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", stylers: [{ visibility: "on" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ saturation: -8 }, { lightness: 4 }] },
  { featureType: "water", elementType: "geometry", stylers: [{ saturation: -12 }, { lightness: 8 }] },
];

// ───────────────────────── Iconos SVG (data URL) ─────────────────────────

/** Color sólido por categoría (equivalente a los gradientes del mapa clásico) */
export const PIN_HEX: Record<string, string> = {
  GROOMING: "#0d9488",
  DELIVERY: "#ea580c",
  PET_SITTING: "#d97706",
  DOG_WALKING: "#059669",
  TRAINING: "#e11d48",
  PET_TAXI: "#ca8a04",
  SPA_MOVIL: "#c026d3",
  VET: "#7c3aed",
  OTROS: "#0f766e",
};

/** Pin "gota" con emoji, coloreado por categoría (ancla en la punta) */
export function providerPinIcon(hex: string, emoji: string): google.maps.Symbol | string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="46" viewBox="0 0 34 46">` +
    `<path d="M17 1C8.2 1 1 8.2 1 17c0 9.4 9.2 18.6 14.1 26.1a2.2 2.2 0 0 0 3.8 0C23.8 35.6 33 26.4 33 17 33 8.2 25.8 1 17 1Z" ` +
    `fill="${hex}" stroke="#ffffff" stroke-width="2.5"/>` +
    `<circle cx="17" cy="16.5" r="10.5" fill="rgba(255,255,255,0.22)"/>` +
    `<text x="17" y="21.5" font-size="13" text-anchor="middle">${emoji}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Punto ámbar de la ubicación de búsqueda (ancla al centro) */
export function searchPinIcon(): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">` +
    `<circle cx="11" cy="11" r="10" fill="rgba(245,158,11,0.28)"/>` +
    `<circle cx="11" cy="11" r="6.5" fill="#f59e0b" stroke="#ffffff" stroke-width="3"/>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Marcador pequeño de negocio de mascotas (Google Places) */
export function petPoiIcon(): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">` +
    `<circle cx="14" cy="14" r="12" fill="#ffffff" stroke="#0f766e" stroke-width="2.5"/>` +
    `<text x="14" y="19" font-size="13" text-anchor="middle">🐾</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ───────────────────────── Geografía ─────────────────────────

export const VENEZUELA_CENTER = { lat: 7.6, lng: -66.0 };
