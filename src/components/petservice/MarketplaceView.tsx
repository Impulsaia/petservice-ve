"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, MapPin, PawPrint, List, Map as MapIcon, Sparkles, ShieldCheck, Clock3, BadgePercent, Loader2, Globe, ChevronDown, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { apiGet, apiPost } from "@/lib/petservice/api";
import { useAppStore } from "@/lib/petservice/store";
import { CATEGORIES, ZONES, type CategoryKey } from "@/lib/petservice/constants";
import { ProviderCard, ProviderCardSkeleton, type ProviderListItem } from "@/components/petservice/marketplace-parts";
import { SmartMapPanel } from "@/components/petservice/google-map-parts";
import { toast } from "sonner";

// ─────────────── Alcance nacional: ciudades y sectores (DB) ───────────────

interface CityInfo {
  id: string;
  name: string;
  state: string;
  lat: number;
  lng: number;
  active: boolean;
  providerCount: number;
}

interface SectorInfo {
  id: string;
  cityName: string;
  name: string;
  zone: string | null;
  lat: number;
  lng: number;
}

/** centro por defecto de una ciudad: primera zona conocida (Bolívar) o coords de la DB */
function centerForCity(name: string, info?: CityInfo | null): { label: string; lat: number; lng: number } | undefined {
  const z = ZONES.find((zz) => zz.city === name);
  if (z) return { label: z.name, lat: z.lat, lng: z.lng };
  if (info) return { label: name, lat: info.lat, lng: info.lng };
  return undefined;
}

export function MarketplaceView() {
  const { filters, setFilters, resetFilters, loc, setLoc, city, setCity, settings, dataTick } = useAppStore();
  const [providers, setProviders] = useState<ProviderListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [qInput, setQInput] = useState(filters.q);
  // El filtro textual es la fuente de verdad: si un botón lo limpia, el input
  // también se limpia (y viceversa al enviar el formulario).
  useEffect(() => {
    setQInput(filters.q);
  }, [filters.q]);
  const [mobileTab, setMobileTab] = useState<"list" | "map">("list");
  const [heroOk, setHeroOk] = useState(true);
  const [aiThinking, setAiThinking] = useState(false);
  const mapAsideRef = useRef<HTMLElement>(null);

  // ── Nacional: 29 ciudades de la DB + sectores por ciudad ──
  const [cities, setCities] = useState<CityInfo[] | null>(null);
  const [sectors, setSectors] = useState<SectorInfo[]>([]);
  const [selectedSector, setSelectedSector] = useState<SectorInfo | null>(null);
  const [citiesOpen, setCitiesOpen] = useState(false);
  const [sectorsOpen, setSectorsOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState("");

  // Ciudades: al montar y cada vez que se abre el popover (mantiene contadores frescos)
  useEffect(() => {
    let alive = true;
    apiGet<{ cities: CityInfo[] }>("/api/cities")
      .then((d) => alive && setCities(d.cities))
      .catch(() => {}); // sin bloquear la UI si falla
    return () => {
      alive = false;
    };
  }, [citiesOpen]);

  // Sectores: SOLO se refetchean al cambiar de ciudad (sin loops)
  useEffect(() => {
    let alive = true;
    setSelectedSector(null);
    apiGet<{ sectors: SectorInfo[] }>(`/api/sectors?city=${encodeURIComponent(city)}`)
      .then((d) => alive && setSectors(d.sectors ?? []))
      .catch(() => alive && setSectors([]));
    return () => {
      alive = false;
    };
  }, [city]);

  // Si el usuario mueve la búsqueda (tap del mapa, GPS, IA…), el chip de sector se desmarca
  useEffect(() => {
    setSelectedSector((prev) =>
      prev && (Math.abs(prev.lat - loc.lat) > 1e-6 || Math.abs(prev.lng - loc.lng) > 1e-6) ? null : prev
    );
  }, [loc]);

  const currentCityInfo = useMemo(() => cities?.find((c) => c.name === city) ?? null, [cities, city]);
  /** ciudad activa sin prestadores → estado "Próximamente" (mapa + lista) */
  const vacantCity = currentCityInfo && currentCityInfo.providerCount === 0 ? currentCityInfo : null;

  const cityGroups = useMemo(() => {
    const list = cities ?? [];
    const q = cityQuery.trim().toLowerCase();
    const filtered = q
      ? list.filter((c) => c.name.toLowerCase().includes(q) || c.state.toLowerCase().includes(q))
      : list;
    const byState = new Map<string, CityInfo[]>();
    for (const c of filtered) {
      const arr = byState.get(c.state);
      if (arr) arr.push(c);
      else byState.set(c.state, [c]);
    }
    // estados con prestadores primero, luego alfabético
    return [...byState.entries()].sort((a, b) => {
      const ap = a[1].some((c) => c.providerCount > 0) ? 0 : 1;
      const bp = b[1].some((c) => c.providerCount > 0) ? 0 : 1;
      return ap - bp || a[0].localeCompare(b[0], "es");
    });
  }, [cities, cityQuery]);

  /** elige ciudad desde el popover: con prestadores → busca; sin prestadores → modo "Próximamente" */
  function chooseCity(c: CityInfo) {
    setCitiesOpen(false);
    setCityQuery("");
    // Nueva búsqueda desde el botón: se limpian TODOS los filtros anteriores
    // (texto, zona, categoría, mascota, estrellas) — el usuario empieza de cero.
    setFilters({ zone: null, q: "", category: null, petType: null, minRating: 0 });
    if (c.providerCount > 0) {
      setSelectedSector(null);
      setCity(c.name, centerForCity(c.name, c));
      if (!ZONES.some((z) => z.city === c.name)) toast.success(`🐾 ${c.providerCount} prestadores en ${c.name}`);
    } else {
      setSelectedSector(null);
      setCity(c.name, { label: `${c.name} (próximamente)`, lat: c.lat, lng: c.lng });
      toast.info(`🚧 Aún no llegamos a ${c.name} — estamos certificando prestadores en ${c.state}`);
    }
  }

  function selectSector(s: SectorInfo) {
    setSelectedSector(s);
    setLoc({ label: s.name, lat: s.lat, lng: s.lng });
    // Nueva búsqueda desde el botón: se limpian texto, categoría, mascota y estrellas
    setFilters({ q: "", category: null, petType: null, minRating: 0 });
    toast.success(`🏘️ Buscando en ${s.name}${s.zone ? ` · Pq. ${s.zone}` : ""}`);
  }

  function clearSector() {
    setSelectedSector(null);
    setFilters({ q: "", category: null, petType: null, minRating: 0 });
    const center = centerForCity(city, currentCityInfo);
    if (center) setCity(city, center);
  }

  function becomeProvider(cityName: string, stateName: string) {
    useAppStore.getState().setView("login");
    toast.info(`En «Crear cuenta» elige rol Prestador 🧑‍🍳 — así certificamos nuevos negocios en ${cityName} (${stateName})`);
  }

  function goBackToBolivar() {
    const active = cities?.filter((c) => c.providerCount > 0);
    // Preferimos Puerto Ordaz (sede principal); si no, la primera activa
    const target = active?.find((c) => c.name === "Puerto Ordaz")?.name ?? active?.[0]?.name ?? "Puerto Ordaz";
    setSelectedSector(null);
    setFilters({ zone: null, q: "", category: null, petType: null, minRating: 0 });
    setCity(target, centerForCity(target, active?.find((c) => c.name === target) ?? undefined));
  }

  // En móvil, al cambiar a la pestaña "Mapa", desplaza suavemente hasta el mapa
  useEffect(() => {
    if (mobileTab === "map") {
      const t = setTimeout(() => mapAsideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      return () => clearTimeout(t);
    }
  }, [mobileTab]);

  useEffect(() => {
    setLoading(true);
    // Debounce: al arrastrar el pin del mapa la ubicación cambia rápido;
    // esperamos 350ms de calma antes de golpear la API (cancelable).
    const t = setTimeout(() => {
      const params = new URLSearchParams({
        lat: String(loc.lat),
        lng: String(loc.lng),
        radius: String(filters.radiusKm),
        sort: filters.sort,
      });
      if (filters.q) params.set("q", filters.q);
      if (filters.category) params.set("category", filters.category);
      if (filters.zone) params.set("zone", filters.zone);
      if (filters.petType) params.set("petType", filters.petType);
      if (filters.minRating) params.set("minRating", String(filters.minRating));
      params.set("onlyVerified", String(filters.onlyVerified));

      apiGet<{ providers: ProviderListItem[] }>(`/api/providers?${params}`)
        .then((d) => setProviders(d.providers))
        .catch(() => toast.error("Error buscando prestadores"))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [loc, filters, dataTick]);

  const stats = useMemo(() => {
    const all = providers ?? [];
    const services = all.reduce((acc, p) => acc + p.services.length, 0);
    const avg = all.length ? all.reduce((a, p) => a + p.ratingAvg, 0) / all.length : 0;
    return { providers: all.length, services, avg };
  }, [providers]);

  /** Sectores agrupados por su PARROQUIA (división político-territorial real). */
  const sectorsByParroquia = useMemo(() => {
    const map = new Map<string, SectorInfo[]>();
    for (const s of sectors) {
      const pq = (s.zone ?? "").trim() || "Otros sectores";
      const arr = map.get(pq);
      if (arr) arr.push(s);
      else map.set(pq, [s]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [sectors]);

  function submitSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setFilters({ q: qInput });
  }

  /** Búsqueda semántica IA: "peluquería para gato en Chacao" → filtros estructurados */
  async function aiSearch() {
    if (aiThinking) return;
    if (qInput.trim().length < 3) {
      toast.info("Escribe qué buscas y la IA lo traduce a filtros ✨");
      return;
    }
    setAiThinking(true);
    try {
      const d = await apiPost<{ filters: { category: string | null; petType: string | null; zone: string | null; q: string } | null }>(
        "/api/ai/search",
        { query: qInput }
      );
      if (!d.filters) {
        setFilters({ q: qInput });
        toast.info("No pude interpretar con IA — hice una búsqueda normal 🔍");
        return;
      }
      const f = d.filters;
      if (f.zone) {
        const z = ZONES.find((x) => f.zone && x.name.toLowerCase().includes(f.zone.toLowerCase()));
        if (z) setLoc({ label: z.name, lat: z.lat, lng: z.lng });
      }
      // Sanitiza stopwords temporales/relleno que matarían el filtro textual
      const STOPWORDS = /\b(necesito|quiero|busco|alguien|hoy|mañana|manana|esta|semana|fin|urgente|para|mi|un|una|el|la|los|las|de|en|que|me)\b/gi;
      const cleanQ = (f.q ?? "").replace(STOPWORDS, " ").replace(/\s+/g, " ").trim();
      setFilters({
        q: cleanQ,
        category: (f.category as CategoryKey | null) ?? null,
        petType: f.petType ?? null,
      });
      toast.success(
        `✨ IA: ${[f.category, f.petType, f.zone].filter(Boolean).join(" · ") || "sin filtros específicos"}`
      );
    } catch {
      setFilters({ q: qInput });
      toast.error("La IA no está disponible ahora — búsqueda normal aplicada");
    } finally {
      setAiThinking(false);
    }
  }

  function useGps() {
    if (!navigator.geolocation) {
      toast.info("GPS no disponible — usa el selector de zona para buscar");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc({ label: "Mi ubicación (GPS)", lat: pos.coords.latitude, lng: pos.coords.longitude });
        setFilters({ q: "" }); // búsqueda desde el botón GPS: limpia el filtro anterior
        toast.success("📍 Ubicación GPS detectada");
      },
      () => toast.info("Sin permiso de GPS — usa el selector de zona para buscar"),
      { timeout: 4000 }
    );
  }

  const activeFilters =
    (filters.category ? 1 : 0) + (filters.petType ? 1 : 0) + (filters.minRating ? 1 : 0) + (filters.q ? 1 : 0);

  return (
    <div className="space-y-8">
      {/* ───────────────── Hero ───────────────── */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-primary via-primary to-emerald-700 px-6 py-8 text-white shadow-warm sm:px-10 sm:py-12">
        <div className="bg-paw-dots pointer-events-none absolute inset-0 opacity-20" aria-hidden />
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-accent/25 blur-2xl" aria-hidden />
        <div className="absolute -bottom-28 right-40 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden />

        <div className="relative grid items-center gap-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold backdrop-blur">
              <ShieldCheck className="h-3.5 w-3.5" /> Servicios para mascotas a domicilio en toda Venezuela 🇻🇪
            </span>
            <h1 className="font-display text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-[2.75rem]">
              Tu mascota feliz,
              <br />
              <span className="text-accent">sin salir de casa</span> 🐾
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/85 sm:text-base">
              Peluquería, veterinaria, delivery, pet sitting, paseos y más — a domicilio en <strong>toda Venezuela</strong> 🇻🇪, con pago en{" "}
              <strong>USD o Bs.</strong> Activos hoy en Bolívar · llegando pronto a {cities?.length ?? 29} ciudades. Prueba la búsqueda con IA:{" "}
              <em>“veterinario para michi en El Roble”</em> ✨
            </p>

            {/* Búsqueda */}
            <form onSubmit={submitSearch} className="mt-5 flex flex-col gap-2 sm:flex-row">
              <div className="flex flex-1 items-center gap-2 rounded-2xl bg-white p-1.5 shadow-lg">
                <Search className="ml-2 h-4 w-4 shrink-0 text-zinc-400" />
                <input
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="¿Qué necesita tu peludito? Ej: baño para gato"
                  className="h-9 w-full min-w-0 bg-transparent text-sm font-medium text-zinc-900 outline-none placeholder:text-zinc-400"
                  aria-label="Buscar servicios"
                />
                <Button type="submit" className="hidden shrink-0 rounded-xl bg-accent font-bold text-accent-foreground hover:bg-accent/90 sm:inline-flex">
                  Buscar
                </Button>
                <Button
                  type="button"
                  onClick={aiSearch}
                  disabled={aiThinking}
                  title="Búsqueda semántica con IA"
                  className="hidden shrink-0 rounded-xl border-2 border-teal-600/30 bg-primary/10 font-bold text-primary hover:bg-primary/20 sm:inline-flex"
                >
                  {aiThinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  IA
                </Button>
              </div>
              <div className="flex gap-2 sm:hidden">
                <Button type="submit" className="flex-1 rounded-2xl bg-accent font-bold text-accent-foreground hover:bg-accent/90">
                  Buscar
                </Button>
                <Button
                  type="button"
                  onClick={aiSearch}
                  disabled={aiThinking}
                  className="flex-1 rounded-2xl border-2 border-teal-600/30 bg-primary/10 font-bold text-primary hover:bg-primary/20"
                >
                  {aiThinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} IA
                </Button>
              </div>
            </form>

            {/* Barra de ubicación compacta: dropdown de Ciudad + dropdown de Sector + GPS.
                Reemplaza los chips individuales para evitar el exceso de botones. */}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {/* Ciudad: las 29 ciudades de Venezuela, agrupadas por estado y con buscador */}
              <Popover open={citiesOpen} onOpenChange={setCitiesOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="inline-flex max-w-full items-center gap-1.5 rounded-xl bg-white/15 px-3 py-1.5 font-bold text-white backdrop-blur transition-colors hover:bg-white/25"
                    aria-label={`Ciudad activa: ${city}. Elegir otra ciudad de Venezuela`}
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="max-w-[170px] truncate">{city}</span>
                    <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", citiesOpen && "rotate-180")} />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[min(92vw,340px)] rounded-2xl p-0 shadow-xl" role="dialog" aria-label="Cambiar ubicación">
                  <div className="border-b border-border/60 p-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={cityQuery}
                        onChange={(e) => setCityQuery(e.target.value)}
                        placeholder="Ciudad o estado… ej: Caracas, Zulia"
                        className="h-9 rounded-xl pl-8 text-sm"
                        aria-label="Buscar ciudad o estado"
                      />
                    </div>
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {cities ? `${cities.length} ciudades · ${cities.filter((c) => c.providerCount > 0).length} con prestadores` : "Cargando ciudades…"}
                    </p>
                  </div>
                  <div className="scroll-slim max-h-[300px] overflow-y-auto p-2">
                    {cityGroups.length === 0 && (
                      <p className="px-2 py-6 text-center text-xs text-muted-foreground">Sin resultados para “{cityQuery}” 🐾</p>
                    )}
                    {cityGroups.map(([state, list]) => (
                      <div key={state}>
                        <div className="px-2 pb-1 pt-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">{state}</div>
                        {list.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => chooseCity(c)}
                            className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-secondary"
                            aria-label={`${c.name}, ${state}${c.providerCount > 0 ? ` · ${c.providerCount} prestadores` : " · próximamente"}`}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <MapPin className={cn("h-3.5 w-3.5 shrink-0", c.providerCount > 0 ? "text-primary" : "text-muted-foreground/50")} />
                              <span className="truncate text-sm font-bold">{c.name}</span>
                              {c.name === city && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                            </span>
                            {c.providerCount > 0 ? (
                              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                {c.providerCount} prestadores
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">Próximamente</span>
                            )}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Sector: lista desplegable con los sectores de la ciudad activa */}
              <Popover open={sectorsOpen} onOpenChange={setSectorsOpen}>
                <PopoverTrigger asChild>
                  <button
                    disabled={sectors.length === 0}
                    className={cn(
                      "inline-flex max-w-full items-center gap-1.5 rounded-xl px-3 py-1.5 font-bold backdrop-blur transition-colors",
                      selectedSector
                        ? "bg-accent text-accent-foreground shadow"
                        : "bg-white/15 text-white hover:bg-white/25",
                      sectors.length === 0 && "cursor-not-allowed opacity-50"
                    )}
                    aria-label={selectedSector ? `Sector activo: ${selectedSector.name}. Elegir otro sector` : "Elegir sector (todos por defecto)"}
                  >
                    <span className="shrink-0">🏘️</span>
                    <span className="max-w-[150px] truncate">{selectedSector ? selectedSector.name : "Todos los sectores"}</span>
                    <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", sectorsOpen && "rotate-180")} />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[min(92vw,300px)] rounded-2xl p-0 shadow-xl" role="dialog" aria-label="Elegir sector">
                  <p className="border-b border-border/60 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Sectores por parroquia · {city}
                  </p>
                  <div className="scroll-slim max-h-[300px] overflow-y-auto p-2">
                    <button
                      onClick={() => {
                        clearSector();
                        setSectorsOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-secondary"
                      aria-label="Buscar en toda la ciudad"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="truncate text-sm font-bold">Toda la ciudad</span>
                      </span>
                      {!selectedSector && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                    </button>
                    {/* Agrupados por su parroquia real (división político-territorial) */}
                    {sectorsByParroquia.map(([parroquia, list]) => (
                      <div key={parroquia}>
                        <div className="px-2 pb-0.5 pt-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                          Pq. {parroquia}
                        </div>
                        {list.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => {
                              selectSector(s);
                              setSectorsOpen(false);
                            }}
                            title={`Parroquia ${s.zone ?? "—"} · ${s.cityName}`}
                            className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-secondary"
                            aria-label={`Sector ${s.name}, parroquia ${s.zone ?? "—"}`}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="shrink-0">🏘️</span>
                              <span className="truncate text-sm font-bold">{s.name}</span>
                            </span>
                            {selectedSector?.id === s.id && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <button
                onClick={useGps}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-1.5 font-bold text-white backdrop-blur transition-colors hover:bg-white/25"
                aria-label="Usar mi ubicación GPS"
              >
                <Globe className="h-3.5 w-3.5" /> Mi ubicación
              </button>
            </div>
          </div>

          {/* Ilustración hero */}
          <div className="relative hidden justify-center lg:flex" aria-hidden={false}>
            {heroOk ? (
              <img
                src="/hero-pets.png"
                alt="Ilustración: cachorro bañándose con burbujas y un gato curioso"
                onError={() => setHeroOk(false)}
                className="animate-floaty max-h-72 w-auto rounded-3xl border-4 border-white/20 object-cover shadow-2xl"
              />
            ) : (
              <div className="flex h-56 w-72 items-center justify-center rounded-3xl border-4 border-white/20 bg-white/10 text-7xl backdrop-blur">🛁🐾</div>
            )}
            <span className="absolute -left-4 top-2 rounded-2xl bg-white px-3 py-2 text-xs font-black text-zinc-800 shadow-lg">
              ⭐ 4.8 promedio
            </span>
            <span className="absolute -bottom-3 right-4 rounded-2xl bg-accent px-3 py-2 text-xs font-black text-accent-foreground shadow-lg">
              +500 peluditos felices 🐶
            </span>
          </div>
        </div>
      </section>

      {/* ───────────────── Categorías ───────────────── */}
      <section aria-label="Categorías de servicios">
        <div className="scroll-slim -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
          <button
            onClick={() => setFilters({ category: null, q: "", petType: null, minRating: 0 })}
            className={cn(
              "flex shrink-0 flex-col items-center gap-1 rounded-2xl border px-4 py-3 transition-all",
              !filters.category
                ? "border-primary bg-primary text-primary-foreground shadow-warm"
                : "border-border bg-card hover:border-primary/40 hover:bg-secondary"
            )}
          >
            <PawPrint className="h-5 w-5" />
            <span className="text-xs font-bold">Todos</span>
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setFilters({ category: filters.category === c.key ? null : (c.key as CategoryKey), q: "", petType: null, minRating: 0 })}
              className={cn(
                "flex shrink-0 flex-col items-center gap-1 rounded-2xl border px-4 py-3 transition-all",
                filters.category === c.key
                  ? "border-primary bg-primary text-primary-foreground shadow-warm"
                  : "border-border bg-card hover:border-primary/40 hover:bg-secondary"
              )}
              title={c.tagline}
            >
              <span className="text-xl leading-none">{c.emoji}</span>
              <span className="text-xs font-bold">{c.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ───────────────── Filtros + resultados ───────────────── */}
      <section className="grid gap-6 md:grid-cols-[1fr_360px] lg:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          {/* Barra de filtros */}
          <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
            <span className="inline-flex items-center gap-1 pl-1 text-xs font-bold text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-accent-foreground" /> Filtros
            </span>

            <Select value={filters.petType ?? "ALL"} onValueChange={(v) => setFilters({ petType: v === "ALL" ? null : v })}>
              <SelectTrigger size="sm" className="w-[120px] rounded-xl text-xs font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">🐕 🐈 Todos</SelectItem>
                <SelectItem value="PERRO">🐕 Perros</SelectItem>
                <SelectItem value="GATO">🐈 Gatos</SelectItem>
              </SelectContent>
            </Select>

            <Select value={String(filters.minRating)} onValueChange={(v) => setFilters({ minRating: Number(v) })}>
              <SelectTrigger size="sm" className="w-[130px] rounded-xl text-xs font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">⭐ Cualquiera</SelectItem>
                <SelectItem value="4">⭐ 4.0+</SelectItem>
                <SelectItem value="4.5">⭐ 4.5+</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.sort} onValueChange={(v) => setFilters({ sort: v as typeof filters.sort })}>
              <SelectTrigger size="sm" className="w-[150px] rounded-xl text-xs font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="distance">📍 Más cerca</SelectItem>
                <SelectItem value="rating">⭐ Mejor rating</SelectItem>
                <SelectItem value="price_asc">💰 Menor precio</SelectItem>
                <SelectItem value="price_desc">💎 Mayor precio</SelectItem>
              </SelectContent>
            </Select>

            <label className="inline-flex items-center gap-1.5 rounded-xl bg-secondary px-2.5 py-1.5 text-xs font-bold">
              <Switch checked={filters.onlyVerified} onCheckedChange={(v) => setFilters({ onlyVerified: v })} aria-label="Solo verificados" />
              ✔ Verificados
            </label>

            <div className="ml-auto flex items-center gap-2">
              <span className="hidden text-xs font-bold text-muted-foreground sm:inline" title="El radio filtra en línea recta; cada tarjeta muestra el tiempo REAL de conducción (con puentes y calles)">
                Radio: {filters.radiusKm} km <span className="font-normal text-muted-foreground/80">(recta)</span>
              </span>
              <Slider
                value={[filters.radiusKm]}
                onValueChange={([v]) => setFilters({ radiusKm: v })}
                min={1}
                max={30}
                step={1}
                className="w-28"
                aria-label="Radio de búsqueda en km"
              />
            </div>
          </div>

          {/* Encabezado resultados */}
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-extrabold sm:text-xl">
              {loading ? "Buscando…" : `${providers?.length ?? 0} prestadores`}{" "}
              {filters.category && <span className="text-primary">en {CATEGORIES.find((c) => c.key === filters.category)?.label}</span>}
              {activeFilters > 0 && (
                <button onClick={resetFilters} className="ml-2 text-xs font-bold text-accent-foreground underline decoration-accent decoration-2 underline-offset-2 hover:opacity-80">
                  limpiar filtros ({activeFilters})
                </button>
              )}
            </h2>
            <div className="flex gap-1.5 rounded-2xl border border-border/60 bg-card p-1.5 shadow-sm md:hidden" role="tablist" aria-label="Ver resultados como">
              <button onClick={() => setMobileTab("list")} className={cn("flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all", mobileTab === "list" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground")} role="tab" aria-selected={mobileTab === "list"}>
                <List className="h-4 w-4" /> Lista
              </button>
              <button onClick={() => setMobileTab("map")} className={cn("flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all", mobileTab === "map" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground")} role="tab" aria-selected={mobileTab === "map"}>
                <MapIcon className="h-4 w-4" /> Mapa
              </button>
            </div>
          </div>

          {/* Grid de prestadores (o estado "Próximamente" en ciudades sin cobertura) */}
          {vacantCity ? (
            <div className={cn("rounded-3xl border-2 border-dashed border-accent/50 bg-card/60 px-6 py-14 text-center shadow-warm", mobileTab === "map" && "hidden md:block")}>
              <span className="animate-wiggle inline-block text-5xl">🚧</span>
              <h3 className="mt-3 font-display text-xl font-black">Aún no llegamos a {vacantCity.name}</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                Estamos certificando prestadores en <strong>{vacantCity.state}</strong>… ¡Sé el primero! 🐾
                <br />
                <span className="text-xs">Mientras tanto, activos hoy en Bolívar: Puerto Ordaz, San Félix, Ciudad Bolívar y Upata.</span>
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <Button onClick={() => becomeProvider(vacantCity.name, vacantCity.state)} className="rounded-xl bg-primary font-bold hover:bg-primary/90">
                  Quiero ser prestador en {vacantCity.name}
                </Button>
                <Button onClick={goBackToBolivar} variant="outline" className="rounded-xl font-bold">
                  Ver prestadores activos en Bolívar
                </Button>
              </div>
            </div>
          ) : loading ? (
            <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", mobileTab === "map" && "hidden md:grid")}>
              {[...Array(6)].map((_, i) => <ProviderCardSkeleton key={i} />)}
            </div>
          ) : providers && providers.length > 0 ? (
            <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", mobileTab === "map" && "hidden md:grid")}>
              {providers.map((p) => (
                <ProviderCard key={p.id} p={p} rate={settings?.usdToBs ?? 40} />
              ))}
            </div>
          ) : (
            <div className={cn("rounded-2xl border-2 border-dashed border-border/70 bg-card/50 px-6 py-14 text-center", mobileTab === "map" && "hidden md:block")}>
              <span className="animate-wiggle inline-block text-5xl">🐾</span>
              <h3 className="mt-3 font-display text-lg font-bold">Sin resultados en {loc.label}</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Prueba ampliando el radio de búsqueda, quitando filtros o cambia de ciudad con 🌎 Cambiar ubicación.
              </p>
              <Button onClick={resetFilters} variant="outline" className="mt-4 rounded-xl font-bold">
                Limpiar filtros
              </Button>
            </div>
          )}
        </div>

        {/* Mapa: visible en móvil (pestaña Mapa), tablet y escritorio. Se monta SIEMPRE
            (con tasa de respaldo) para que un fallo de /api/settings nunca lo desaparezca. */}
        <aside ref={mapAsideRef} className={cn("scroll-mt-20 md:block", mobileTab === "map" ? "block" : "hidden")}>
          <div className="md:sticky md:top-24 h-fit">
            <div className="h-[min(72svh,640px)] md:h-auto">
              <SmartMapPanel
                gmapsKey={settings?.gmapsApiKey ?? null}
                providers={vacantCity ? [] : providers ?? []}
                rate={settings?.usdToBs ?? 40}
                sector={selectedSector ? { name: selectedSector.name, zone: selectedSector.zone, lat: selectedSector.lat, lng: selectedSector.lng } : null}
                vacant={vacantCity ? { name: vacantCity.name, state: vacantCity.state, lat: vacantCity.lat, lng: vacantCity.lng } : null}
              />
            </div>
            <div className="mt-3 hidden grid-cols-3 gap-2 md:grid">
              <div className="rounded-xl border border-border/60 bg-card p-2.5 text-center shadow-sm">
                <div className="font-display text-lg font-black text-primary">{stats.providers}</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Prestadores</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-card p-2.5 text-center shadow-sm">
                <div className="font-display text-lg font-black text-accent-foreground">{stats.services}</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Servicios</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-card p-2.5 text-center shadow-sm">
                <div className="font-display text-lg font-black">⭐ {stats.avg.toFixed(1)}</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Promedio</div>
              </div>
            </div>
            <div className="mt-3 hidden items-start gap-2 rounded-xl bg-secondary/70 p-3 text-xs text-secondary-foreground md:flex">
              <BadgePercent className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
              <span>
                <strong>Pago flexible:</strong> Pago Móvil, transferencia, Zelle, Binance o efectivo. Los precios se muestran en USD y su equivalente en Bs. a tasa del día.
              </span>
            </div>
          </div>
        </aside>
      </section>

      {/* Botón flotante móvil: alternar Mapa / Lista (siempre a la mano 🗺️) */}
      <button
        onClick={() => setMobileTab(mobileTab === "map" ? "list" : "map")}
        className={cn(
          "fixed bottom-36 right-4 z-40 flex h-12 items-center gap-2 rounded-full px-4 text-xs font-black shadow-xl transition-transform active:scale-95 md:hidden",
          mobileTab === "map" ? "bg-background text-foreground border border-border" : "bg-foreground text-background"
        )}
        aria-label={mobileTab === "map" ? "Ver lista de prestadores" : "Ver mapa de prestadores"}
      >
        {mobileTab === "map" ? <List className="h-4 w-4" /> : <MapIcon className="h-4 w-4" />}
        {mobileTab === "map" ? "Ver lista" : "Ver mapa"}
      </button>

      {/* ───────────────── Cómo funciona ───────────────── */}
      <section aria-label="Cómo funciona" className="rounded-3xl border border-border/60 bg-card p-6 shadow-warm sm:p-8">
        <h2 className="text-center font-display text-2xl font-black">¿Cómo funciona? 🤔</h2>
        <p className="mt-1 text-center text-sm text-muted-foreground">De la búsqueda a las patitas felices en 4 pasos</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n: 1, emoji: "🔍", t: "Busca", d: "Filtra por sector, ciudad, servicio o tipo de mascota. Ve prestadores verificados cerca de ti en toda Venezuela." },
            { n: 2, emoji: "📅", t: "Agenda", d: "Elige servicio, fecha y hora. Confirma la dirección donde recibirás al prestador." },
            { n: 3, emoji: "💳", t: "Paga como quieras", d: "Pago Móvil, transferencia, Zelle, Binance o efectivo. Tu dinero queda protegido." },
            { n: 4, emoji: "⭐", t: "Califica", d: "Disfruta el servicio, recibe evidencia y deja tu reseña para la comunidad." },
          ].map((s) => (
            <div key={s.n} className="relative rounded-2xl border border-border/60 bg-background/60 p-4 transition-transform hover:-translate-y-1">
              <span className="absolute -top-3 left-4 flex h-7 w-7 items-center justify-center rounded-full bg-accent font-display text-sm font-black text-accent-foreground shadow">
                {s.n}
              </span>
              <div className="text-3xl">{s.emoji}</div>
              <h3 className="mt-2 font-display font-extrabold">{s.t}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-bold text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Escrow lógico: tu pago se libera al confirmar</span>
          <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-amber-600" /> Recordatorios por WhatsApp (24h / 2h / 30min)</span>
        </div>
      </section>
    </div>
  );
}
