"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Star, Plus, PawPrint, Bell, Wallet, MessageSquareQuote, CalendarDays, ChevronRight, MessageCircle, Search, CalendarClock, Layers, Hourglass } from "lucide-react";
import { apiGet, apiPost, apiPatch } from "@/lib/petservice/api";
import { useAppStore } from "@/lib/petservice/store";
import { REVIEW_TAGS, PET_SIZES, BOOKING_STATUS, PAYMENT_METHODS } from "@/lib/petservice/constants";
import { fmtUsd, fmtBs, fmtDateTime, fmtRelative, waLink } from "@/lib/petservice/format";
import { Avatar, BookingStatusBadge, PaymentStatusBadge, EmptyState, CategoryIcon } from "@/components/petservice/shared";
import { PetCard, PetFormDialog, StatCard, SPECIES_META, type PetFull } from "@/components/petservice/client-parts";
import { AccountProfileEditor } from "@/components/petservice/account-settings";

interface BookingItem {
  id: string; code: string; status: string; address: string; scheduledAt: string;
  priceUsd: number; priceBs: number; extrasJson: string; notes: string | null; evidenceNote: string | null;
  provider: { id: string; businessName: string; zoneName: string; city: string; badges: string; ratingAvg: number; user?: { phone: string | null } | null };
  service: { name: string; category: string; durationMin: number };
  pet: { name: string; species: string; breed: string | null; size: string };
  payment: { id: string; method: string; status: string; reference: string | null } | null;
  review: { id: string; rating: number } | null;
}
interface NotifItem { id: string; channel: string; template: string; body: string; status: string; createdAt: string }

export function ClientAreaView() {
  const { settings, bumpData, openProvider, user } = useAppStore();
  const rate = settings?.usdToBs ?? 40;
  const [bookings, setBookings] = useState<BookingItem[] | null>(null);
  const [pets, setPets] = useState<PetFull[]>([]);
  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [reviewFor, setReviewFor] = useState<BookingItem | null>(null);
  const [payFor, setPayFor] = useState<BookingItem | null>(null);

  // ── Mascotas: filtros + dialog ──
  const [petQuery, setPetQuery] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("ALL");
  const [sizeFilter, setSizeFilter] = useState("ALL");
  const [petSort, setPetSort] = useState("nombre");
  const [petDialogOpen, setPetDialogOpen] = useState(false);
  const [editingPet, setEditingPet] = useState<PetFull | null>(null);

  // ── Reservas: filtros ligeros (estado + búsqueda) ──
  const [bkQuery, setBkQuery] = useState("");
  const [bkStatus, setBkStatus] = useState("ALL");

  const load = useCallback(() => {
    apiGet<{ bookings: BookingItem[] }>("/api/bookings")
      .then((d) => setBookings(d.bookings))
      .catch(() => setBookings([]));
    apiGet<{ pets: PetFull[] }>("/api/pets")
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

  function openCreatePet() {
    setEditingPet(null);
    setPetDialogOpen(true);
  }

  function openEditPet(p: PetFull) {
    setEditingPet(p);
    setPetDialogOpen(true);
  }

  function onPetSaved(saved: PetFull) {
    setPets((ps) => (ps.some((x) => x.id === saved.id) ? ps.map((x) => (x.id === saved.id ? saved : x)) : [...ps, saved]));
    setPetDialogOpen(false);
    setEditingPet(null);
    bumpData();
  }

  function onPetDeleted(id: string) {
    setPets((ps) => ps.filter((p) => p.id !== id));
    bumpData();
  }

  // ── Listado filtrado/ordenado de mascotas ──
  const visiblePets = useMemo(() => {
    const q = petQuery.trim().toLowerCase();
    const list = pets.filter((p) => {
      if (speciesFilter !== "ALL" && p.species !== speciesFilter) return false;
      if (sizeFilter !== "ALL" && p.size !== sizeFilter) return false;
      if (q && !`${p.name} ${p.breed ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const byName = (a: PetFull, b: PetFull) => a.name.localeCompare(b.name, "es");
    if (petSort === "edad") {
      // De mayor a menor edad (nació antes primero); sin fecha al final
      return [...list].sort((a, b) => {
        if (!a.birthDate && !b.birthDate) return byName(a, b);
        if (!a.birthDate) return 1;
        if (!b.birthDate) return -1;
        return a.birthDate.localeCompare(b.birthDate) || byName(a, b);
      });
    }
    if (petSort === "recientes") {
      // No hay createdAt en Pet: el cuid es ordenable por tiempo (aprox. recientes primero)
      return [...list].sort((a, b) => b.id.localeCompare(a.id));
    }
    return [...list].sort(byName);
  }, [pets, petQuery, speciesFilter, sizeFilter, petSort]);

  const petFiltersActive = petQuery.trim() !== "" || speciesFilter !== "ALL" || sizeFilter !== "ALL";

  function clearPetFilters() {
    setPetQuery("");
    setSpeciesFilter("ALL");
    setSizeFilter("ALL");
  }

  // ── KPIs ──
  const speciesCount = new Set(pets.map((p) => p.species)).size;
  const speciesEmojis = [...new Set(pets.map((p) => SPECIES_META[p.species]?.emoji ?? "🐾"))].join(" ");
  const nextBooking = useMemo(() => {
    const list = (bookings ?? []).filter((b) => ["PENDIENTE_PAGO", "CONFIRMADA", "EN_CURSO"].includes(b.status));
    const byDate = (a: BookingItem, b: BookingItem) => a.scheduledAt.localeCompare(b.scheduledAt);
    const future = list.filter((b) => new Date(b.scheduledAt).getTime() >= Date.now()).sort(byDate);
    if (future.length > 0) return future[0];
    return list.filter((b) => b.status === "EN_CURSO").sort(byDate)[0] ?? null;
  }, [bookings]);

  // ── Reservas filtradas ──
  const matchBooking = useCallback(
    (b: BookingItem) => {
      if (bkStatus !== "ALL" && b.status !== bkStatus) return false;
      const q = bkQuery.trim().toLowerCase();
      if (!q) return true;
      return [b.code, b.provider.businessName, b.service.name, b.pet.name].join(" ").toLowerCase().includes(q);
    },
    [bkQuery, bkStatus]
  );

  // Pre-agenda: reserva apartada que aún no tiene pago registrado del cliente
  const preAgenda = (bookings ?? []).filter((b) => b.status === "PENDIENTE_PAGO" && !b.payment && matchBooking(b));
  const active = (bookings ?? []).filter((b) => (["CONFIRMADA", "EN_CURSO"].includes(b.status) || (b.status === "PENDIENTE_PAGO" && !!b.payment)) && matchBooking(b));
  const history = (bookings ?? []).filter((b) => ["COMPLETADA", "CANCELADA"].includes(b.status) && matchBooking(b));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Avatar name={user?.name ?? "Cliente"} src={user?.avatarUrl ?? undefined} className="h-12 w-12 text-xl" />
        <div>
          <h1 className="font-display text-2xl font-black">¡Hola, {user?.name.split(" ")[0] ?? "cliente"}! 👋</h1>
          <p className="text-sm text-muted-foreground">Este es el resumen de tus peluditos y reservas</p>
        </div>
      </div>

      {/* ─────────── KPIs ─────────── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={PawPrint}
          label="Mis mascotas"
          value={`${pets.length} ${pets.length === 1 ? "peludito" : "peluditos"}`}
          sub={pets.length ? "Con ficha lista para reservar 🐾" : "Aún no registras ninguna"}
        />
        <StatCard
          icon={Layers}
          label="Especies distintas"
          value={`${speciesCount}`}
          sub={speciesCount ? `${speciesEmojis} en tu manada` : "Empieza con tu primer peludito"}
        />
        <StatCard
          icon={CalendarClock}
          label="Próxima reserva"
          value={nextBooking ? fmtDateTime(nextBooking.scheduledAt) : "Nada agendado"}
          sub={nextBooking ? `${nextBooking.service.name} · ${nextBooking.provider.businessName}` : "Explora prestadores y agenda"}
          className={nextBooking ? "border-primary/40 bg-primary/5" : undefined}
        />
      </div>

      <Tabs defaultValue="reservas">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl bg-secondary p-1.5 sm:w-fit">
          <TabsTrigger value="reservas" className="gap-1.5 rounded-xl font-bold"><CalendarDays className="h-4 w-4" /> Reservas</TabsTrigger>
          <TabsTrigger value="mascotas" className="gap-1.5 rounded-xl font-bold"><PawPrint className="h-4 w-4" /> Mascotas</TabsTrigger>
          <TabsTrigger value="notifs" className="gap-1.5 rounded-xl font-bold"><Bell className="h-4 w-4" /> Notificaciones</TabsTrigger>
          <TabsTrigger value="perfil" className="gap-1.5 rounded-xl font-bold">👤 Mi perfil</TabsTrigger>
        </TabsList>

        {/* ─────────── Reservas ─────────── */}
        <TabsContent value="reservas" className="mt-4 space-y-6">
          {/* Filtros ligeros */}
          <div className="grid gap-2 rounded-2xl border border-border/70 bg-card p-3 sm:grid-cols-[1fr_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={bkQuery}
                onChange={(e) => setBkQuery(e.target.value)}
                placeholder="Buscar por código, prestador, servicio o mascota…"
                aria-label="Buscar reservas"
                className="h-10 rounded-xl pl-9"
              />
            </div>
            <Select value={bkStatus} onValueChange={setBkStatus}>
              <SelectTrigger aria-label="Filtrar por estado" className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Estado: Todos</SelectItem>
                {Object.entries(BOOKING_STATUS).map(([key, meta]) => (
                  <SelectItem key={key} value={key}>{meta.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <section>
            <h2 className="mb-3 font-display text-lg font-extrabold">⏳ Pre-agenda — falta tu pago ({preAgenda.length})</h2>
            {preAgenda.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border/70 bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
                Aquí verás las reservas que apartes antes de registrar el pago. Al registrar tu pago pasan a “Confirmadas y en curso”.
              </p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {preAgenda.map((b) => <BookingCard key={b.id} b={b} rate={rate} onCancel={cancelBooking} onPay={(bb) => setPayFor(bb)} onReview={(bb) => setReviewFor(bb)} onOpenProvider={openProvider} />)}
              </div>
            )}
          </section>
          <section>
            <h2 className="mb-3 font-display text-lg font-extrabold">Confirmadas y en curso ({active.length})</h2>
            {active.length === 0 ? (
              <EmptyState emoji="🗓️" title={bkQuery || bkStatus !== "ALL" ? "Nada con esos filtros" : "No tienes reservas activas"} desc={bkQuery || bkStatus !== "ALL" ? "Prueba con otro estado o limpia la búsqueda." : "Explora prestadores cerca de ti y agenda en minutos."} />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {active.map((b) => <BookingCard key={b.id} b={b} rate={rate} onCancel={cancelBooking} onPay={(bb) => setPayFor(bb)} onReview={(bb) => setReviewFor(bb)} onOpenProvider={openProvider} />)}
              </div>
            )}
          </section>
          <section>
            <h2 className="mb-3 font-display text-lg font-extrabold">Historial ({history.length})</h2>
            {history.length === 0 ? (
              <EmptyState emoji="📦" title={bkQuery || bkStatus !== "ALL" ? "Nada con esos filtros" : "Sin historial todavía"} />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {history.map((b) => <BookingCard key={b.id} b={b} rate={rate} onCancel={cancelBooking} onPay={(bb) => setPayFor(bb)} onReview={(bb) => setReviewFor(bb)} onOpenProvider={openProvider} />)}
              </div>
            )}
          </section>
        </TabsContent>

        {/* ─────────── Mi perfil ─────────── */}
        <TabsContent value="perfil" className="mt-4">
          <div className="mx-auto max-w-2xl">
            <AccountProfileEditor />
          </div>
        </TabsContent>

        {/* ─────────── Mascotas (pro) ─────────── */}
        <TabsContent value="mascotas" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-extrabold">
              Mis Mascotas
              <span className="ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-secondary px-2 text-xs font-black text-secondary-foreground">{pets.length}</span>
            </h2>
            <Button onClick={openCreatePet} className="h-11 rounded-xl bg-primary font-bold shadow-warm" aria-label="Agregar mascota">
              <Plus className="h-4 w-4" /> Agregar mascota
            </Button>
          </div>

          {/* Barra de herramientas */}
          <div className="grid gap-2 rounded-2xl border border-border/70 bg-card p-3 md:grid-cols-[1fr_150px_150px_170px] sm:grid-cols-2">
            <div className="relative sm:col-span-2 md:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={petQuery}
                onChange={(e) => setPetQuery(e.target.value)}
                placeholder="Buscar por nombre o raza…"
                aria-label="Buscar mascotas por nombre o raza"
                className="h-10 rounded-xl pl-9"
              />
            </div>
            <Select value={speciesFilter} onValueChange={setSpeciesFilter}>
              <SelectTrigger aria-label="Filtrar por especie" className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas las especies</SelectItem>
                {Object.entries(SPECIES_META).map(([key, meta]) => (
                  <SelectItem key={key} value={key}>{meta.emoji} {meta.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sizeFilter} onValueChange={setSizeFilter}>
              <SelectTrigger aria-label="Filtrar por tamaño" className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los tamaños</SelectItem>
                <SelectItem value="S">Pequeño (S)</SelectItem>
                <SelectItem value="M">Mediano (M)</SelectItem>
                <SelectItem value="L">Grande (L)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={petSort} onValueChange={setPetSort}>
              <SelectTrigger aria-label="Ordenar mascotas" className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nombre">Orden: Nombre (A-Z)</SelectItem>
                <SelectItem value="edad">Orden: Edad (mayor primero)</SelectItem>
                <SelectItem value="recientes">Orden: Más recientes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Grid / estados vacíos */}
          {pets.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-primary/30 bg-accent/5 px-6 py-12 text-center">
              <div className="animate-floaty text-6xl" aria-hidden>🐶</div>
              <h3 className="mt-4 font-display text-xl font-black">Aún no tienes mascotas registradas 🐶</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                ¡Agrega a tu primer peludito! Con su ficha lista, reservar grooming, paseos, pet sitting o consulta vet toma un minuto.
              </p>
              <Button onClick={openCreatePet} className="mt-5 h-11 rounded-xl bg-primary font-bold shadow-warm">
                <Plus className="h-4 w-4" /> Agregar mascota
              </Button>
            </div>
          ) : visiblePets.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border px-6 py-12 text-center">
              <div className="text-5xl" aria-hidden>🔎</div>
              <p className="mt-3 font-display text-base font-black">Ninguna mascota coincide con los filtros</p>
              <p className="mt-1 text-sm text-muted-foreground">Prueba con otro nombre, especie o tamaño.</p>
              <Button variant="outline" onClick={clearPetFilters} className="mt-4 h-10 rounded-xl font-bold">
                Limpiar filtros
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visiblePets.map((p) => (
                <PetCard key={p.id} pet={p} onEdit={openEditPet} onDeleted={onPetDeleted} />
              ))}
            </div>
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

      {/* Dialog crear/editar mascota */}
      <PetFormDialog open={petDialogOpen} pet={editingPet} onClose={() => { setPetDialogOpen(false); setEditingPet(null); }} onSaved={onPetSaved} />

      {/* Dialog de reseña */}
      <ReviewDialog booking={reviewFor} onClose={() => setReviewFor(null)} onDone={() => { setReviewFor(null); load(); }} />
      <PaymentDialog booking={payFor} rate={rate} onClose={() => setPayFor(null)} onDone={() => { setPayFor(null); load(); }} />
    </div>
  );
}

// ───────────────────────── Card de reserva ─────────────────────────

function BookingCard({ b, rate, onCancel, onPay, onReview, onOpenProvider }: {
  b: BookingItem; rate: number;
  onCancel: (b: BookingItem) => void;
  onPay: (b: BookingItem) => void;
  onReview: (b: BookingItem) => void;
  onOpenProvider: (id: string) => void;
}) {
  const st = BOOKING_STATUS[b.status];
  const extras = JSON.parse(b.extrasJson || "[]") as { name: string; usd: number }[];
  const canCancel = ["PENDIENTE_PAGO", "CONFIRMADA"].includes(b.status);
  const canReview = b.status === "COMPLETADA" && !b.review;
  // Pre-agenda: apartada sin pago registrado todavía
  const isPreAgenda = b.status === "PENDIENTE_PAGO" && !b.payment;
  // WhatsApp real prestador→cliente: chat directo con el número del negocio
  const wa = waLink(
    b.provider.user?.phone,
    `Hola ${b.provider.businessName}! 👋 Soy cliente de PetService VE, escribo por mi reserva ${b.code} (${b.service.name} para ${b.pet.name}). 🐾`
  );

  return (
    <article className={cn("rounded-2xl border bg-card p-4 shadow-sm transition-all hover:shadow-warm", isPreAgenda && "border-violet-300 ring-2 ring-violet-200 dark:border-violet-800 dark:ring-violet-900/60")}>
      {isPreAgenda && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
          <Hourglass className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span><strong>Pre-agenda:</strong> apartamos tu espacio. Registra tu pago para que quede confirmada y el prestador la reciba en su agenda.</span>
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => onOpenProvider(b.provider.id)} className="group flex items-center gap-2.5 text-left">
          <Avatar name={b.provider.businessName} className="h-10 w-10 text-xs" />
          <div>
            <div className="text-sm font-extrabold group-hover:text-primary group-hover:underline">{b.provider.businessName}</div>
            <div className="text-[11px] text-muted-foreground">{b.provider.zoneName}</div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
        {isPreAgenda ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-extrabold text-violet-800 dark:bg-violet-950/60 dark:text-violet-300">
            <Hourglass className="h-3 w-3" aria-hidden /> Pre-agenda
          </span>
        ) : (
          <BookingStatusBadge status={b.status} />
        )}
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
          {(b.status === "PENDIENTE_PAGO" && (!b.payment || b.payment.status === "RECHAZADO")) && (
            <Button size="sm" onClick={() => onPay(b)} className="h-8 rounded-lg bg-primary px-3 text-xs font-bold hover:bg-primary/90" aria-label={`Registrar pago de la reserva ${b.code}`}>
              <Wallet className="h-3.5 w-3.5" /> Registrar pago
            </Button>
          )}
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

// ───────────────────────── Dialog de registro de pago (pre-agenda → por verificar) ─────────────────────────

function PaymentDialog({ booking, rate, onClose, onDone }: { booking: BookingItem | null; rate: number; onClose: () => void; onDone: () => void }) {
  const [method, setMethod] = useState("PAGO_MOVIL");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (booking) { setMethod("PAGO_MOVIL"); setReference(""); }
  }, [booking]);

  if (!booking) return null;
  const meta = PAYMENT_METHODS.find((m) => m.key === method)!;
  const rejected = booking.payment?.status === "RECHAZADO";

  async function submit() {
    if (!booking) return;
    if (meta.needsReference && reference.trim().length < 4) {
      toast.error("Ingresa la referencia o comprobante del pago");
      return;
    }
    setSubmitting(true);
    try {
      await apiPost("/api/payments", { bookingId: booking.id, method, reference: reference.trim() || undefined });
      toast.success(`Pago registrado para ${booking.code}. Quedó “por verificar” hasta que el administrador lo concilie. 🧾`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar el pago");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!booking} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85svh] overflow-y-auto rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">💳 Registrar pago — {booking.code}</DialogTitle>
          <DialogDescription>
            {booking.service.name} · {booking.pet.name} · {fmtUsd(booking.priceUsd)} ≈ {fmtBs(booking.priceBs)} (tasa {fmtBs(rate)}/$)
          </DialogDescription>
        </DialogHeader>
        {rejected && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            Tu pago anterior fue rechazado. Verifica la referencia e intenta de nuevo.
          </p>
        )}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pay-method">Método de pago</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="pay-method" aria-label="Método de pago" className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.emoji} {m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] leading-snug text-muted-foreground">{meta.desc}</p>
          </div>
          {meta.needsReference && (
            <div className="space-y-1.5">
              <Label htmlFor="pay-ref">{meta.refLabel}</Label>
              <Input
                id="pay-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={meta.placeholder}
                className="h-11 rounded-xl font-mono"
                inputMode="text"
                autoComplete="off"
              />
            </div>
          )}
          {method === "EFECTIVO" && (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              El pago en efectivo confirma la reserva de inmediato; se abona al prestador al finalizar el servicio.
            </p>
          )}
          <Button onClick={submit} disabled={submitting} className="h-11 w-full rounded-xl bg-primary font-bold">
            <Wallet className="h-4 w-4" /> {submitting ? "Registrando…" : "Registrar pago"}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Tras registrar el pago, tu reserva queda “por verificar” hasta que el equipo concilie la referencia.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
