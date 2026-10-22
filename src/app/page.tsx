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
import { useAppStore } from "@/lib/petservice/store";

/** Vistas privadas → rol requerido */
const GUARDS: Record<string, string[]> = {
  client: ["CLIENT"],
  providerDash: ["PROVIDER"],
  admin: ["ADMIN"],
};

export default function Home() {
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
    <AppShell>
      {content}
      <BookingWizard />
      <AiChatWidget />
    </AppShell>
  );
}
