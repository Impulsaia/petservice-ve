"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { PawPrint, Moon, Sun, Compass, CalendarDays, Store, ShieldCheck, RefreshCcw, LogIn, LogOut, Mail, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAppStore, type View } from "@/lib/petservice/store";
import { apiGet, apiPost } from "@/lib/petservice/api";
import { SUPPORT_WHATSAPP, SUPPORT_WHATSAPP_WA, SUPPORT_EMAIL, CREDIT_BRAND, type CategoryKey } from "@/lib/petservice/constants";

const NAV: { key: View; label: string; short: string; icon: React.ReactNode; role: string }[] = [
  { key: "home", label: "Explorar", short: "Explorar", icon: <Compass className="h-5 w-5" />, role: "CLIENT" },
  { key: "client", label: "Mis Reservas", short: "Reservas", icon: <CalendarDays className="h-5 w-5" />, role: "CLIENT" },
  { key: "providerDash", label: "Panel Prestador", short: "Prestador", icon: <Store className="h-5 w-5" />, role: "PROVIDER" },
  { key: "admin", label: "Admin", short: "Admin", icon: <ShieldCheck className="h-5 w-5" />, role: "ADMIN" },
];

const ROLE_LABEL: Record<string, string> = { CLIENT: "Cliente", PROVIDER: "Prestador", ADMIN: "Admin" };
const ROLE_HOME: Record<string, View> = { CLIENT: "home", PROVIDER: "providerDash", ADMIN: "admin" };

/** Servicios del footer: cada fila es un enlace que lanza la búsqueda por categoría */
const FOOTER_SERVICES: { label: string; category: CategoryKey }[] = [
  { label: "✂️ Peluquería canina y felina", category: "GROOMING" },
  { label: "🩺 Consultas veterinarias a domicilio", category: "VET" },
  { label: "🛵 Delivery de alimentos y medicinas", category: "DELIVERY" },
  { label: "🏡 Pet sitting · 🦮 Paseos", category: "PET_SITTING" },
  { label: "🎓 Adiestramiento · 🚕 Pet taxi · 🛁 Spa móvil", category: "TRAINING" },
  { label: "🏕️ Refugios y rescates de mascotas", category: "REFUGIO" },
  { label: "❤️ Adopción responsable de mascotas", category: "ADOPCION" },
];

/** Cache simple de ciudades (el listado cambia poco; evita refetch por cambio de ciudad) */
let citiesCache: { name: string; state: string }[] | null = null;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { view, setView, backToHome, settings, setSettings, user, setUser, authLoaded, setAuthLoaded, city, setFilters } = useAppStore();
  const { resolvedTheme, setTheme } = useTheme();
  // El tema solo se conoce tras montar (next-themes): evita mismatch de hidratación
  // renderizando el icono/aria-label por defecto en servidor y primer render del cliente.
  // useSyncExternalStore = patrón "mounted" sin setState en effects (lint-limpio).
  const themeMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // Bootstrap: sesión + settings al montar
  useEffect(() => {
    apiGet<{ user: { id: string; email: string; name: string; role: string; phone: string | null; avatarUrl: string | null } | null }>("/api/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setAuthLoaded(true));
    apiGet<{ settings: { usdToBs: number; commissionPct: number; defaultRadiusKm: number } }>("/api/settings")
      .then((d) => setSettings(d.settings))
      .catch(() => toast.error("No se pudo cargar la configuración inicial"));
  }, [setSettings, setUser, setAuthLoaded]);

  // Aviso OAuth: /?loginError=google_no_configurado llega al HOME tras el redirect.
  // Lo procesamos aquí (una sola vez): abrimos el login y limpiamos la URL.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("loginError") === "google_no_configurado") {
        params.delete("loginError");
        const qs = params.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
        setView("login");
        toast.info("Google aún no está configurado en esta demo — entra con tu correo o prueba las cuentas demo 🐾");
      }
      // Enlace de restablecimiento (email real): fuerza el login para consumir el token
      if (window.location.pathname === "/restablecer") setView("login");
    } catch {
      /* entorno sin history (raro) — ignorar */
    }
  }, [setView]);

  /** Estado (entidad federal) de la ciudad activa — para el breadcrumb del header */
  const [cityState, setCityState] = useState<string | null>(null);

  // Breadcrumb dinámico: "Venezuela · Estado · Ciudad · + 29 ciudades" según donde navega el usuario
  useEffect(() => {
    let alive = true;
    const apply = (list: { name: string; state: string }[]) => {
      if (!alive) return;
      setCityState(list.find((c) => c.name === city)?.state ?? null);
    };
    if (citiesCache) {
      apply(citiesCache);
      return;
    }
    apiGet<{ cities: { name: string; state: string }[] }>("/api/cities")
      .then((d) => {
        citiesCache = d.cities;
        apply(d.cities);
      })
      .catch(() => {}); // sin bloquear el header si falla
    return () => {
      alive = false;
    };
  }, [city]);

  /** Footer: lanzar búsqueda por categoría desde un enlace de servicio */
  function searchByCategory(category: CategoryKey) {
    // Búsqueda nueva desde el footer: también limpia mascota/estrellas para no arrastrar filtros previos
    setFilters({ category, q: "", zone: null, petType: null, minRating: 0 });
    backToHome();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function logout() {
    try {
      await apiPost("/api/auth/logout", {});
      setUser(null);
      setView("home");
      toast.info("Sesión cerrada. ¡Vuelve pronto! 🐾");
    } catch {
      toast.error("No se pudo cerrar la sesión");
    }
  }

  async function reseedDemo() {
    try {
      await apiPost("/api/demo/reseed", {});
      window.location.reload();
    } catch {
      toast.error("Solo el administrador puede reiniciar la demo");
    }
  }

  const isDark = themeMounted && resolvedTheme === "dark";
  // Navegación visible según rol de la sesión
  const navItems = user ? NAV.filter((n) => n.role === user.role) : [];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ───────── Header ───────── */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4">
          <button onClick={backToHome} className="group flex items-center gap-2.5" aria-label="PetService VE — Inicio">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-white shadow-warm transition-transform group-hover:-rotate-6 group-hover:scale-105">
              <PawPrint className="h-6 w-6" />
            </span>
            <span className="hidden flex-col items-start leading-none sm:flex">
              <span className="font-display text-lg font-black tracking-tight">
                PetService <span className="text-accent-foreground rounded-md bg-accent px-1 py-0.5 text-xs font-black">VE</span>
              </span>
              <span className="text-[11px] text-muted-foreground">
                Venezuela 🇻🇪{cityState ? ` · ${cityState} · ${city}` : ""} · + 29 ciudades 🐾
              </span>
            </span>
          </button>

          {/* Navegación escritorio (por rol) */}
          <nav className="hidden items-center gap-1 md:flex" aria-label="Navegación principal">
            {navItems.map((n) => (
              <button
                key={n.key}
                onClick={() => setView(n.key)}
                aria-current={view === n.key ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all",
                  view === n.key
                    ? "bg-primary text-primary-foreground shadow-warm"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {n.icon}
                {n.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {/* Tasa del día (BCV auto-actualizada): compacta en móvil, completa en desktop */}
            {settings && (
              <>
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-accent/50 bg-accent/15 px-2 py-1 text-[10px] font-black text-accent-foreground lg:hidden"
                  title={rateTooltip(settings)}
                >
                  <RefreshCcw className="h-3 w-3" />
                  {settings.usdToBs.toFixed(2)} Bs./$
                </span>
                <span
                  className="hidden items-center gap-1.5 rounded-full border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-bold text-accent-foreground lg:inline-flex"
                  title={rateTooltip(settings)}
                >
                  <RefreshCcw className="h-3 w-3" />
                  {settings.usdToBs.toFixed(2)} Bs./$
                </span>
              </>
            )}
            <Button
              variant="outline"
              size="icon"
              className="rounded-xl"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            {/* Sesión */}
            {!authLoaded ? (
              <span className="h-9 w-9 animate-pulse rounded-xl bg-muted" aria-hidden />
            ) : user ? (
              <div className="flex items-center gap-1.5">
                <span
                  className="hidden max-w-[160px] items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-1.5 sm:inline-flex"
                  title={`Sesión: ${user.email}`}
                >
                  <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-lg bg-primary/15 text-[11px] font-black text-primary">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      user.name.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="min-w-0 leading-none">
                    <span className="block truncate text-xs font-bold">{user.name}</span>
                    <span className="block text-[10px] font-semibold text-muted-foreground">{ROLE_LABEL[user.role] ?? user.role}</span>
                  </span>
                </span>
                {user.role === "ADMIN" && (
                  <Button variant="outline" size="icon" className="rounded-xl" onClick={reseedDemo} aria-label="Reiniciar datos demo" title="Reiniciar datos demo (admin)">
                    <RefreshCcw className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="outline" size="icon" className="rounded-xl" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button className="rounded-xl shadow-warm" onClick={() => setView("login")}>
                <LogIn className="mr-1.5 h-4 w-4" /> Iniciar sesión
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* ───────── Contenido ───────── */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-6 md:pb-10">{children}</main>

      {/* ───────── Footer (sticky: mt-auto + min-h-screen en el wrapper) ───────── */}
      <footer className="mt-auto border-t border-border/60 bg-card/60">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 sm:grid-cols-3">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-white">
                <PawPrint className="h-4.5 w-4.5" />
              </span>
              <span className="font-display font-black">PetService VE</span>
            </div>
            <p className="max-w-xs text-sm text-muted-foreground">
              El marketplace de servicios a domicilio para mascotas en toda Venezuela 🇻🇪. Prestadores verificados (activos hoy en Bolívar, llegando a 29 ciudades). Precios en USD y Bs.
            </p>
          </div>
          <div className="text-sm">
            <h3 className="mb-2 font-display font-bold">Servicios</h3>
            <ul className="space-y-1">
              {FOOTER_SERVICES.map((s) => (
                <li key={s.category}>
                  <button
                    onClick={() => searchByCategory(s.category)}
                    className="text-left text-muted-foreground transition-colors hover:text-foreground hover:underline decoration-dotted underline-offset-2"
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="text-sm">
            <h3 className="mb-2 font-display font-bold">Soporte por WhatsApp</h3>
            <p className="text-muted-foreground">
              <a href={`https://wa.me/${SUPPORT_WHATSAPP_WA}`} target="_blank" rel="noopener noreferrer" className="font-bold underline decoration-dotted underline-offset-2 hover:text-foreground">
                {SUPPORT_WHATSAPP}
              </a>
              <br />
              Lunes a sábado, 8:00 a.m. – 6:00 p.m.
            </p>
            <p className="mt-2 text-muted-foreground">
              <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex items-center gap-1.5 font-bold underline decoration-dotted underline-offset-2 hover:text-foreground">
                <Mail className="h-4 w-4" aria-hidden />
                {SUPPORT_EMAIL}
              </a>
            </p>
            <p className="mt-3 flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted-foreground" title="Diseño y desarrollo">
              <Sparkles className="h-3.5 w-3.5 text-violet-500 dark:text-violet-400" aria-hidden />
              {CREDIT_BRAND}
            </p>
            <p className="mt-3 text-xs text-muted-foreground/70">
              Pagos: Pago Móvil · Transferencia · Zelle · Binance · Efectivo
            </p>
          </div>
        </div>
        <div className="border-t border-border/60">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-muted-foreground">
            <span>© {new Date().getFullYear()} PetService VE — Directorio de negocios reales de mascotas · Venezuela 🇻🇪</span>
            <span>
              Datos de negocios ©{" "}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-foreground">
                OpenStreetMap
              </a>{" "}
              contributors (ODbL) · Hecho con 🐾
            </span>
          </div>
        </div>
      </footer>

      {/* ───────── Navegación inferior móvil ───────── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-md md:hidden"
        aria-label="Navegación móvil"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${user ? navItems.length + 1 : 1}, minmax(0, 1fr))` }}
        >
          {navItems.map((n) => (
            <button
              key={n.key}
              onClick={() => setView(n.key)}
              aria-current={view === n.key ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors",
                view === n.key ? "text-primary" : "text-muted-foreground"
              )}
            >
              <span className={cn("rounded-xl px-3 py-1 transition-colors", view === n.key && "bg-primary/10")}>{n.icon}</span>
              {n.short}
            </button>
          ))}
          {user && (
            <button
              onClick={logout}
              className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold text-muted-foreground transition-colors"
            >
              <span className="rounded-xl px-3 py-1"><LogOut className="h-5 w-5" /></span>
              Salir
            </button>
          )}
          {!user && (
            <button
              onClick={() => setView("login")}
              className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold text-primary transition-colors"
            >
              <span className="rounded-xl px-3 py-1"><LogIn className="h-5 w-5" /></span>
              Iniciar sesión
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}

/** Tooltip informativo del badge de tasa (fuente + antigüedad) */
function rateTooltip(s: { usdToBsSource?: string; usdToBsUpdatedAt?: string | null }): string {
  const fuente =
    s.usdToBsSource === "manual"
      ? "tasa establecida manualmente por el admin"
      : s.usdToBsSource?.startsWith("bcv")
        ? "tasa oficial BCV (auto-actualizada)"
        : "tasa referencial";
  const cuando = s.usdToBsUpdatedAt ? relTimeEs(s.usdToBsUpdatedAt) : null;
  return `${fuente}${cuando ? ` · actualizada ${cuando}` : ""}`;
}

/** "hace 5 min", "hace 2 h", "hace 3 d" */
function relTimeEs(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (!isFinite(min)) return "";
  if (min < 1) return "hace instantes";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}
