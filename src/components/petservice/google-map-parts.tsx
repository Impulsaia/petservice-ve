"use client";

/**
 * PetService VE — Mapa con Google Maps (vista de prueba)
 *
 * GoogleMapPanel reemplaza el mapa SVG clásico por Google Maps real:
 * - Mapa "filtrado a servicios de mascotas": POIs genéricos ocultos; solo se
 *   muestran los prestadores de la plataforma (+ negocios de mascotas de
 *   Google Places si se activa el toggle 🐾)
 * - Pin de búsqueda arrastrable + toque/click para mover la búsqueda
 * - Círculo de radio, sector enfatizado, chips de ciudad, leyenda
 * - InfoWindow con "Ver perfil" y "Cómo llegar" (Google Maps)
 *
 * SmartMapPanel elige el motor: Google si hay clave (DB o env), mapa clásico
 * como respaldo (sin clave, o si el usuario lo elige tras un error).
 */

import { useEffect, useRef, useState } from "react";
import { PawPrint, Star, Navigation, LocateFixed, TriangleAlert, RotateCcw, Map as MapIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { categoryMeta, CITIES, ZONES } from "@/lib/petservice/constants";
import { fmtUsd, fmtBs } from "@/lib/petservice/format";
import { getCityBounds, haversineKm, CITY_BOUNDS, type LatLng } from "@/lib/petservice/geo";
import { useAppStore } from "@/lib/petservice/store";
import { toast } from "sonner";
import {
  loadGoogleMaps,
  resetGoogleMapsLoader,
  setMapsAuthFailureHandler,
  PET_FILTERED_MAP_STYLES,
  PIN_HEX,
  providerPinIcon,
  searchPinIcon,
  petPoiIcon,
  VENEZUELA_CENTER,
} from "@/lib/petservice/google-maps";
import { MapPanel, type MapSectorPin, type ProviderListItem } from "@/components/petservice/marketplace-parts";
import { OsmMapPanel } from "@/components/petservice/osm-map-parts";
import { fmtDrive } from "@/lib/petservice/routing";
import { providerRank } from "@/components/petservice/marketplace-parts";

// ───────────────────────── GoogleMapPanel ─────────────────────────

export interface MapEngineProps {
  providers: ProviderListItem[];
  rate: number;
  sector?: MapSectorPin | null;
  /** ciudad activa sin prestadores → overlay "Próximamente" centrado en la ciudad real */
  vacant?: { name: string; state: string; lat?: number; lng?: number } | null;
}

interface GoogleMapPanelProps extends MapEngineProps {
  apiKey: string;
  /** vuelve al mapa clásico (error de Google o elección del usuario) */
  onFallback: () => void;
}

type Status = "loading" | "ready" | "error";

const TEAL = "#0f766e";

/** etiqueta amigable para un punto: zona exacta, "cerca de" o la ciudad */
function labelForPoint(ll: LatLng, city: string): string {
  let best: { name: string; d: number } | null = null;
  for (const z of ZONES) {
    if (z.city !== city) continue;
    const d = haversineKm(ll, z);
    if (!best || d < best.d) best = { name: z.name, d };
  }
  if (!best) return city;
  if (best.d < 0.4) return best.name;
  return `Cerca de ${best.name}`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function GoogleMapPanel({ providers, rate, sector, vacant, apiKey, onFallback }: GoogleMapPanelProps) {
  const loc = useAppStore((s) => s.loc);
  const setLoc = useAppStore((s) => s.setLoc);
  const city = useAppStore((s) => s.city);
  const setCity = useAppStore((s) => s.setCity);
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const openProvider = useAppStore((s) => s.openProvider);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [petOn, setPetOn] = useState(false);
  const [petCount, setPetCount] = useState(0);
  const [petLoading, setPetLoading] = useState(false);

  const providerMarkersRef = useRef<google.maps.Marker[]>([]);
  const petMarkersRef = useRef<google.maps.Marker[]>([]);
  const searchMarkerRef = useRef<google.maps.Marker | null>(null);
  const userCircleRef = useRef<google.maps.Circle | null>(null);
  const sectorCircleRef = useRef<google.maps.Circle | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // props frescas para callbacks de Google (evita re-crear listeners)
  const fresh = useRef({ loc, city, openProvider, providers, sector, vacant });
  useEffect(() => {
    fresh.current = { loc, city, openProvider, providers, sector, vacant };
  });

  /** centra la cámara según la ciudad activa (o vista nacional) */
  function fitCamera() {
    const map = mapRef.current;
    if (!map) return;
    const { city: c, providers: ps, vacant: v } = fresh.current;
    if (CITY_BOUNDS[c]) {
      const b = getCityBounds(c);
      map.fitBounds(
        new google.maps.LatLngBounds({ lat: b.minLat, lng: b.minLng }, { lat: b.maxLat, lng: b.maxLng }),
        14
      );
      return;
    }
    if (ps.length > 0) {
      const b = new google.maps.LatLngBounds();
      ps.forEach((p) => b.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(b, 40);
      return;
    }
    if (v?.lat != null && v?.lng != null) {
      map.panTo({ lat: v.lat, lng: v.lng });
      map.setZoom(13);
      return;
    }
    map.panTo(VENEZUELA_CENTER);
    map.setZoom(5.4);
  }

  function commitSearchAt(ll: LatLng) {
    const label = labelForPoint(ll, fresh.current.city);
    setLoc({ label, lat: ll.lat, lng: ll.lng });
    toast.success(`📍 Búsqueda movida a ${label}`, { duration: 2500 });
  }

  // ─── Init: cargar script + crear mapa ───
  // (el estado inicial ya es "loading"; el reintento resetea el estado en su handler)
  useEffect(() => {
    let cancelled = false;

    setMapsAuthFailureHandler(() => {
      setStatus("error");
      setErrorMsg("Google rechazó la clave (inválida, sin facturación o restringida a otro dominio).");
    });

    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        const map = new maps.Map(containerRef.current, {
          center: fresh.current.loc,
          zoom: 13,
          styles: PET_FILTERED_MAP_STYLES,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: maps.ControlPosition.RIGHT_BOTTOM },
          gestureHandling: "greedy",
          clickableIcons: false, // sin popups de POIs genéricos: todo filtrado a mascotas
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        mapRef.current = map;
        infoWindowRef.current = new maps.InfoWindow({ maxWidth: 300 });

        // acción usada desde el HTML de los InfoWindow
        window.__psOpenProvider = (id) => fresh.current.openProvider(id);

        // Toque/click en el mapa → mover la búsqueda (con delay para no chocar con el doble click)
        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          const ll = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          searchMarkerRef.current?.setPosition(ll);
          if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
          clickTimerRef.current = setTimeout(() => commitSearchAt(ll), 260);
        });
        // Doble click → zoom de Google; cancela el commit y devuelve el pin a su sitio
        map.addListener("dblclick", () => {
          if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current);
            clickTimerRef.current = null;
          }
          searchMarkerRef.current?.setPosition(fresh.current.loc);
        });

        fitCamera();
        setStatus("ready");
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(err?.message || "No se pudo cargar Google Maps");
      });

    return () => {
      cancelled = true;
      setMapsAuthFailureHandler(null);
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      infoWindowRef.current?.close();
    };
  }, [apiKey, attempt]);

  // ─── Cámara al cambiar de ciudad (o al quedar listo) ───
  useEffect(() => {
    if (status !== "ready") return;
    fitCamera();
  }, [status, city, vacant?.name]);

  // ─── Pines de prestadores ───
  useEffect(() => {
    const mapsLib = window.google?.maps;
    const map = mapRef.current;
    if (status !== "ready" || !mapsLib || !map) return;

    providerMarkersRef.current.forEach((m) => m.setMap(null));
    providerMarkersRef.current = [];

    for (const p of providers) {
      const cm = categoryMeta(p.serviceCategories[0] ?? "OTROS");
      const rank = providerRank(p);
      const marker = new mapsLib.Marker({
        map,
        position: { lat: p.lat, lng: p.lng },
        icon: providerPinIcon(PIN_HEX[cm.key] ?? PIN_HEX.OTROS, cm.emoji, { top: rank.top, double: rank.double }),
        title: `${p.businessName}${p.driveMin != null ? ` · 🚗 ~${p.driveMin} min` : p.distanceKm !== null ? ` · ${p.distanceKm.toFixed(1)} km` : ""}`,
        zIndex: 10,
      });
      marker.addListener("click", () => {
        const iw = infoWindowRef.current;
        if (!iw) return;
        const verified = p.status === "VERIFIED" || p.badges.includes("VERIFICADO");
        const real = p.badges.includes("REAL");
        const price = p.minPriceUsd;
        const driveTxt =
          p.driveMin != null && p.driveKm != null
            ? `<div style="font-size:11.5px;color:#0f766e;font-weight:800;margin-top:3px">🚗 ${fmtDrive(p.driveKm, p.driveMin)} en carro</div>`
            : "";
        iw.setContent(
          `<div style="min-width:212px;font-family:inherit">` +
            `<div style="display:flex;gap:9px;align-items:center">` +
              `<div style="font-size:24px;line-height:1">${cm.emoji}</div>` +
              `<div style="min-width:0">` +
                `<div style="font-weight:800;font-size:13.5px;color:#18181b;line-height:1.25">${esc(p.businessName)}` +
                (real ? ` <span style="background:#99f6e4;color:#115e59;font-size:9.5px;font-weight:900;border-radius:9999px;padding:1px 5px;vertical-align:2px">Real</span>` : "") +
                (verified ? ` <span title="Verificado" style="color:#059669;font-size:12px">✔</span>` : "") +
                (rank.top ? ` <span title="4+ estrellas en Google Maps" style="background:#fef3c7;color:#92400e;font-size:9.5px;font-weight:900;border-radius:9999px;padding:1px 5px;vertical-align:2px">⭐ ${rank.google.toFixed(1)}</span>` : "") +
                `</div>` +
                `<div style="font-size:11px;color:#71717a;margin-top:2px">★ ${p.ratingAvg.toFixed(1)} (${p.ratingCount}) · ${esc(p.zoneName)}` +
                `</div>` +
                driveTxt +
              `</div>` +
            `</div>` +
            (price !== null
              ? `<div style="margin-top:7px;font-size:12px;color:#3f3f46">Desde <b>${fmtUsd(price)}</b> · <span style="color:#71717a">${fmtBs(price * rate)}</span></div>`
              : "") +
            `<div style="display:flex;gap:6px;margin-top:9px">` +
              `<button onclick="__psOpenProvider('${esc(p.id)}')" style="flex:1;background:${TEAL};color:#fff;border:0;border-radius:10px;padding:7px 10px;font-size:12px;font-weight:800;cursor:pointer">Ver perfil</button>` +
              `<a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noopener" style="flex:1;text-align:center;border:1.5px solid #d4d4d8;color:#3f3f46;border-radius:10px;padding:6px 10px;font-size:12px;font-weight:800;text-decoration:none;background:#fff">Cómo llegar</a>` +
            `</div>` +
          `</div>`
        );
        iw.open({ map, anchor: marker });
      });
      providerMarkersRef.current.push(marker);
    }
  }, [providers, status, rate]);

  // ─── Pin de búsqueda (arrastrable) ───
  useEffect(() => {
    const mapsLib = window.google?.maps;
    const map = mapRef.current;
    if (status !== "ready" || !mapsLib || !map) return;
    if (!searchMarkerRef.current) {
      const m = new mapsLib.Marker({
        map,
        position: fresh.current.loc,
        icon: searchPinIcon(),
        draggable: true,
        title: "Arrástrame para mover la búsqueda",
        zIndex: 100,
      });
      m.addListener("dragend", (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        commitSearchAt({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      });
      m.addListener("click", () => {
        toast("🖐️ Arrástrame o toca el mapa para mover la búsqueda", { duration: 2200 });
      });
      searchMarkerRef.current = m;
    } else {
      searchMarkerRef.current.setPosition(loc);
    }
  }, [loc, status]);

  // ─── Círculos de radio (usuario + sector) ───
  useEffect(() => {
    const mapsLib = window.google?.maps;
    const map = mapRef.current;
    if (status !== "ready" || !mapsLib || !map) return;

    if (!userCircleRef.current) {
      userCircleRef.current = new mapsLib.Circle({
        map,
        strokeColor: TEAL,
        strokeOpacity: 0.45,
        strokeWeight: 2,
        fillColor: TEAL,
        fillOpacity: 0.07,
        clickable: false,
      });
    }
    if (!sectorCircleRef.current) {
      sectorCircleRef.current = new mapsLib.Circle({
        map,
        strokeColor: TEAL,
        strokeOpacity: 0.8,
        strokeWeight: 2.5,
        fillColor: TEAL,
        fillOpacity: 0.16,
        clickable: false,
      });
    }
    const radiusM = Math.max(300, filters.radiusKm * 1000);
    userCircleRef.current.setCenter({ lat: loc.lat, lng: loc.lng });
    userCircleRef.current.setRadius(radiusM);
    userCircleRef.current.setOptions({ visible: !sector });
    if (sector) {
      sectorCircleRef.current.setCenter({ lat: sector.lat, lng: sector.lng });
      sectorCircleRef.current.setRadius(radiusM);
      sectorCircleRef.current.setOptions({ visible: true });
    } else {
      sectorCircleRef.current.setOptions({ visible: false });
    }
  }, [loc, filters.radiusKm, sector, status]);

  // ─── Toggle: negocios de mascotas cercanos (Places API New: Place.searchNearby) ───
  // (los estados petOn/petLoading/petCount se resetean en los handlers; aquí solo
  //  sincronizamos los marcadores con el sistema externo de Google)
  useEffect(() => {
    const mapsLib = window.google?.maps;
    const map = mapRef.current;
    if (status !== "ready" || !mapsLib || !map) return;

    petMarkersRef.current.forEach((m) => m.setMap(null));
    petMarkersRef.current = [];
    if (!petOn) return;

    let cancelled = false;
    (async () => {
      try {
        // Places API (New) — obligatoria para clientes nuevos de Google (mar 2025+)
        const { Place } = (await mapsLib.importLibrary("places")) as google.maps.PlacesLibrary;
        const center = map.getCenter();
        const radiusM = Math.min(50000, Math.max(1000, filters.radiusKm * 1000));
        if (!center) return;
        const { places = [] } = await Place.searchNearby({
          fields: ["id", "displayName", "location", "rating", "userRatingCount", "googleMapsURI"],
          maxResultCount: 24,
          locationRestriction: { center: { lat: center.lat(), lng: center.lng() }, radius: radiusM },
          includedTypes: ["veterinary_care", "pet_store"],
        });
        if (cancelled) return;
        setPetLoading(false);

        const iw = infoWindowRef.current;
        for (const place of places) {
          if (!place.location) continue;
          const marker = new mapsLib.Marker({
            map,
            position: place.location,
            icon: petPoiIcon(),
            title: place.displayName ?? "Negocio de mascotas",
            zIndex: 5,
          });
          marker.addListener("click", () => {
            if (!iw) return;
            const rating = place.rating ? `★ ${place.rating.toFixed(1)}${place.userRatingCount ? ` (${place.userRatingCount})` : ""}` : "Sin reseñas aún";
            iw.setContent(
              `<div style="min-width:190px;font-family:inherit">` +
                `<div style="font-weight:800;font-size:13px;color:#18181b;line-height:1.3">🐾 ${esc(place.displayName ?? "Negocio de mascotas")}</div>` +
                `<div style="font-size:11px;color:#71717a;margin-top:2px">${rating} · veterinaria / tienda (Google)</div>` +
                (place.googleMapsURI
                  ? `<a href="${esc(place.googleMapsURI)}" target="_blank" rel="noopener" style="display:block;text-align:center;margin-top:8px;border:1.5px solid #d4d4d8;color:#3f3f46;border-radius:10px;padding:5px 8px;font-size:11.5px;font-weight:800;text-decoration:none;background:#fff">Abrir en Google Maps</a>`
                  : "") +
                `<div style="font-size:10.5px;color:#a1a1aa;margin-top:7px">¿Es tu negocio? 🐾 <a href="/#prestadores" style="color:${TEAL};font-weight:800;text-decoration:none">Regístrate gratis</a></div>` +
              `</div>`
            );
            iw.open({ map, anchor: marker });
          });
          petMarkersRef.current.push(marker);
        }
        setPetCount(places.length);
        if (places.length === 0) toast("No encontramos negocios de mascotas en el radio visible de esta zona", { duration: 2600 });
      } catch (err) {
        if (cancelled) return;
        setPetLoading(false);
        const msg = err instanceof Error ? err.message : String(err ?? "");
        if (msg.includes("REQUEST_DENIED") || msg.includes("denied")) {
          toast.error("Google Places no está habilitado para tu clave: activa “Places API (New)” en Google Cloud", { duration: 6000 });
        } else {
          toast.error("No se pudo buscar negocios de mascotas en Google", { duration: 4000 });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [petOn, status]);

  // ─── Acciones de overlays ───
  function switchCity(name: string) {
    const zone = ZONES.find((z) => z.city === name);
    setCity(name, zone ? { label: zone.name, lat: zone.lat, lng: zone.lng } : undefined);
    setFilters({ zone: null });
    // los negocios de mascotas se buscan de nuevo en la nueva ciudad (off → re-toggle)
    setPetOn(false);
    setPetCount(0);
    setPetLoading(false);
  }
  function recenter() {
    const map = mapRef.current;
    if (!map) return;
    map.panTo({ lat: loc.lat, lng: loc.lng });
    if (map.getZoom()! < 13) map.setZoom(13);
  }
  function togglePets() {
    const next = !petOn;
    setPetOn(next);
    setPetCount(0);
    setPetLoading(next);
  }
  function retry() {
    resetGoogleMapsLoader();
    setStatus("loading");
    setErrorMsg("");
    setAttempt((a) => a + 1);
  }

  const national = !CITY_BOUNDS[city];

  return (
    <div className="relative h-full min-h-[420px] select-none overflow-hidden rounded-3xl border border-border/70 shadow-warm">
      {/* Contenedor de Google Maps */}
      <div ref={containerRef} className="absolute inset-0" aria-label={`Mapa de Google con prestadores de ${city}`} role="application" />

      {/* Overlay "Próximamente" sobre la ciudad real */}
      {vacant && status === "ready" && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="max-w-xs rounded-2xl border border-border/50 bg-background/90 px-4 py-3 text-center shadow-lg backdrop-blur-md">
            <p className="font-display text-sm font-black">🚧 {vacant.name} — Próximamente</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Estamos certificando prestadores en {vacant.state}… ¡Sé el primero!
            </p>
          </div>
        </div>
      )}

      {/* Chips de ciudad */}
      {status === "ready" && !vacant && (
        <div className="absolute inset-x-3 top-3 z-20 flex flex-wrap gap-1.5" role="tablist" aria-label="Ciudad del mapa">
          {CITIES.map((c) => (
            <button
              key={c.name}
              role="tab"
              aria-selected={city === c.name}
              onClick={() => switchCity(c.name)}
              className={cn(
                "rounded-xl px-3 py-1.5 text-[11px] font-black shadow-md backdrop-blur-md transition-all active:scale-95",
                city === c.name
                  ? "bg-primary text-primary-foreground shadow-primary/20"
                  : "bg-background/85 text-muted-foreground ring-1 ring-border/50 hover:bg-background hover:text-foreground"
              )}
            >
              {c.emoji} {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Botones propios (centrar + toggle mascotas) */}
      {status === "ready" && (
        <div className="absolute bottom-24 right-3 z-20 flex flex-col gap-1.5">
          <button
            onClick={recenter}
            className="flex h-9 w-9 items-center justify-center rounded-2xl border border-border/50 bg-background/90 shadow-lg backdrop-blur-md transition-all hover:bg-background active:scale-95"
            aria-label="Centrar en mi ubicación de búsqueda"
            title="Centrar en mi ubicación de búsqueda"
          >
            <LocateFixed className="h-4 w-4 text-accent-foreground" />
          </button>
          <button
            onClick={togglePets}
            disabled={petLoading}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-2xl border px-2.5 shadow-lg backdrop-blur-md transition-all active:scale-95 disabled:opacity-70",
              petOn ? "border-primary bg-primary text-primary-foreground" : "border-border/50 bg-background/90 hover:bg-background"
            )}
            aria-pressed={petOn}
            aria-label="Mostrar negocios de mascotas en Google (veterinarias y tiendas)"
            title="Negocios de mascotas según Google (veterinarias 🏥 y tiendas 🏪)"
          >
            {petLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PawPrint className="h-4 w-4" />}
            <span className="text-[10px] font-black leading-none">Mascotas</span>
            {petOn && petCount > 0 && (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-black", petOn ? "bg-primary-foreground/20" : "bg-muted")}>{petCount}</span>
            )}
          </button>
        </div>
      )}

      {/* Leyenda */}
      {status === "ready" && (
        <div className="pointer-events-none absolute bottom-3 left-3 right-16 z-20 flex items-center justify-between gap-2 rounded-2xl border border-border/50 bg-background/85 px-3 py-2 text-[11px] font-semibold shadow-lg backdrop-blur-md">
          <span className="flex min-w-0 items-center gap-1.5">
            <Navigation className="h-3 w-3 shrink-0 text-accent-foreground" />
            <span className="truncate">{vacant ? `${vacant.name}, ${vacant.state}` : loc.label}</span>
            {sector && (
              <span className="hidden shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black text-primary sm:inline-flex">
                🏘️ {sector.name}
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-3 text-muted-foreground">
            <span className="hidden items-center gap-1 md:flex">👆 Toca o arrastra el mapa</span>
            <span className="flex items-center gap-1">
              <PawPrint className="h-3 w-3 text-primary" /> {providers.length}
            </span>
            <span className="hidden items-center gap-1 sm:flex">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> 4.5+
            </span>
          </span>
        </div>
      )}

      {/* Tarjeta de precio de referencia */}
      {status === "ready" && (
        <div className="pointer-events-none absolute bottom-12 right-3 z-10 rounded-2xl border border-border/50 bg-background/90 px-2.5 py-1.5 text-[10px] font-bold shadow-lg backdrop-blur-md">
          🛁 Spa desde {fmtUsd(15)} · {fmtBs(15 * rate)}
        </div>
      )}

      {/* Estado: cargando */}
      {status === "loading" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-xs font-bold text-muted-foreground">Cargando Google Maps…</p>
        </div>
      )}

      {/* Estado: error → respaldo al mapa clásico */}
      {status === "error" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-5">
          <div className="max-w-sm rounded-2xl border border-border/60 bg-card p-5 text-center shadow-xl">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/60">
              <TriangleAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </span>
            <h3 className="mt-3 font-display text-base font-black">Google Maps no está disponible</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{errorMsg}</p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={retry}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-black text-primary-foreground transition-all hover:bg-primary/90 active:scale-95"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reintentar
              </button>
              <button
                onClick={onFallback}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-2 text-xs font-black transition-all hover:bg-muted active:scale-95"
              >
                <MapIcon className="h-3.5 w-3.5" /> Usar mapa clásico
              </button>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground/80">
              Verifica en Google Cloud: Maps JavaScript API + Places API (New) activas, facturación habilitada y el dominio permitido en la restricción de la clave.
            </p>
          </div>
        </div>
      )}

      {/* Sello del motor activo (discreto, para la prueba) */}
      {status === "ready" && (
        <div className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border/40 bg-background/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-muted-foreground shadow backdrop-blur-md" title={national ? "Vista nacional con Google Maps" : "Google Maps filtrado a servicios de mascotas"}>
          🗺️ Google
        </div>
      )}
    </div>
  );
}

// ───────────────────────── SmartMapPanel ─────────────────────────

/**
 * Elige el motor del mapa:
 * - "google" SOLO si hay clave (Settings.gmapsApiKey o NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
 *   — requiere facturación en Google Cloud (tarjeta de crédito)
 * - "osm" (OpenStreetMap + Leaflet) por defecto — mapa real 100% gratis,
 *   sin tarjeta, sin clave: la experiencia tipo Google sin costos
 * - "classic" (MapPanel SVG) como respaldo si el usuario lo elige tras un
 *   error (solo durante la sesión de la página; al recargar se reintenta)
 */
export function SmartMapPanel({
  gmapsKey,
  ...props
}: MapEngineProps & { gmapsKey?: string | null }) {
  const envKey = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "").trim();
  const key = ((gmapsKey ?? "").trim() || envKey).trim();
  const [forcedClassic, setForcedClassic] = useState(false);

  // Motor derivado: cuando la clave llega (settings async) cambia solo, sin efectos
  if (key && !forcedClassic) {
    return (
      <GoogleMapPanel
        key={key}
        apiKey={key}
        onFallback={() => setForcedClassic(true)}
        {...props}
      />
    );
  }
  // Sin clave de Google (o tras un error): mapa real OpenStreetMap — gratis
  if (!forcedClassic) {
    return <OsmMapPanel onFallback={() => setForcedClassic(true)} {...props} />;
  }
  return <MapPanel {...props} />;
}
