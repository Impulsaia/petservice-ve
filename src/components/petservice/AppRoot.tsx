"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/petservice/AppShell";
import { MarketplaceView } from "@/components/petservice/MarketplaceView";
import { ProviderDetailView } from "@/components/petservice/ProviderDetailView";
import { ClientAreaView } from "@/components/petservice/ClientAreaView";
import { ProviderDashboard } from "@/components/petservice/ProviderDashboard";
import { AdminPanel } from "@/components/petservice/AdminPanel";
import { LoginView } from "@/components/petservice/LoginView";
import { BookingWizard } from "@/components/petservice/BookingWizard";
import { AiChatWidget } from "@/components/petservice/AiChatWidget";
import { PawPrint } from "lucide-react";
import { useAppStore, type Filters } from "@/lib/petservice/store";
import { apiGet } from "@/lib/petservice/api";
import { CATEGORIES, type CategoryKey } from "@/lib/petservice/constants";

/** Vistas privadas → rol requerido */
const GUARDS: Record<string, string[]> = {
  client: ["CLIENT"],
  providerDash: ["PROVIDER"],
  admin: ["ADMIN"],
};

/**
 * SPA cliente (toda la app vive en "/").
 * Se separó de page.tsx para que la página pueda añadir contenido SEO
 * server-rendered (SeoContent) alrededor de la app.
 */
export function AppRoot() {
  const view = useAppStore((s) => s.view);
  const selectedProviderId = useAppStore((s) => s.selectedProviderId);
  const user = useAppStore((s) => s.user);
  const authLoaded = useAppStore((s) => s.authLoaded);
  const setView = useAppStore((s) => s.setView);

  // Guarda de rutas: si la vista es privada y no hay sesión con rol, ir a login
  useEffect(() => {
    if (!authLoaded) return;
    const required = GUARDS[view];
    if (required && (!user || !required.includes(user.role))) {
      setView("login");
    }
  }, [view, user, authLoaded, setView]);

  // ── Deep-links SEO (GEO): el SPA consume parámetros de la URL al montar ──
  // - /?q=veterinario        → SearchAction de Google (sitelinks search box)
  // - /?ciudad=Puerto%20Ordaz → enlaces de ciudades desde el bloque informativo/IA
  // - /?cat=GROOMING          → enlaces de categorías
  // Los parámetros se consumen una sola vez y se limpian de la URL.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q")?.trim() || "";
      const ciudad = params.get("ciudad")?.trim() || "";
      const cat = params.get("cat")?.trim() || "";
      if (!q && !ciudad && !cat) return;

      const { setFilters, setCity } = useAppStore.getState();

      const patch: Partial<Filters> = {};
      if (q) patch.q = q.slice(0, 120);
      if (cat) {
        const key = CATEGORIES.find((c) => c.key.toLowerCase() === cat.toLowerCase())?.key;
        if (key) patch.category = key as CategoryKey;
      }
      if (Object.keys(patch).length) setFilters(patch);

      if (ciudad) {
        apiGet<{ cities: { name: string; state: string; lat: number; lng: number }[] }>("/api/cities")
          .then((d) => {
            const wanted = ciudad.toLowerCase();
            const target = d.cities.find((c) => c.name.toLowerCase() === wanted);
            if (target) setCity(target.name, { label: target.name, lat: target.lat, lng: target.lng });
          })
          .catch(() => {}); // ciudad desconocida: se ignora silenciosamente
      }

      // URL limpia (sin recargar): evita re-aplicar los parámetros al recargar
      window.history.replaceState(null, "", window.location.pathname);
    } catch {
      /* entorno sin history (raro) — ignorar */
    }
  }, []);

  // Al cambiar de vista o de prestador, la ventana SIEMPRE arranca arriba:
  // el SPA conserva el scroll previo y en móvil abría el perfil a media página.
  const viewKey = `${view}:${selectedProviderId ?? ""}`;
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [viewKey]);

  // key: remonta el detalle al cambiar de prestador (evita setState en effect)
  const content = !authLoaded ? (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <PawPrint className="h-10 w-10 animate-pulse text-primary" />
      <p className="text-sm font-semibold">Cargando PetService VE…</p>
    </div>
  ) : view === "login" ? (
    <LoginView />
  ) : view === "home" ? (
    <MarketplaceView />
  ) : view === "provider" ? (
    <ProviderDetailView key={selectedProviderId ?? "none"} />
  ) : view === "client" && user?.role === "CLIENT" ? (
    <ClientAreaView />
  ) : view === "providerDash" && user?.role === "PROVIDER" ? (
    <ProviderDashboard />
  ) : view === "admin" && user?.role === "ADMIN" ? (
    <AdminPanel />
  ) : (
    <MarketplaceView />
  );

  return (
    <>
      {content}
      <BookingWizard />
      <AiChatWidget />
    </>
  );
}
