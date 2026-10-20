"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Play, CheckCircle2, XCircle, Camera, TrendingUp, CalendarDays, Star, MessageSquareQuote, Wallet, PawPrint, Sparkles, MessageCircle } from "lucide-react";
import { apiGet, apiPatch } from "@/lib/petservice/api";
import { useAppStore } from "@/lib/petservice/store";
import { fmtUsd, fmtBs, fmtDateTime, fmtRelative, waLink } from "@/lib/petservice/format";
import { Avatar, BookingStatusBadge, PaymentStatusBadge, RatingStars, EmptyState, CategoryIcon } from "@/components/petservice/shared";
import { categoryMeta } from "@/lib/petservice/constants";
import { ConsultasIA } from "@/components/petservice/ConsultasIA";

interface BookingItem {
  id: string; code: string; status: string; address: string; scheduledAt: string;
  priceUsd: number; priceBs: number; commissionUsd: number; extrasJson: string; notes: string | null; evidenceNote: string | null;
  client: { name: string; phone: string | null };
  service: { name: string; category: string; durationMin: number };
  pet: { name: string; species: string; breed: string | null; size: string; notes: string | null };
  payment: { id: string; method: string; status: string; reference: string | null } | null;
  review: { id: string; rating: number } | null;
}
interface ProviderInfo {
  id: string; businessName: string; status: string; ratingAvg: number; ratingCount: number; zoneName: string; city: string;
}
interface ReviewItem {
  id: string; authorName: string; rating: number; comment: string; tags: string; response: string | null; createdAt: string;
}

export function ProviderDashboard() {
  const { bumpData, settings } = useAppStore();
  const rate = settings?.usdToBs ?? 40;
  const [bookings, setBookings] = useState<BookingItem[] | null>(null);
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [completeFor, setCompleteFor] = useState<BookingItem | null>(null);
  const [evidence, setEvidence] = useState("");
  const [respondFor, setRespondFor] = useState<ReviewItem | null>(null);
  const [responseText, setResponseText] = useState("");

  const load = useCallback(() => {
    apiGet<{ bookings: BookingItem[]; provider: ProviderInfo }>("/api/bookings")
      .then((d) => {
        setBookings(d.bookings);
        setProvider(d.provider);
        apiGet<{ reviews: ReviewItem[] }>(`/api/providers/${d.provider.id}`)
          .then((r) => setReviews(r.reviews))
          .catch(() => setReviews([]));
      })
      .catch(() => {
        setBookings([]);
        setReviews([]);
        toast.error("No se pudo cargar tu panel — inicia sesión de nuevo");
      });
  }, []);

  useEffect(load, [load, bumpData]);

  async function act(b: BookingItem, action: "start" | "cancel" | "complete", extra?: Record<string, unknown>) {
    try {
      await apiPatch(`/api/bookings/${b.id}`, { action, ...extra });
      toast.success(
        action === "start" ? `Servicio ${b.code} iniciado 🏃` :
        action === "complete" ? `¡${b.code} completado! 💚` :
        `Reserva ${b.code} cancelada`
      );
      setCompleteFor(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  async function respondReview() {
    if (!respondFor || responseText.trim().length < 3) return;
    try {
      await apiPatch("/api/reviews", { id: respondFor.id, action: "respond", response: responseText });
      toast.success("Respuesta publicada 💬");
      setRespondFor(null);
      setResponseText("");
      load();
    } catch {
      toast.error("No se pudo responder");
    }
  }

  const pending = (bookings ?? []).filter((b) => b.status === "PENDIENTE_PAGO");
  const upcoming = (bookings ?? []).filter((b) => ["CONFIRMADA", "EN_CURSO"].includes(b.status));
  const done = (bookings ?? []).filter((b) => ["COMPLETADA", "CANCELADA"].includes(b.status));

  // Métricas del mes
  const monthDone = done.filter((b) => b.status === "COMPLETADA");
  const revenue = monthDone.reduce((a, b) => a + b.priceUsd, 0);
  const commission = monthDone.reduce((a, b) => a + b.commissionUsd, 0);
  const netRevenue = revenue - commission;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={provider?.businessName ?? "Pet Spa VIP"} emoji="✂️" className="h-12 w-12 text-xl" />
          <div>
            <h1 className="font-display text-2xl font-black">{provider?.businessName ?? "…"}</h1>
            <p className="text-sm text-muted-foreground">Panel de prestador · {provider?.zoneName}, {provider?.city}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-4 py-2.5 shadow-sm">
          <RatingStars value={provider?.ratingAvg ?? 0} count={provider?.ratingCount} />
          <span className="text-xs font-bold text-muted-foreground">· reputación</span>
        </div>
      </div>

      {/* Métricas rápidas */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard emoji="📥" label="Solicitudes por pagar" value={String(pending.length)} hint="esperando conciliación" accent="text-amber-600" />
        <MetricCard emoji="📅" label="Agenda activa" value={String(upcoming.length)} hint="confirmadas y en curso" accent="text-emerald-600" />
        <MetricCard emoji="💰" label="Ingresos (completados)" value={fmtUsd(revenue)} hint={`≈ ${fmtBs(revenue * rate)}`} accent="text-primary" />
        <MetricCard emoji="🏦" label="Tu ganancia neta" value={fmtUsd(netRevenue)} hint={`comisión plataforma: ${fmtUsd(commission)}`} accent="text-accent-foreground" />
      </div>

      <Tabs defaultValue="agenda">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl bg-secondary p-1.5 sm:w-fit">
          <TabsTrigger value="agenda" className="gap-1.5 rounded-xl font-bold"><CalendarDays className="h-4 w-4" /> Agenda</TabsTrigger>
          <TabsTrigger value="resenas" className="gap-1.5 rounded-xl font-bold"><Star className="h-4 w-4" /> Reseñas ({reviews.length})</TabsTrigger>
          <TabsTrigger value="consultas" className="gap-1.5 rounded-xl font-bold"><Sparkles className="h-4 w-4" /> Consultas IA</TabsTrigger>
          <TabsTrigger value="perfil" className="gap-1.5 rounded-xl font-bold"><PawPrint className="h-4 w-4" /> Mi perfil</TabsTrigger>
        </TabsList>

        {/* ── Agenda ── */}
        <TabsContent value="agenda" className="mt-4 space-y-6">
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-lg font-extrabold">🔔 Activas — atiende a tus peluditos</h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {upcoming.map((b) => (
                  <ProviderBookingCard key={b.id} b={b} rate={rate} onStart={() => act(b, "start")} onComplete={() => { setCompleteFor(b); setEvidence(""); }} onCancel={() => act(b, "cancel")} />
                ))}
              </div>
            </section>
          )}
          {pending.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-lg font-extrabold">⏳ Pendientes de pago</h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {pending.map((b) => <ProviderBookingCard key={b.id} b={b} rate={rate} onStart={() => act(b, "start")} onComplete={() => setCompleteFor(b)} onCancel={() => act(b, "cancel")} />)}
              </div>
            </section>
          )}
          <section>
            <h2 className="mb-3 font-display text-lg font-extrabold">📚 Historial</h2>
            {done.length === 0 ? (
              <EmptyState emoji="🗂️" title="Sin historial todavía" />
            ) : (
              <div className="scroll-slim max-h-[420px] space-y-3 overflow-y-auto pr-1">
                {done.map((b) => <ProviderBookingCard key={b.id} b={b} rate={rate} compact />)}
              </div>
            )}
          </section>
        </TabsContent>

        {/* ── Reseñas ── */}
        <TabsContent value="resenas" className="mt-4">
          {reviews.length === 0 ? (
            <EmptyState emoji="⭐" title="Aún sin reseñas" />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {reviews.map((r) => (
                <article key={r.id} className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={r.authorName} className="h-9 w-9 text-xs" />
                      <div>
                        <div className="text-sm font-bold">{r.authorName}</div>
                        <div className="text-[11px] text-muted-foreground">{fmtRelative(r.createdAt)}</div>
                      </div>
                    </div>
                    <RatingStars value={r.rating} size="xs" />
                  </div>
                  <p className="mt-2 text-sm">{r.comment}</p>
                  {r.response ? (
                    <div className="mt-3 rounded-xl bg-primary/5 p-3 text-xs">
                      <span className="font-bold text-primary">💬 Tu respuesta:</span>
                      <p className="mt-1 text-muted-foreground">{r.response}</p>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => { setRespondFor(r); setResponseText(""); }} className="mt-3 rounded-lg text-xs font-bold">
                      <MessageSquareQuote className="h-3.5 w-3.5" /> Responder
                    </Button>
                  )}
                </article>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Consultas IA ── */}
        <TabsContent value="consultas" className="mt-4">
          <ConsultasIA scope="provider" />
        </TabsContent>

        {/* ── Perfil ── */}
        <TabsContent value="perfil" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
              <h3 className="font-display font-extrabold">📊 Estado de verificación</h3>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2"><span className="font-semibold">Identidad (cédula)</span><span className="font-bold text-emerald-600">✔ Verificada</span></div>
                <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2"><span className="font-semibold">Teléfono</span><span className="font-bold text-emerald-600">✔ Verificado</span></div>
                <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2"><span className="font-semibold">Antecedentes</span><span className="text-xs text-muted-foreground">opcional — pendiente</span></div>
                <p className="rounded-xl bg-accent/15 p-3 text-xs font-semibold text-accent-foreground">🔒 Tu documento está cifrado y solo el admin puede consultarlo. Nunca se muestra al público.</p>
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
              <h3 className="font-display font-extrabold">💼 Resumen de negocio</h3>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2"><span className="font-semibold">Zona base</span><span className="font-bold">{provider?.zoneName}</span></div>
                <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2"><span className="font-semibold">Comisión plataforma</span><span className="font-bold">{settings?.commissionPct ?? 15}%</span></div>
                <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2"><span className="font-semibold">Servicios publicados</span><span className="font-bold">3 activos</span></div>
                <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2"><span className="font-semibold">Tasa del día</span><span className="font-bold">{rate.toFixed(2)} Bs./$</span></div>
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground">
                <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                Los pagos verificados se acumulan para tu próximo payout semanal (escrow lógico liberado por servicio completado).
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog completar con evidencia */}
      <Dialog open={!!completeFor} onOpenChange={(v) => !v && setCompleteFor(null)}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-black">Completar servicio 📸</DialogTitle>
            <DialogDescription>
              {completeFor?.service.name} de {completeFor?.pet.name} · {completeFor?.code}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="flex items-center gap-1.5 text-xs font-bold"><Camera className="h-3.5 w-3.5" /> Evidencia (antes/después)</Label>
              <Textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} rows={3} className="mt-1 rounded-2xl" placeholder="Ej: Antes pelo enredado → después corte maltés clásico + lazo 🎀" />
              <p className="mt-1 text-[11px] text-muted-foreground">En la app móvil se suben fotos; en esta demo registras la descripción. El cliente la verá junto a tu reseña.</p>
            </div>
            <Button onClick={() => completeFor && act(completeFor, "complete", { evidence })} className="w-full rounded-xl bg-emerald-600 font-bold hover:bg-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Marcar como completado
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog responder reseña */}
      <Dialog open={!!respondFor} onOpenChange={(v) => !v && setRespondFor(null)}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-black">Responder a {respondFor?.authorName} 💬</DialogTitle>
            <DialogDescription>“{respondFor?.comment}”</DialogDescription>
          </DialogHeader>
          <Textarea value={responseText} onChange={(e) => setResponseText(e.target.value)} rows={3} className="rounded-2xl" placeholder="Gracias por tus palabras… 🐾" />
          <Button onClick={respondReview} className="w-full rounded-xl bg-primary font-bold">Publicar respuesta</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({ emoji, label, value, hint, accent }: { emoji: string; label: string; value: string; hint: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-transform hover:-translate-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-xl">{emoji}</span>
        <TrendingUp className="h-4 w-4 text-muted-foreground/40" />
      </div>
      <div className={cn("mt-1.5 font-display text-xl font-black", accent)}>{value}</div>
      <div className="text-xs font-bold">{label}</div>
      <div className="text-[10px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function ProviderBookingCard({ b, rate, onStart, onComplete, onCancel, compact }: {
  b: BookingItem; rate: number; compact?: boolean;
  onStart?: () => void; onComplete?: () => void; onCancel?: () => void;
}) {
  const cm = categoryMeta(b.service.category);
  return (
    <article className={cn("rounded-2xl border border-border/70 bg-card p-4 shadow-sm", compact && "text-sm")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", cm.soft, cm.iconColor)}>
            <CategoryIcon category={b.service.category} className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-extrabold">{b.service.name}</div>
            <div className="text-[11px] text-muted-foreground">{fmtDateTime(b.scheduledAt)} · {b.code}</div>
          </div>
        </div>
        <BookingStatusBadge status={b.status} />
      </div>

      <div className="mt-2.5 grid gap-1.5 text-xs sm:grid-cols-2">
        <div><span className="font-bold">👤 {b.client.name}</span> <span className="text-muted-foreground">· {b.client.phone}</span></div>
        <div><span className="font-bold">{b.pet.species === "GATO" ? "🐱" : "🐶"} {b.pet.name}</span> <span className="text-muted-foreground">({b.pet.breed ?? "criollo"} · {b.pet.size})</span></div>
        <div className="sm:col-span-2 text-muted-foreground">📍 {b.address}</div>
        {b.pet.notes && <div className="sm:col-span-2 rounded-lg bg-amber-50 px-2.5 py-1.5 font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">📝 Nota de la mascota: {b.pet.notes}</div>}
        {b.notes && <div className="sm:col-span-2 rounded-lg bg-accent/15 px-2.5 py-1.5 font-semibold text-accent-foreground">💬 Nota del cliente: {b.notes}</div>}
        {b.evidenceNote && <div className="sm:col-span-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">📸 {b.evidenceNote}</div>}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-border/70 pt-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-display font-black text-primary">{fmtUsd(b.priceUsd)}</span>
          <span className="text-muted-foreground">· {fmtBs(b.priceBs)} · com. {fmtUsd(b.commissionUsd)}</span>
          {b.payment && <PaymentStatusBadge status={b.payment.status} />}
          {b.payment && <span className="inline-flex items-center gap-1 text-muted-foreground"><Wallet className="h-3.5 w-3.5" />{b.payment.method.replace("_", " ").toLowerCase()}</span>}
        </div>
        {!compact && (
          <div className="flex gap-1.5">
            {(() => {
              // WhatsApp directo al cliente (número real, mensaje prellenado)
              const wa = waLink(
                b.client.phone,
                `Hola ${b.client.name.split(" ")[0]}! 👋 Te escribo de PetService VE por tu reserva ${b.code} (${b.service.name} de ${b.pet.name}). 🐾`
              );
              return wa && b.status !== "CANCELADA" ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Chatear con ${b.client.name} por WhatsApp`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-xs font-bold text-white transition-colors hover:bg-[#1ebe5b]"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </a>
              ) : null;
            })()}
            {b.status === "CONFIRMADA" && onStart && (
              <Button size="sm" onClick={onStart} className="h-8 rounded-lg bg-primary px-3 text-xs font-bold"><Play className="h-3.5 w-3.5" /> Iniciar</Button>
            )}
            {b.status === "EN_CURSO" && onComplete && (
              <Button size="sm" onClick={onComplete} className="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-bold hover:bg-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Completar</Button>
            )}
            {b.status === "PENDIENTE_PAGO" && <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground"><XCircle className="h-3.5 w-3.5" /> Esperando pago del cliente</span>}
            {(b.status === "CONFIRMADA" || b.status === "PENDIENTE_PAGO") && onCancel && (
              <Button size="sm" variant="ghost" onClick={onCancel} className="h-8 rounded-lg px-3 text-xs font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950">Cancelar</Button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
