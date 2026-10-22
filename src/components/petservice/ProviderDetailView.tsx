"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, MapPin, ShieldCheck, Sparkles, Star, Clock3, PawPrint, CalendarPlus, Info, MessageSquareQuote, MessageCircle, Navigation, Instagram, Facebook, Globe, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/petservice/api";
import { useAppStore } from "@/lib/petservice/store";
import { categoryMeta, PET_SIZES, PET_SPECIES } from "@/lib/petservice/constants";
import { fmtUsd, fmtBs, fmtDateShort, fmtRelative, waLink } from "@/lib/petservice/format";
import { fmtDrive } from "@/lib/petservice/routing";
import { Avatar, CategoryIcon, EmptyState, RatingStars } from "@/components/petservice/shared";
import { BookingFlowDialog, type BookingFlowData } from "@/components/petservice/BookingFlowDialog";

interface Detail {
  provider: {
    id: string; businessName: string; ownerName: string; phone?: string | null; bio: string; status: string;
    city: string; zoneName: string; lat: number; lng: number; radiusKm: number;
    scheduleJson: string; ratingAvg: number; ratingCount: number; badges: string;
    googleRating?: number | null; googleReviews?: number | null;
    avatarUrl?: string | null; isNew?: boolean;
    bookingFlow?: BookingFlowData | null;
    socials?: { instagram?: string | null; facebook?: string | null; tiktok?: string | null; website?: string | null };
  };
  services: {
    id: string; category: string; name: string; description: string; durationMin: number;
    priceUsd: number; modality: string; petTypes: string; petSizes: string; extrasJson: string;
  }[];
  reviews: { id: string; authorName: string; rating: number; comment: string; tags: string; response: string | null; createdAt: string }[];
  tagCounts: Record<string, number>;
  drive?: { km: number | null; min: number | null; straightKm: number | null } | null;
}

/** Enlace universal de Google Maps para trazar la ruta hasta el prestador */
function gmapsDirectionsUrl(lat: number, lng: number, name: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_query=${encodeURIComponent(name)}`;
}

const WEEK_LABELS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export function ProviderDetailView() {
  const { selectedProviderId, backToHome, settings, openBooking, bumpData, loc } = useAppStore();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);

  useEffect(() => {
    if (!selectedProviderId) return;
    const qs = new URLSearchParams({ lat: String(loc.lat), lng: String(loc.lng) });
    apiGet<Detail>(`/api/providers/${selectedProviderId}?${qs}`)
      .then(setData)
      .catch(() => setError(true));
  }, [selectedProviderId, loc.lat, loc.lng]);

  if (error) {
    return <EmptyState emoji="🙀" title="No encontramos este prestador" desc="Quizás ya no está disponible." action={<Button onClick={backToHome} variant="outline" className="rounded-xl font-bold">Volver a explorar</Button>} />;
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-3xl" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
      </div>
    );
  }

  const { provider, services, reviews, tagCounts } = data;
  const rate = settings?.usdToBs ?? 40;
  const meta = categoryMeta(services[0]?.category ?? "GROOMING");
  const schedule = JSON.parse(provider.scheduleJson || "{}") as Record<string, [string, string][]>;

  return (
    <div className="space-y-5 pb-4">
      {/* Botón volver */}
      <button onClick={backToHome} className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground transition-colors hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Volver a resultados
      </button>

      {/* Cabecera */}
      <header className="relative overflow-hidden rounded-3xl border border-border/60 bg-card shadow-warm">
        <div className={cn("h-24 bg-gradient-to-r sm:h-28", meta.key === "GROOMING" ? "from-teal-500 to-emerald-400" : meta.key === "DELIVERY" ? "from-orange-400 to-amber-400" : meta.key === "SPA_MOVIL" ? "from-fuchsia-400 to-pink-400" : "from-amber-400 to-orange-400")}>
          <div className="bg-paw-dots h-full w-full opacity-25" aria-hidden />
        </div>
        <div className="px-5 pb-5 sm:px-7">
          <div className="-mt-10 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-end gap-3">
              <span className="ring-4 ring-card">
                <Avatar name={provider.businessName} emoji={meta.emoji} src={provider.avatarUrl ?? undefined} className="h-20 w-20 text-3xl" />
              </span>
              <div className="pb-1">
                <h1 className="font-display text-2xl font-black leading-tight">{provider.businessName}</h1>
                <p className="text-sm text-muted-foreground">por {provider.ownerName} · {provider.city}</p>
                {provider.isNew && (
                  <span title="Prestador registrado recientemente en PetService-VE" className="mt-1 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 px-2.5 py-0.5 text-[11px] font-black text-white shadow-sm">
                    ✨ Nuevo prestador
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pb-1">
              {provider.phone && waLink(provider.phone, `¡Hola ${provider.businessName}! 👋 Los contacté desde PetService VE 🐾`) && (
                <a
                  href={waLink(provider.phone, `¡Hola ${provider.businessName}! 👋 Los contacté desde PetService VE 🐾`) ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Consultar directamente por WhatsApp"
                  className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-xs font-bold text-white transition-colors hover:bg-[#1ebe5b] md:h-8"
                >
                  <MessageSquareQuote className="h-3.5 w-3.5" /> Consultar por WhatsApp
                </a>
              )}
              <a
                href={gmapsDirectionsUrl(provider.lat, provider.lng, provider.businessName)}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir la ruta hasta este prestador en Google Maps"
                className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 md:h-8"
              >
                <Navigation className="h-3.5 w-3.5" /> Cómo llegar
              </a>
              {provider.badges.split(",").filter(Boolean).map((b) => (
                <span
                  key={b}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black",
                    b === "VERIFICADO" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
                    b === "TOP" && "bg-accent text-accent-foreground",
                    b === "GATOS" && "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
                    b === "EXPRESS" && "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300"
                  )}
                >
                  {b === "VERIFICADO" && <ShieldCheck className="h-3.5 w-3.5" />}
                  {b === "TOP" && <Star className="h-3.5 w-3.5" />}
                  {b === "GATOS" && "🐈"}
                  {b === "EXPRESS" && "⚡"}
                  {b === "VERIFICADO" ? "Identidad verificada" : b === "TOP" ? "Top calificado" : b === "GATOS" ? "Amigable con gatos" : "Entrega express"}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            <RatingStars value={provider.ratingAvg} count={provider.ratingCount} />
            {(provider.googleRating ?? (provider.ratingCount === 0 ? provider.ratingAvg : 0)) >= 4 && (
              <span
                title={`Ficha pública de Google Maps: ${(provider.googleRating ?? provider.ratingAvg).toFixed(1)}★`}
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
              >
                <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" /> {(provider.googleRating ?? provider.ratingAvg).toFixed(1)} en Google
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <MapPin className="h-4 w-4" /> {provider.zoneName} · cobertura {provider.radiusKm} km
            </span>
            {data.drive?.km != null && data.drive?.min != null && (
              <span className="inline-flex items-center gap-1 font-semibold text-primary" title={`Distancia real de conducción (OSRM). En línea recta: ${data.drive.straightKm ?? "—"} km`}>
                🚗 {fmtDrive(data.drive.km, data.drive.min)} en carro
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <CategoryIcon category={services[0]?.category ?? ""} className="h-4 w-4" /> {services.length} servicios
            </span>
          </div>
        </div>
      </header>

      <Tabs defaultValue="servicios">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl bg-secondary p-1.5 sm:w-fit">
          <TabsTrigger value="servicios" className="gap-1.5 rounded-xl font-bold data-[state=active]:bg-card data-[state=active]:shadow-sm">
            🛎️ Servicios
          </TabsTrigger>
          <TabsTrigger value="resenas" className="gap-1.5 rounded-xl font-bold data-[state=active]:bg-card data-[state=active]:shadow-sm">
            ⭐ Reseñas ({reviews.length})
          </TabsTrigger>
          <TabsTrigger value="horario" className="gap-1.5 rounded-xl font-bold data-[state=active]:bg-card data-[state=active]:shadow-sm">
            🕐 Horario
          </TabsTrigger>
          <TabsTrigger value="sobre" className="gap-1.5 rounded-xl font-bold data-[state=active]:bg-card data-[state=active]:shadow-sm">
            ℹ️ Sobre
          </TabsTrigger>
        </TabsList>

        {/* ── Servicios ── */}
        <TabsContent value="servicios" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {services.map((s) => {
              const cm = categoryMeta(s.category);
              const extras = JSON.parse(s.extrasJson || "[]") as { name: string; usd: number }[];
              return (
                <article key={s.id} className="flex flex-col rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-warm">
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", cm.soft, cm.iconColor)}>
                      <CategoryIcon category={s.category} className="h-3.5 w-3.5" />
                      {cm.label}
                    </span>
                    <div className="text-right leading-tight">
                      {s.priceUsd > 0 ? (
                        <>
                          <div className="font-display text-lg font-black text-primary">{fmtUsd(s.priceUsd)}</div>
                          <div className="text-[11px] font-semibold text-muted-foreground">≈ {fmtBs(s.priceUsd * rate)}</div>
                        </>
                      ) : (
                        <div className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-secondary-foreground">💬 A consultar</div>
                      )}
                    </div>
                  </div>
                  <h3 className="mt-2 font-display text-base font-extrabold">{s.name}</h3>
                  <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{s.description}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {s.durationMin} min</span>
                    <span>{s.petTypes.split(",").map((t) => PET_SPECIES[t] ?? t).join(" · ")}</span>
                    <span className="inline-flex items-center gap-1"><PawPrint className="h-3.5 w-3.5" /> {s.petSizes.split(",").map((t) => PET_SIZES[t]).join(" / ")}</span>
                  </div>

                  {extras.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {extras.map((e) => (
                        <span key={e.name} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-secondary-foreground">
                          + {e.name} ({fmtUsd(e.usd)})
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Botón Agendar (wizard) + Agenda personalizada (si el prestador define un flow) */}
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    {s.priceUsd > 0 && (
                      <Button
                        onClick={() => openBooking({ providerId: provider.id, serviceId: s.id })}
                        className="min-h-[44px] flex-1 rounded-xl bg-primary font-bold hover:bg-primary/90"
                      >
                        <CalendarPlus className="h-4 w-4" /> Reservar ahora
                      </Button>
                    )}
                    {provider.phone && s.priceUsd <= 0 && (
                      <Button
                        asChild
                        className="min-h-[44px] flex-1 rounded-xl bg-[#25D366] font-bold text-white hover:bg-[#25D366]/90"
                      >
                        <a
                          href={waLink(provider.phone, `Hola ${provider.businessName}, vi su negocio en PetService VE y me interesa: ${s.name}. ¿Me pueden dar precios y disponibilidad? 🐾`) ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <MessageCircle className="h-4 w-4" /> Consultar por WhatsApp
                        </a>
                      </Button>
                    )}
                    {!provider.phone && s.priceUsd <= 0 && (
                      <Button disabled variant="outline" className="min-h-[44px] flex-1 rounded-xl font-bold">
                        Teléfono no publicado
                      </Button>
                    )}
                    {provider.bookingFlow && (
                      <Button
                        onClick={() => setFlowOpen(true)}
                        variant="outline"
                        aria-label="Abrir la agenda personalizada del prestador"
                        className="min-h-[44px] flex-1 rounded-xl border-violet-300 bg-violet-50 font-bold text-violet-700 hover:bg-violet-100 hover:text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-900/50"
                      >
                        <Sparkles className="h-4 w-4" /> {provider.bookingFlow.buttonLabel || "✨ Agenda personalizada"}
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </TabsContent>

        {/* ── Reseñas ── */}
        <TabsContent value="resenas" className="mt-4">
          {Object.keys(tagCounts).length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).map(([tag, count]) => (
                <span key={tag} className="rounded-full bg-accent/20 px-3 py-1 text-xs font-bold text-accent-foreground">
                  {tag === "PUNTUALIDAD" ? "⏰" : tag === "TRATO" ? "❤️" : tag === "PRECIO" ? "💰" : "✨"} {tag.toLowerCase()} · {count}
                </span>
              ))}
            </div>
          )}
          {reviews.length === 0 ? (
            <EmptyState emoji="⭐" title="Aún no hay reseñas" desc="Sé el primero en dejar una reseña tras tu servicio." />
          ) : (
            <div className="scroll-slim max-h-[480px] space-y-3 overflow-y-auto pr-1">
              {reviews.map((r) => (
                <article key={r.id} className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={r.authorName} className="h-9 w-9 text-xs" />
                      <div>
                        <div className="text-sm font-bold">{r.authorName}</div>
                        <div className="text-[11px] text-muted-foreground">{fmtRelative(r.createdAt)}</div>
                      </div>
                    </div>
                    <RatingStars value={r.rating} size="xs" />
                  </div>
                  <p className="mt-2 text-sm leading-relaxed">{r.comment}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.tags.split(",").filter(Boolean).map((t) => (
                      <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-secondary-foreground">
                        {t.toLowerCase()}
                      </span>
                    ))}
                  </div>
                  {r.response && (
                    <div className="mt-3 rounded-xl bg-primary/5 p-3 text-xs">
                      <span className="inline-flex items-center gap-1 font-bold text-primary">
                        <MessageSquareQuote className="h-3.5 w-3.5" /> Respuesta de {provider.businessName}
                      </span>
                      <p className="mt-1 text-muted-foreground">{r.response}</p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Horario ── */}
        <TabsContent value="horario" className="mt-4">
          <div className="grid gap-2 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:grid-cols-2">
            {[1, 2, 3, 4, 5, 6, 7].map((day) => {
              const ranges = schedule[String(day)] ?? [];
              return (
                <div key={day} className={cn("flex items-center justify-between rounded-xl px-3 py-2.5 text-sm", ranges.length ? "bg-secondary/50" : "opacity-50")}>
                  <span className="font-bold">{WEEK_LABELS[day]}</span>
                  <span className={cn("text-xs font-semibold", ranges.length ? "text-primary" : "text-muted-foreground")}>
                    {ranges.length ? ranges.map(([a, b]) => `${a}–${b}`).join(" · ") : "Descanso 😴"}
                  </span>
                </div>
              );
            })}
            <p className="col-span-full mt-1 flex items-start gap-1.5 rounded-xl bg-accent/15 p-3 text-xs font-semibold text-accent-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Los slots se muestran al agendar según la duración del servicio. Los horarios con menos de 1 hora de anticipación se bloquean.
            </p>
          </div>
        </TabsContent>

        {/* ── Sobre ── */}
        <TabsContent value="sobre" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-[1.5fr_1fr]">
            <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
              <h3 className="font-display font-extrabold">Sobre {provider.businessName}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{provider.bio}</p>
              {(provider.socials?.instagram || provider.socials?.facebook || provider.socials?.tiktok || provider.socials?.website) && (
                <div className="mt-4">
                  <h4 className="text-xs font-black uppercase tracking-wide text-muted-foreground">Redes y contacto</h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {provider.socials?.instagram && (
                      <a href={provider.socials.instagram} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold transition-colors hover:bg-secondary/70">
                        <Instagram className="h-3.5 w-3.5 text-pink-500" /> Instagram
                      </a>
                    )}
                    {provider.socials?.facebook && (
                      <a href={provider.socials.facebook} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold transition-colors hover:bg-secondary/70">
                        <Facebook className="h-3.5 w-3.5 text-sky-600" /> Facebook
                      </a>
                    )}
                    {provider.socials?.tiktok && (
                      <a href={provider.socials.tiktok} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold transition-colors hover:bg-secondary/70">
                        <Music2 className="h-3.5 w-3.5" /> TikTok
                      </a>
                    )}
                    {provider.socials?.website && (
                      <a href={provider.socials.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold transition-colors hover:bg-secondary/70">
                        <Globe className="h-3.5 w-3.5 text-primary" /> Sitio web
                      </a>
                    )}
                  </div>
                </div>
              )}
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                Verificación PetService: identidad y teléfono confirmados. El documento de identidad está protegido y solo el equipo de soporte puede consultarlo — nunca se muestra públicamente.
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
              <h3 className="font-display font-extrabold">Cobertura</h3>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2">
                  <span className="font-semibold">Zona base</span>
                  <span className="font-bold text-primary">{provider.zoneName}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2">
                  <span className="font-semibold">Radio de servicio</span>
                  <span className="font-bold">{provider.radiusKm} km</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2">
                  <span className="font-semibold">Modalidad</span>
                  <span className="font-bold">A domicilio 🏠</span>
                </div>
              </div>
              <a
                href={gmapsDirectionsUrl(provider.lat, provider.lng, provider.businessName)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Navigation className="h-4 w-4" /> Cómo llegar — abrir ruta en Google Maps
              </a>
              {data.drive?.km != null && data.drive?.min != null && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Desde tu punto de búsqueda: {fmtDrive(data.drive.km, data.drive.min)} en carro
                </p>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Agenda personalizada (flujo tipo chat del prestador) */}
      {provider.bookingFlow && (
        <BookingFlowDialog
          open={flowOpen}
          onOpenChange={setFlowOpen}
          provider={{
            id: provider.id,
            businessName: provider.businessName,
            phone: provider.phone ?? null,
            services,
            bookingFlow: provider.bookingFlow,
          }}
          rate={rate}
          onBooked={bumpData}
        />
      )}
    </div>
  );
}
