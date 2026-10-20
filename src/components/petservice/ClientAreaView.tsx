"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Star, Plus, PawPrint, Bell, Wallet, MessageSquareQuote, CalendarDays, ChevronRight, MessageCircle } from "lucide-react";
import { apiGet, apiPost, apiPatch } from "@/lib/petservice/api";
import { useAppStore } from "@/lib/petservice/store";
import { REVIEW_TAGS, PET_SIZES, PET_SPECIES, BOOKING_STATUS } from "@/lib/petservice/constants";
import { fmtUsd, fmtBs, fmtDateTime, fmtRelative, waLink } from "@/lib/petservice/format";
import { Avatar, BookingStatusBadge, PaymentStatusBadge, EmptyState, CategoryIcon } from "@/components/petservice/shared";

interface BookingItem {
  id: string; code: string; status: string; address: string; scheduledAt: string;
  priceUsd: number; priceBs: number; extrasJson: string; notes: string | null; evidenceNote: string | null;
  provider: { id: string; businessName: string; zoneName: string; city: string; badges: string; ratingAvg: number; user?: { phone: string | null } | null };
  service: { name: string; category: string; durationMin: number };
  pet: { name: string; species: string; breed: string | null; size: string };
  payment: { id: string; method: string; status: string; reference: string | null } | null;
  review: { id: string; rating: number } | null;
}
interface PetItem { id: string; name: string; species: string; breed: string | null; size: string; notes: string | null }
interface NotifItem { id: string; channel: string; template: string; body: string; status: string; createdAt: string }

export function ClientAreaView() {
  const { settings, bumpData, openProvider, user } = useAppStore();
  const rate = settings?.usdToBs ?? 40;
  const [bookings, setBookings] = useState<BookingItem[] | null>(null);
  const [pets, setPets] = useState<PetItem[]>([]);
  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [reviewFor, setReviewFor] = useState<BookingItem | null>(null);
  const [addPetOpen, setAddPetOpen] = useState(false);
  const [newPet, setNewPet] = useState({ name: "", species: "PERRO", size: "S", breed: "", notes: "" });

  const load = useCallback(() => {
    apiGet<{ bookings: BookingItem[] }>("/api/bookings")
      .then((d) => setBookings(d.bookings))
      .catch(() => setBookings([]));
    apiGet<{ pets: PetItem[] }>("/api/pets")
      .then((d) => setPets(d.pets))
      .catch(() => setPets([]));
    apiGet<{ notifications: NotifItem[] }>("/api/notifications")
      .then((d) => setNotifs(d.notifications))
      .catch(() => null);
  }, []);

  useEffect(load, [load, bumpData]);

  async function cancelBooking(b: BookingItem) {
    try {
      await apiPatch(`/api/bookings/${b.id}`, { action: "cancel" });
      toast.success(`Reserva ${b.code} cancelada`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error cancelando");
    }
  }

  async function createPet() {
    if (newPet.name.trim().length < 2) return toast.error("Ponle un nombre a tu peludito");
    try {
      const { pet } = await apiPost<{ pet: PetItem }>("/api/pets", newPet);
      setPets((ps) => [...ps, pet]);
      setAddPetOpen(false);
      setNewPet({ name: "", species: "PERRO", size: "S", breed: "", notes: "" });
      toast.success(`${pet.name} registrado 🐾`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  const active = (bookings ?? []).filter((b) => ["PENDIENTE_PAGO", "CONFIRMADA", "EN_CURSO"].includes(b.status));
  const history = (bookings ?? []).filter((b) => ["COMPLETADA", "CANCELADA"].includes(b.status));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Avatar name={user?.name ?? "Cliente"} className="h-12 w-12 text-xl" />
        <div>
          <h1 className="font-display text-2xl font-black">¡Hola, {user?.name.split(" ")[0] ?? "cliente"}! 👋</h1>
          <p className="text-sm text-muted-foreground">Este es el resumen de tus peluditos y reservas</p>
        </div>
      </div>

      <Tabs defaultValue="reservas">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl bg-secondary p-1.5 sm:w-fit">
          <TabsTrigger value="reservas" className="gap-1.5 rounded-xl font-bold"><CalendarDays className="h-4 w-4" /> Reservas</TabsTrigger>
          <TabsTrigger value="mascotas" className="gap-1.5 rounded-xl font-bold"><PawPrint className="h-4 w-4" /> Mascotas</TabsTrigger>
          <TabsTrigger value="notifs" className="gap-1.5 rounded-xl font-bold"><Bell className="h-4 w-4" /> Notificaciones</TabsTrigger>
        </TabsList>

        {/* ─────────── Reservas ─────────── */}
        <TabsContent value="reservas" className="mt-4 space-y-6">
          <section>
            <h2 className="mb-3 font-display text-lg font-extrabold">Próximas y activas ({active.length})</h2>
            {active.length === 0 ? (
              <EmptyState emoji="🗓️" title="No tienes reservas activas" desc="Explora prestadores cerca de ti y agenda en minutos." />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {active.map((b) => <BookingCard key={b.id} b={b} rate={rate} onCancel={cancelBooking} onReview={(bb) => setReviewFor(bb)} onOpenProvider={openProvider} />)}
              </div>
            )}
          </section>
          <section>
            <h2 className="mb-3 font-display text-lg font-extrabold">Historial ({history.length})</h2>
            {history.length === 0 ? (
              <EmptyState emoji="📦" title="Sin historial todavía" />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {history.map((b) => <BookingCard key={b.id} b={b} rate={rate} onCancel={cancelBooking} onReview={(bb) => setReviewFor(bb)} onOpenProvider={openProvider} />)}
              </div>
            )}
          </section>
        </TabsContent>

        {/* ─────────── Mascotas ─────────── */}
        <TabsContent value="mascotas" className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pets.map((p) => (
              <article key={p.id} className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-transform hover:-translate-y-0.5">
                <div className="flex items-center gap-3">
                  <Avatar name={p.name} emoji={p.species === "GATO" ? "🐱" : p.species === "PERRO" ? "🐶" : "🐾"} className="h-12 w-12 text-xl" />
                  <div>
                    <h3 className="font-display font-extrabold">{p.name}</h3>
                    <p className="text-xs text-muted-foreground">{PET_SPECIES[p.species]} {p.breed ? `· ${p.breed}` : ""}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-secondary-foreground">{PET_SIZES[p.size]}</span>
                  {p.notes && <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-bold text-accent-foreground">📝 {p.notes.slice(0, 30)}{p.notes.length > 30 ? "…" : ""}</span>}
                </div>
              </article>
            ))}
            <button onClick={() => setAddPetOpen(true)} className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-muted-foreground transition-all hover:border-primary/50 hover:text-primary">
              <Plus className="h-6 w-6" />
              <span className="text-sm font-bold">Registrar mascota</span>
            </button>
          </div>

          {addPetOpen && (
            <Dialog open onOpenChange={(v) => !v && setAddPetOpen(false)}>
              <DialogContent className="rounded-3xl sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-display font-black">Nueva mascota 🐾</DialogTitle>
                  <DialogDescription>Registra los datos básicos para reservar servicios</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs font-bold">Nombre</Label>
                    <Input value={newPet.name} onChange={(e) => setNewPet({ ...newPet, name: e.target.value })} placeholder="Ej: Simón" className="mt-1 rounded-xl" />
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Especie</Label>
                    <Select value={newPet.species} onValueChange={(v) => setNewPet({ ...newPet, species: v })}>
                      <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PERRO">🐕 Perro</SelectItem>
                        <SelectItem value="GATO">🐈 Gato</SelectItem>
                        <SelectItem value="OTRO">🐾 Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Tamaño</Label>
                    <Select value={newPet.size} onValueChange={(v) => setNewPet({ ...newPet, size: v })}>
                      <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="S">Pequeño</SelectItem>
                        <SelectItem value="M">Mediano</SelectItem>
                        <SelectItem value="L">Grande</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs font-bold">Raza</Label>
                    <Input value={newPet.breed} onChange={(e) => setNewPet({ ...newPet, breed: e.target.value })} placeholder="Ej: Mestizo" className="mt-1 rounded-xl" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs font-bold">Notas para el prestador</Label>
                    <Textarea value={newPet.notes} onChange={(e) => setNewPet({ ...newPet, notes: e.target.value })} rows={2} placeholder="Ej: Nervioso con secadores" className="mt-1 rounded-2xl" />
                  </div>
                </div>
                <Button onClick={createPet} className="w-full rounded-xl bg-primary font-bold">Guardar mascota</Button>
              </DialogContent>
            </Dialog>
          )}
        </TabsContent>

        {/* ─────────── Notificaciones ─────────── */}
        <TabsContent value="notifs" className="mt-4">
          <div className="mx-auto max-w-xl">
            {/* Teléfono estilizado */}
            <div className="overflow-hidden rounded-[2rem] border-4 border-zinc-800 bg-[#e7ffdb] shadow-warm dark:border-zinc-700 dark:bg-emerald-950/40">
              <div className="flex items-center gap-2 bg-[#075E54] px-4 py-2.5 text-white dark:bg-emerald-900">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-emerald-700">🐾</span>
                <div className="flex-1 leading-tight">
                  <div className="text-sm font-bold">PetService VE</div>
                  <div className="text-[10px] opacity-80">cuenta de negocio · en línea</div>
                </div>
                <Bell className="h-4 w-4 opacity-70" />
              </div>
              <div className="scroll-slim max-h-[420px] space-y-2 overflow-y-auto p-3">
                {notifs.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Sin mensajes aún</p>}
                {notifs.map((n) => (
                  <div key={n.id} className={cn("max-w-[88%] rounded-2xl px-3 py-2 text-xs shadow-sm", n.channel === "INAPP" ? "ml-auto rounded-tr-sm bg-amber-50 dark:bg-amber-950/50" : "rounded-tl-sm bg-white dark:bg-zinc-800")}>
                    <p className="leading-relaxed">{n.body}</p>
                    <div className="mt-1 flex items-center justify-end gap-1 text-[9px] text-muted-foreground">
                      {fmtRelative(n.createdAt)}
                      {n.channel === "WHATSAPP" && <span className={cn("ml-0.5 font-black", n.status === "LEIDO" ? "text-sky-600" : "text-zinc-400")}>{n.status === "LEIDO" ? "✓✓" : n.status === "ENTREGADO" ? "✓✓" : "✓"}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              📲 Canal de primera clase: confirmaciones, recordatorios (24h/2h/30min) y estado de pedidos. Opt-out disponible respondiendo SALIR.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog de reseña */}
      <ReviewDialog booking={reviewFor} onClose={() => setReviewFor(null)} onDone={() => { setReviewFor(null); load(); }} />
    </div>
  );
}

// ───────────────────────── Card de reserva ─────────────────────────

function BookingCard({ b, rate, onCancel, onReview, onOpenProvider }: {
  b: BookingItem; rate: number;
  onCancel: (b: BookingItem) => void;
  onReview: (b: BookingItem) => void;
  onOpenProvider: (id: string) => void;
}) {
  const st = BOOKING_STATUS[b.status];
  const extras = JSON.parse(b.extrasJson || "[]") as { name: string; usd: number }[];
  const canCancel = ["PENDIENTE_PAGO", "CONFIRMADA"].includes(b.status);
  const canReview = b.status === "COMPLETADA" && !b.review;
  // WhatsApp real prestador→cliente: chat directo con el número del negocio
  const wa = waLink(
    b.provider.user?.phone,
    `Hola ${b.provider.businessName}! 👋 Soy cliente de PetService VE, escribo por mi reserva ${b.code} (${b.service.name} para ${b.pet.name}). 🐾`
  );

  return (
    <article className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all hover:shadow-warm">
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => onOpenProvider(b.provider.id)} className="group flex items-center gap-2.5 text-left">
          <Avatar name={b.provider.businessName} className="h-10 w-10 text-xs" />
          <div>
            <div className="text-sm font-extrabold group-hover:text-primary group-hover:underline">{b.provider.businessName}</div>
            <div className="text-[11px] text-muted-foreground">{b.provider.zoneName}</div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
        <BookingStatusBadge status={b.status} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-secondary/60 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Servicio</div>
          <div className="mt-0.5 flex items-center gap-1 font-bold"><CategoryIcon category={b.service.category} className="h-3.5 w-3.5" /> {b.service.name}</div>
        </div>
        <div className="rounded-xl bg-secondary/60 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Cuándo</div>
          <div className="mt-0.5 font-bold">{fmtDateTime(b.scheduledAt)}</div>
        </div>
        <div className="rounded-xl bg-secondary/60 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Mascota</div>
          <div className="mt-0.5 font-bold">{b.pet.species === "GATO" ? "🐱" : "🐶"} {b.pet.name} <span className="font-normal text-muted-foreground">({PET_SIZES[b.pet.size]})</span></div>
        </div>
        <div className="rounded-xl bg-secondary/60 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Total</div>
          <div className="mt-0.5 font-bold text-primary">{fmtUsd(b.priceUsd)} <span className="font-normal text-muted-foreground">· {fmtBs(b.priceBs)}</span></div>
        </div>
      </div>

      {extras.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {extras.map((e) => <span key={e.name} className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent-foreground">+ {e.name}</span>)}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-border/70 pt-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-muted-foreground">{b.code}</span>
          {b.payment && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" /> {b.payment.method === "PAGO_MOVIL" ? "Pago Móvil" : b.payment.method === "EFECTIVO" ? "Efectivo" : b.payment.method.toLowerCase()} <PaymentStatusBadge status={b.payment.status} />
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              title={`Chatear con ${b.provider.businessName} por WhatsApp`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-xs font-bold text-white transition-colors hover:bg-[#1ebe5b]"
            >
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
          )}
          {canReview && (
            <Button size="sm" onClick={() => onReview(b)} className="h-8 rounded-lg bg-accent px-3 text-xs font-bold text-accent-foreground hover:bg-accent/90">
              <Star className="h-3.5 w-3.5" /> Calificar
            </Button>
          )}
          {b.status === "EN_CURSO" && <span className={cn("animate-pulse rounded-lg px-2 py-1 text-xs font-bold", st.chip)}>● en curso ahora</span>}
          {canCancel && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 rounded-lg px-3 text-xs font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950">
                  Cancelar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-3xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-display">¿Cancelar la reserva {b.code}? 🥺</AlertDialogTitle>
                  <AlertDialogDescription>
                    Política: con <strong>más de 24h</strong> de anticipación = reembolso total · <strong>menos de 24h</strong> = reembolso del 50%.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl font-bold">Mejor no</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onCancel(b)} className="rounded-xl bg-rose-600 font-bold hover:bg-rose-700">Sí, cancelar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </article>
  );
}

// ───────────────────────── Dialog de reseña ─────────────────────────

function ReviewDialog({ booking, onClose, onDone }: { booking: BookingItem | null; onClose: () => void; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (booking) {
      setRating(5);
      setHover(0);
      setTags([]);
      setComment("");
    }
  }, [booking]);

  if (!booking) return null;

  async function submit() {
    if (!booking) return;
    setSubmitting(true);
    try {
      await apiPost("/api/reviews", { bookingId: booking.id, rating, comment, tags });
      toast.success("¡Gracias por tu reseña! ⭐");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error enviando reseña");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!booking} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display font-black">¿Cómo estuvo el servicio? 🐾</DialogTitle>
          <DialogDescription>
            {booking.service.name} para {booking.pet.name} · {booking.provider.businessName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-center gap-1.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setRating(i)}
                aria-label={`${i} estrellas`}
                className="transition-transform hover:scale-125"
              >
                <Star className={cn("h-9 w-9 transition-colors", i <= (hover || rating) ? "fill-amber-400 text-amber-400" : "fill-zinc-200 text-zinc-200 dark:fill-zinc-700 dark:text-zinc-700")} />
              </button>
            ))}
          </div>

          <div>
            <Label className="text-xs font-bold">¿Qué destacarías?</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {REVIEW_TAGS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTags((ts) => (ts.includes(t.key) ? ts.filter((x) => x !== t.key) : [...ts, t.key]))}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-bold transition-all",
                    tags.includes(t.key) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs font-bold">Tu comentario</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className="mt-1 rounded-2xl" placeholder="Cuéntale a la comunidad cómo fue la experiencia…" />
          </div>

          <Button onClick={submit} disabled={submitting || comment.trim().length < 5} className="w-full rounded-xl bg-primary font-bold">
            <MessageSquareQuote className="h-4 w-4" /> {submitting ? "Enviando…" : "Publicar reseña"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
