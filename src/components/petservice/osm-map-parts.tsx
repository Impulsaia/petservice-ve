"use client";

/**
 * PetService VE — Mapa real con OpenStreetMap (Leaflet) — 100% GRATIS
 *
 * OsmMapPanel es el motor de mapa real por defecto (sin tarjeta, sin clave de
 * API, sin facturación). Replica la experiencia del panel de Google Maps:
 * - Mapa real de calles (tiles OpenStreetMap) con pines de prestadores por
 *   categoría, popup con "Ver perfil" y "Cómo llegar" (abre Google Maps —
 *   los ENLACES a Google Maps son gratis; solo la API embebida cuesta)
 * - Pin de búsqueda arrastrable + toque/click para mover la búsqueda
 * - Círculo de radio, sector enfatizado, chips de ciudad, leyenda
 * - Toggle 🐾 Mascotas: negocios de mascotas reales según OpenStreetMap
 *   (veterinarias, tiendas, peluquerías, parques caninos) vía Overpass API
 *   (gratuita y pública)
 *
 * El motor se elige en SmartMapPanel (google-map-parts.tsx): Google solo si
 * el admin configura una clave; OpenStreetMap para todos los demás.
 */

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as LeafletTypes from "leaflet";
import { PawPrint, Star, Navigation, LocateFixed, TriangleAlert, RotateCcw, Map as MapIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { categoryMeta, CITIES, ZONES } from "@/lib/petservice/constants";
import { fmtUsd, fmtBs } from "@/lib/petservice/format";
import { getCityBounds, haversineKm, fmtDistance, CITY_BOUNDS, type LatLng } from "@/lib/petservice/geo";
import { fmtDrive } from "@/lib/petservice/routing";
import { providerRank } from "@/components/petservice/marketplace-parts";
import { useAppStore } from "@/lib/petservice/store";
import { toast } from "sonner";
import {
  PIN_HEX,
  providerPinIcon,
  searchPinIcon,
  petPoiIcon,
  VENEZUELA_CENTER,
} from "@/lib/petservice/google-maps";
import type { MapEngineProps } from "@/components/petservice/google-map-parts";

// ───────────────────────── OsmMapPanel ─────────────────────────

interface OsmMapPanelProps extends MapEngineProps {
  /** vuelve al mapa clásico (error de inicialización o elección del usuario) */
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

/** Elemento de negocio de mascotas que devuelve el proxy /api/geo/pet-pois */
interface PetPoiApi {
  lat: number;
  lng: number;
  name: string;
  kind: string;
}

export function OsmMapPanel({ providers, rate, sector, vacant, onFallback }: OsmMapPanelProps) {
  const loc = useAppStore((s) => s.loc);
  const setLoc = useAppStore((s) => s.setLoc);
  const city = useAppStore((s) => s.city);
  const setCity = useAppStore((s) => s.setCity);
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const openProvider = useAppStore((s) => s.openProvider);

  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const mapRef = useRef<LeafletTypes.Map | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [petOn, setPetOn] = useState(false);
  const [petCount, setPetCount] = useState(0);
  const [petLoading, setPetLoading] = useState(false);

  const providerMarkersRef = useRef<LeafletTypes.Marker[]>([]);
  const petMarkersRef = useRef<LeafletTypes.Marker[]>([]);
  const searchMarkerRef = useRef<LeafletTypes.Marker | null>(null);
  const userCircleRef = useRef<LeafletTypes.Circle | null>(null);
  const sectorCircleRef = useRef<LeafletTypes.Circle | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // props frescas para callbacks de Leaflet (evita re-crear listeners)
  const fresh = useRef({ loc, city, openProvider, providers, sector, vacant });
  useEffect(() => {
    fresh.current = { loc, city, openProvider, providers, sector, vacant };
  });

  /** centra la cámara según la ciudad activa (o vista nacional) */
  function fitCamera() {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const { city: c, providers: ps, vacant: v } = fresh.current;
    const pad = { paddingTopLeft: [14, 56], paddingBottomRight: [14, 84] } as const;
    if (CITY_BOUNDS[c]) {
      const b = getCityBounds(c);
      map.fitBounds([[b.minLat, b.minLng], [b.maxLat, b.maxLng]], { ...pad, maxZoom: 15 });
      return;
    }
    if (ps.length > 0) {
      map.fitBounds(L.latLngBounds(ps.map((p) => [p.lat, p.lng] as [number, number])), { ...pad, maxZoom: 16 });
      return;
    }
    if (v?.lat != null && v?.lng != null) {
      map.setView([v.lat, v.lng], 13);
      return;
    }
    map.setView([VENEZUELA_CENTER.lat, VENEZUELA_CENTER.lng], 5.4);
  }

  function commitSearchAt(ll: LatLng) {
    const label = labelForPoint(ll, fresh.current.city);
    setLoc({ label, lat: ll.lat, lng: ll.lng });
    toast.success(`📍 Búsqueda movida a ${label}`, { duration: 2500 });
  }

  // ─── Init: importar Leaflet + crear mapa ───
  useEffect(() => {
    let cancelled = false;
    let map: LeafletTypes.Map | null = null;
    let ro: ResizeObserver | null = null;

    (async () => {
      try {
        const mod = await import("leaflet");
        // interop robusto CJS/ESM: algunos empaquetadores cuelgan el namespace en .default
        const L = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof import("leaflet");
        if (cancelled || !containerRef.current) return;
        leafletRef.current = L;

        map = L.map(containerRef.current, {
          center: [fresh.current.loc.lat, fresh.current.loc.lng],
          zoom: 13,
          zoomControl: false,
          attributionControl: true,
          worldCopyJump: true,
        });
        mapRef.current = map;

        // recalcular tamaño ante cualquier cambio de contenedor (rotación, pestaña móvil, paneles)
        if (typeof ResizeObserver !== "undefined") {
          ro = new ResizeObserver(() => map?.invalidateSize());
          ro.observe(containerRef.current);
        }

        // Tiles OpenStreetMap (uso permitido con atribución para apps de bajo volumen)
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
        }).addTo(map);

        L.control.zoom({ position: "bottomright" }).addTo(map);

        // acción usada desde el HTML de los popups
        window.__psOpenProvider = (id) => fresh.current.openProvider(id);

        // Toque/click en el mapa → mover la búsqueda (con delay para no chocar con el doble click)
        map.on("click", (e: LeafletTypes.LeafletMouseEvent) => {
          const ll = { lat: e.latlng.lat, lng: e.latlng.lng };
          searchMarkerRef.current?.setLatLng(e.latlng);
          if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
          clickTimerRef.current = setTimeout(() => commitSearchAt(ll), 260);
        });
        // Doble click → zoom de Leaflet; cancela el commit y devuelve el pin a su sitio
        map.on("dblclick", () => {
          if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current);
            clickTimerRef.current = null;
          }
          const loc0 = fresh.current.loc;
          searchMarkerRef.current?.setLatLng([loc0.lat, loc0.lng]);
        });

        fitCamera();
        // por si el contenedor cambió de tamaño mientras importaba
        setTimeout(() => map?.invalidateSize(), 80);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "No se pudo cargar el mapa");
      }
    })();

    return () => {
      cancelled = true;
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      ro?.disconnect();
      map?.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [attempt]);

  // ─── Cámara al cambiar de ciudad (o al quedar listo) ───
  useEffect(() => {
    if (status !== "ready") return;
    fitCamera();
  }, [status, city, vacant?.name]);

  // ─── Pines de prestadores ───
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (status !== "ready" || !L || !map) return;

    providerMarkersRef.current.forEach((m) => m.remove());
    providerMarkersRef.current = [];

    for (const p of providers) {
      const cm = categoryMeta(p.serviceCategories[0] ?? "OTROS");
      const rank = providerRank(p);
      // Halo pulsante dorado para el doble resaltado (4+★ Google Y 4+★ PetService)
      if (rank.double) {
        const halo = L.marker([p.lat, p.lng], {
          icon: L.divIcon({ className: "ps-pin-halo-gold", iconSize: [58, 58] }),
          interactive: false,
          zIndexOffset: 400,
        });
        halo.addTo(map);
        providerMarkersRef.current.push(halo);
      }
      const marker = L.marker([p.lat, p.lng], {
        icon: L.icon({
          iconUrl: providerPinIcon(PIN_HEX[cm.key] ?? PIN_HEX.OTROS, cm.emoji, { top: rank.top, double: rank.double }) as string,
          iconSize: [34, 46],
          iconAnchor: [17, 44],
          popupAnchor: [0, -44],
        }),
        title: `${p.businessName}${p.driveMin != null ? ` · 🚗 ~${p.driveMin} min` : p.distanceKm !== null ? ` · ${p.distanceKm.toFixed(1)} km` : ""}`,
        zIndexOffset: 500,
      });
      const verified = p.status === "VERIFIED" || p.badges.includes("VERIFICADO");
      const isNew = Boolean(p.isNew);
      const price = p.minPriceUsd;
      const driveTxt =
        p.driveMin != null && p.driveKm != null
          ? `🚗 ${fmtDrive(p.driveKm, p.driveMin)} en carro`
          : p.distanceKm !== null
            ? `📍 ${fmtDistance(p.distanceKm)} en línea recta`
            : "";
      marker.bindPopup(
        `<div style="min-width:212px;font-family:inherit">` +
          `<div style="display:flex;gap:9px;align-items:center">` +
            `<div style="font-size:24px;line-height:1">${cm.emoji}</div>` +
            `<div style="min-width:0">` +
              `<div style="font-weight:800;font-size:13.5px;color:#18181b;line-height:1.25">${esc(p.businessName)}` +
              (isNew ? ` <span style="background:#f0abfc;color:#701a75;font-size:9.5px;font-weight:900;border-radius:9999px;padding:1px 5px;vertical-align:2px">✨ Nuevo</span>` : "") +
              (verified ? ` <span title="Verificado" style="color:#059669;font-size:12px">✔</span>` : "") +
              (rank.top ? ` <span title="4+ estrellas en Google Maps" style="background:#fef3c7;color:#92400e;font-size:9.5px;font-weight:900;border-radius:9999px;padding:1px 5px;vertical-align:2px">⭐ ${rank.google.toFixed(1)}</span>` : "") +
              `</div>` +
              `<div style="font-size:11px;color:#71717a;margin-top:2px">★ ${p.ratingAvg.toFixed(1)} (${p.ratingCount}) · ${esc(p.zoneName)}` +
              `</div>` +
              (driveTxt ? `<div style="font-size:11.5px;color:#0f766e;font-weight:800;margin-top:3px">${driveTxt}</div>` : "") +
            `</div>` +
          `</div>` +
          (price !== null
            ? `<div style="margin-top:7px;font-size:12px;color:#3f3f46">Desde <b>${fmtUsd(price)}</b> · <span style="color:#71717a">${fmtBs(price * rate)}</span></div>`
            : "") +
          `<div style="display:flex;gap:6px;margin-top:9px">` +
            `<button onclick="__psOpenProvider('${esc(p.id)}')" style="flex:1;background:${TEAL};color:#fff;border:0;border-radius:10px;padding:7px 10px;font-size:12px;font-weight:800;cursor:pointer">Ver perfil</button>` +
            `<a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noopener" style="flex:1;text-align:center;border:1.5px solid #d4d4d8;color:#3f3f46;border-radius:10px;padding:6px 10px;font-size:12px;font-weight:800;text-decoration:none;background:#fff">Cómo llegar</a>` +
          `</div>`,
        { maxWidth: 300, minWidth: 230 }
      );
      marker.addTo(map);
      providerMarkersRef.current.push(marker);
    }
  }, [providers, status, rate]);

  // ─── Pin de búsqueda (arrastrable) ───
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (status !== "ready" || !L || !map) return;
    if (!searchMarkerRef.current) {
      const m = L.marker([fresh.current.loc.lat, fresh.current.loc.lng], {
        icon: L.icon({ iconUrl: searchPinIcon(), iconSize: [22, 22], iconAnchor: [11, 11] }),
        draggable: true,
        title: "Arrástrame para mover la búsqueda",
        zIndexOffset: 1000,
        keyboard: false,
      });
      m.on("dragend", () => {
        const ll = m.getLatLng();
        commitSearchAt({ lat: ll.lat, lng: ll.lng });
      });
      m.on("click", () => {
        toast("🖐️ Arrástrame o toca el mapa para mover la búsqueda", { duration: 2200 });
      });
      m.addTo(map);
      searchMarkerRef.current = m;
    } else {
      searchMarkerRef.current.setLatLng([loc.lat, loc.lng]);
    }
  }, [loc, status]);

  // ─── Círculos de radio (usuario + sector) ───
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (status !== "ready" || !L || !map) return;

    if (!userCircleRef.current) {
      userCircleRef.current = L.circle([loc.lat, loc.lng], {
        radius: 1000,
        color: TEAL,
        opacity: 0.45,
        weight: 2,
        fillColor: TEAL,
        fillOpacity: 0.07,
        interactive: false,
      });
    }
    if (!sectorCircleRef.current) {
      sectorCircleRef.current = L.circle([loc.lat, loc.lng], {
        radius: 1000,
        color: TEAL,
        opacity: 0.8,
        weight: 2.5,
        fillColor: TEAL,
        fillOpacity: 0.16,
        interactive: false,
      });
    }
    const radiusM = Math.max(300, filters.radiusKm * 1000);
    userCircleRef.current.setLatLng([loc.lat, loc.lng]);
    userCircleRef.current.setRadius(radiusM);
    if (sector) {
      userCircleRef.current.remove();
      sectorCircleRef.current.setLatLng([sector.lat, sector.lng]);
      sectorCircleRef.current.setRadius(radiusM);
      sectorCircleRef.current.addTo(map);
    } else {
      sectorCircleRef.current.remove();
      userCircleRef.current.addTo(map);
    }
  }, [loc, filters.radiusKm, sector, status]);

  // ─── Toggle: negocios de mascotas según OpenStreetMap (vía proxy /api/geo/pet-pois) ───
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (status !== "ready" || !L || !map) return;

    petMarkersRef.current.forEach((m) => m.remove());
    petMarkersRef.current = [];
    if (!petOn) return;

    let cancelled = false;
    (async () => {
      try {
        const b = map.getBounds();
        const qs = new URLSearchParams({
          s: b.getSouth().toFixed(5),
          w: b.getWest().toFixed(5),
          n: b.getNorth().toFixed(5),
          e: b.getEast().toFixed(5),
        });
        const res = await fetch(`/api/geo/pet-pois?${qs.toString()}`);
        const data = (await res.json().catch(() => null)) as { pois?: PetPoiApi[]; error?: string } | null;
        if (cancelled) return;
        setPetLoading(false);
        if (!res.ok || !data?.pois) {
          toast.error(data?.error ?? "No se pudo consultar OpenStreetMap. Prueba otra vez.", { duration: 5000 });
          return;
        }

        const petIcon = L.icon({ iconUrl: petPoiIcon(), iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14] });
        let count = 0;
        for (const poi of data.pois) {
          const marker = L.marker([poi.lat, poi.lng], { icon: petIcon, title: poi.name, zIndexOffset: 100 });
          marker.bindPopup(
            `<div style="min-width:190px;font-family:inherit">` +
              `<div style="font-weight:800;font-size:13px;color:#18181b;line-height:1.3">🐾 ${esc(poi.name)}</div>` +
              `<div style="font-size:11px;color:#71717a;margin-top:2px">${esc(poi.kind)} · OpenStreetMap</div>` +
              `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${poi.name} ${poi.lat},${poi.lng}`)}" target="_blank" rel="noopener" style="display:block;text-align:center;margin-top:8px;border:1.5px solid #d4d4d8;color:#3f3f46;border-radius:10px;padding:5px 8px;font-size:11.5px;font-weight:800;text-decoration:none;background:#fff">Abrir en Google Maps</a>` +
              `<div style="font-size:10.5px;color:#a1a1aa;margin-top:7px">¿Es tu negocio? 🐾 <a href="/#prestadores" style="color:${TEAL};font-weight:800;text-decoration:none">Regístrate gratis</a></div>` +
            `</div>`,
            { maxWidth: 280, minWidth: 210 }
          );
          marker.addTo(map);
          petMarkersRef.current.push(marker);
          count++;
        }
        setPetCount(count);
        if (count === 0) {
          toast("OpenStreetMap aún no registra negocios de mascotas en esta zona del mapa", { duration: 3000 });
        }
      } catch {
        if (cancelled) return;
        setPetLoading(false);
        toast.error("No se pudo consultar OpenStreetMap (servidor ocupado). Prueba otra vez.", { duration: 4500 });
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
    map.panTo([loc.lat, loc.lng]);
    if (map.getZoom() < 13) map.setZoom(13);
  }
  function togglePets() {
    const next = !petOn;
    setPetOn(next);
    setPetCount(0);
    setPetLoading(next);
  }
  function retry() {
    setStatus("loading");
    setErrorMsg("");
    setAttempt((a) => a + 1);
  }

  const national = !CITY_BOUNDS[city];

  return (
    <div className="relative h-full min-h-[420px] select-none overflow-hidden rounded-3xl border border-border/70 shadow-warm">
      {/* Contenedor de Leaflet (z-0 contiene los z-index internos de Leaflet) */}
      <div className="absolute inset-0 z-0">
        <div ref={containerRef} className="h-full w-full" aria-label={`Mapa real de OpenStreetMap con prestadores de ${city}`} role="application" />
      </div>

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
            aria-label="Mostrar negocios de mascotas según OpenStreetMap (veterinarias, tiendas y parques caninos)"
            title="Negocios de mascotas según OpenStreetMap: veterinarias 🏥, tiendas 🏪 y parques caninos 🌳"
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
                🏘️ {sector.name}{sector.zone ? ` · Pq. ${sector.zone}` : ""}
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-3 text-muted-foreground">
            <span className="hidden items-center gap-1 md:flex">👆 Toca o arrastra el mapa</span>
            <span className="flex items-center gap-1">
              <PawPrint className="h-3 w-3 text-primary" /> {providers.length}
            </span>
            <span
              className="hidden items-center gap-1 sm:flex"
              title="Pines dorados: 4+★ en Google Maps · con halo pulsante: además 4+★ en PetService-VE"
            >
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> 4+★ Google
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
          <p className="text-xs font-bold text-muted-foreground">Cargando mapa real…</p>
        </div>
      )}

      {/* Estado: error → respaldo al mapa clásico */}
      {status === "error" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-5">
          <div className="max-w-sm rounded-2xl border border-border/60 bg-card p-5 text-center shadow-xl">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/60">
              <TriangleAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </span>
            <h3 className="mt-3 font-display text-base font-black">El mapa no está disponible</h3>
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
          </div>
        </div>
      )}

      {/* Sello del motor activo (discreto) */}
      {status === "ready" && (
        <div
          className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border/40 bg-background/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-muted-foreground shadow backdrop-blur-md"
          title={national ? "Vista nacional con OpenStreetMap (gratis)" : "Mapa real OpenStreetMap — gratis, sin tarjeta ni clave"}
        >
          🗺️ OpenStreetMap
        </div>
      )}
    </div>
  );
}
