"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PawPrint, ChevronLeft, ChevronRight, CheckCircle2, Clock3, MapPin, Wallet, Info, PartyPopper, Plus, MessageCircle } from "lucide-react";
import { apiGet, apiPost } from "@/lib/petservice/api";
import { useAppStore } from "@/lib/petservice/store";
import { PAYMENT_METHODS, ZONES, PET_SIZES, PET_SPECIES, categoryMeta, CANCEL_POLICY } from "@/lib/petservice/constants";
import { fmtUsd, fmtBs, fmtDateShort, todayStr, waLink } from "@/lib/petservice/format";
import { Avatar, CategoryIcon } from "@/components/petservice/shared";
import { SlotChip } from "@/components/petservice/marketplace-parts";

interface ServiceFull {
  id: string; category: string; name: string; description: string; durationMin: number;
  priceUsd: number; petTypes: string; petSizes: string; extrasJson: string;
}
interface PetItem { id: string; name: string; species: string; breed: string | null; size: string; notes: string | null }

const STEPS = ["Servicio", "Mascota", "Dirección", "Horario", "Pago"];

export function BookingWizard() {
  const { bookingDraft, closeBooking, settings, setView, bumpData, user } = useAppStore();
  const open = !!bookingDraft;

  const [step, setStep] = useState(0);
  const [services, setServices] = useState<ServiceFull[]>([]);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [extras, setExtras] = useState<string[]>([]);
  const [pets, setPets] = useState<PetItem[]>([]);
  const [petId, setPetId] = useState<string | null>(null);
  const [newPetOpen, setNewPetOpen] = useState(false);
  const [newPet, setNewPet] = useState({ name: "", species: "PERRO", size: "S", breed: "" });
  const [address, setAddress] = useState("Av. Guayana, Edif. Mirador del Caroní, Piso 4, Alta Vista");
  const [zone, setZone] = useState("Alta Vista");
  const [date, setDate] = useState(todayStr(1));
  const [slots, setSlots] = useState<{ time: string; available: boolean; reason?: string }[]>([]);
  const [slotsTentative, setSlotsTentative] = useState(false);
  const [time, setTime] = useState<string | null>(null);
  const [method, setMethod] = useState<string>("PAGO_MOVIL");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ code: string; status: string; priceUsd: number; priceBs: number; providerName: string; providerPhone: string | null } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [wizardProviderName, setWizardProviderName] = useState("");

  const rate = settings?.usdToBs ?? 40;

  // Carga inicial al abrir (con manejo de errores: nunca crashea la app)
  useEffect(() => {
    if (!bookingDraft) return;
    setStep(0);
    setDone(null);
    setExtras([]);
    setTime(null);
    setReference("");
    setPetId(null);
    setNewPetOpen(false);
    setLoadError(false);
    setDate(todayStr(1));

    // Solo clientes pueden reservar: evita llamadas inútiles y 401/403
    if (!user || user.role !== "CLIENT") return;

    apiGet<{ services: ServiceFull[]; provider?: { businessName: string } }>(`/api/providers/${bookingDraft.providerId}`)
      .then((d) => {
        setServices(d.services);
        setWizardProviderName(d.provider?.businessName ?? "");
        const pre = d.services.find((s) => s.id === bookingDraft.serviceId);
        setServiceId(pre?.id ?? d.services[0]?.id ?? null);
      })
      .catch(() => setLoadError(true));
    apiGet<{ pets: PetItem[] }>("/api/pets")
      .then((d) => {
        setPets(d.pets);
        if (d.pets.length) setPetId(d.pets[0].id);
      })
      .catch(() => setPets([])); // sin mascotas (p. ej. sesión expirada): no crashea
  }, [bookingDraft, user]);

  const service = useMemo(() => services.find((s) => s.id === serviceId) ?? null, [services, serviceId]);
  const extrasList = useMemo(() => (service ? (JSON.parse(service.extrasJson || "[]") as { name: string; usd: number }[]) : []), [service]);
  const pet = useMemo(() => pets.find((p) => p.id === petId) ?? null, [pets, petId]);
  const totalUsd = (service?.priceUsd ?? 0) + extrasList.filter((e) => extras.includes(e.name)).reduce((a, e) => a + e.usd, 0);
  const methodMeta = PAYMENT_METHODS.find((m) => m.key === method)!;

  // Slots al cambiar fecha
  const loadSlots = useCallback(() => {
    if (!bookingDraft || !serviceId) return;
    apiGet<{ slots: typeof slots; tentative?: boolean }>(`/api/bookings/slots?providerId=${bookingDraft.providerId}&date=${date}&serviceId=${serviceId}`)
      .then((d) => {
        setSlots(d.slots);
        setSlotsTentative(Boolean(d.tentative));
        setTime(null);
      })
      .catch(() => toast.error("Error cargando horarios"));
  }, [bookingDraft, date, serviceId]);

  useEffect(() => {
    if (step === 3) loadSlots();
  }, [step, loadSlots]);

  function nextStep() {
    if (step === 0 && (!serviceId || !service)) return toast.error("Selecciona un servicio");
    if (step === 0 && !service.petTypes.split(",").includes(pet?.species ?? "PERRO")) {
      // se valida de verdad en el servidor; aviso preventivo si ya hay mascota elegida
    }
    if (step === 1 && !petId) return toast.error("Selecciona una mascota o registra una nueva");
    if (step === 2 && address.trim().length < 10) return toast.error("Ingresa una dirección completa");
    if (step === 3 && !time) return toast.error("Elige un horario disponible");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function confirm() {
    if (!bookingDraft || !service || !pet) return;
    if (methodMeta.needsReference && reference.trim().length < 4) {
      return toast.error("Ingresa la referencia del pago para poder conciliarlo 🙏");
    }
    setSubmitting(true);
    try {
      const { booking, providerPhone } = await apiPost<{ booking: { id: string; code: string; status: string; priceUsd: number; priceBs: number }; providerPhone: string | null }>("/api/bookings", {
        providerId: bookingDraft.providerId,
        serviceId: service.id,
        petId: pet.id,
        address: `${address}, ${zone}`,
        date,
        time,
        extras: extras,
      });
      const payRes = await apiPost<{ payment: { status: string }; bookingStatus: string }>("/api/payments", {
        bookingId: booking.id,
        method,
        reference: reference || undefined,
      });
      setDone({
        code: booking.code,
        status: payRes.bookingStatus,
        priceUsd: booking.priceUsd,
        priceBs: booking.priceBs,
        providerName: wizardProviderName,
        providerPhone: providerPhone ?? null,
      });
      bumpData();
      toast.success(`¡Reserva ${booking.code} registrada! 🎉`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar la reserva");
    } finally {
      setSubmitting(false);
    }
  }

  async function createPet() {
    if (newPet.name.trim().length < 2) return toast.error("Ponle un nombre a tu peludito");
    try {
      const { pet: created } = await apiPost<{ pet: PetItem }>("/api/pets", newPet);
      setPets((ps) => [...ps, created]);
      setPetId(created.id);
      setNewPetOpen(false);
      setNewPet({ name: "", species: "PERRO", size: "S", breed: "" });
      toast.success(`${created.name} se unió a la familia 🐾`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error creando mascota");
    }
  }

  if (!bookingDraft) return null;

  // ── Guardas de acceso: nunca expuestas a errores 401/403 ──
  if (!user) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && closeBooking()}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader className="items-center text-center">
            <span className="mx-auto mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-accent/25 text-3xl">🔐</span>
            <DialogTitle className="font-display text-xl font-black">Inicia sesión para reservar</DialogTitle>
            <DialogDescription className="text-center">
              Para agendar <strong>{wizardProviderName || "este servicio"}</strong> necesitas una cuenta de cliente (es gratis, en 1 minuto 🐸).
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="rounded-xl font-bold" onClick={closeBooking}>
              Seguir explorando
            </Button>
            <Button className="rounded-xl bg-primary font-bold hover:bg-primary/90" onClick={() => { closeBooking(); setView("login"); }}>
              Iniciar sesión
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (user.role !== "CLIENT") {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && closeBooking()}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader className="items-center text-center">
            <span className="mx-auto mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-accent/25 text-3xl">🎭</span>
            <DialogTitle className="font-display text-xl font-black">Solo las cuentas de cliente reservan</DialogTitle>
            <DialogDescription className="text-center">
              Entraste como <strong>{user.role === "PROVIDER" ? "prestador" : "administrador"}</strong>. Para agendar servicios usa una cuenta de cliente (p. ej. la demo de María en la pantalla de login).
            </DialogDescription>
          </DialogHeader>
          <Button variant="outline" className="mx-auto rounded-xl font-bold" onClick={closeBooking}>
            Entendido
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  if (loadError) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && closeBooking()}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader className="items-center text-center">
            <span className="mx-auto mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-3xl dark:bg-rose-950">🙀</span>
            <DialogTitle className="font-display text-xl font-black">No pudimos cargar el servicio</DialogTitle>
            <DialogDescription className="text-center">Revisa tu conexión e intenta de nuevo en unos segundos.</DialogDescription>
          </DialogHeader>
          <Button variant="outline" className="mx-auto rounded-xl font-bold" onClick={closeBooking}>
            Volver a explorar
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeBooking()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto scroll-slim rounded-3xl p-0 sm:max-w-xl">
        {done ? (
          /* ─────────── Éxito ─────────── */
          <div className="p-6 sm:p-8">
            <DialogHeader className="items-center text-center">
              <span className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950">
                <PartyPopper className="h-8 w-8" />
              </span>
              <DialogTitle className="font-display text-2xl font-black">¡Reserva registrada! 🎉</DialogTitle>
              <DialogDescription className="text-center">
                Código <strong className="font-mono">{done.code}</strong> · Total {fmtUsd(done.priceUsd)} ({fmtBs(done.priceBs)})
              </DialogDescription>
            </DialogHeader>

            {done.status === "CONFIRMADA" ? (
              <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                ✅ Pago en efectivo confirmado — tu reserva está <strong>activa</strong>. El prestador cobrará al finalizar.
              </div>
            ) : (
              <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                🧾 Pago registrado. En cuanto el equipo verifique tu referencia (conciliación), la reserva pasa a <strong>Confirmada</strong>. Te avisamos por WhatsApp 📲
              </div>
            )}

            {/* Preview WhatsApp */}
            <div className="mt-4 rounded-2xl border border-border/70 bg-[#e7ffdb] p-3 dark:bg-emerald-950/60">
              <div className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">📲 Vista previa WhatsApp</div>
              <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-xs shadow-sm dark:bg-zinc-800">
                🐾 <strong>PetService VE:</strong> ¡Hola! Registramos tu solicitud {done.code}. Te enviaremos la confirmación del pago y el recordatorio 24h antes. ¡Gracias por confiar! 💚
              </div>
            </div>

            {(() => {
              const wa = waLink(done.providerPhone, `Hola ${done.providerName}! 👋 Soy cliente de PetService VE, escribo por mi reserva ${done.code}. 🐾`);
              return wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#1ebe5b]"
                >
                  <MessageCircle className="h-4 w-4" /> Chatear ya con {done.providerName} por WhatsApp
                </a>
              ) : null;
            })()}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="outline" className="rounded-xl font-bold" onClick={() => { closeBooking(); setView("client"); }}>
                Ver mis reservas
              </Button>
              <Button className="rounded-xl bg-primary font-bold hover:bg-primary/90" onClick={closeBooking}>
                Seguir explorando
              </Button>
            </div>
          </div>
        ) : (
          /* ─────────── Wizard ─────────── */
          <div className="p-5 sm:p-6">
            {/* Stepper */}
            <div className="mb-5 flex items-center gap-1">
              {STEPS.map((s, i) => (
                <div key={s} className="flex flex-1 items-center gap-1">
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full text-xs font-black transition-all",
                        i < step ? "bg-emerald-500 text-white" : i === step ? "bg-primary text-primary-foreground shadow-warm scale-110" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                    </span>
                    <span className={cn("hidden text-[9px] font-bold uppercase tracking-wide sm:block", i === step ? "text-primary" : "text-muted-foreground")}>{s}</span>
                  </div>
                  {i < STEPS.length - 1 && <div className={cn("mb-0 h-0.5 flex-1 rounded sm:mb-4", i < step ? "bg-emerald-400" : "bg-border")} />}
                </div>
              ))}
            </div>

            <DialogHeader className="mb-3 text-left">
              <DialogTitle className="font-display text-xl font-black">
                {step === 0 && "🛎️ Elige el servicio"}
                {step === 1 && "🐶 ¿A quién consentimos?"}
                {step === 2 && "📍 ¿Dónde lo atendemos?"}
                {step === 3 && "🕐 Fecha y hora"}
                {step === 4 && "💳 Método de pago"}
              </DialogTitle>
              <DialogDescription>
                {step === 0 && "El servicio y los extras que quieres agregar"}
                {step === 1 && "Selecciona una de tus mascotas o registra una nueva"}
                {step === 2 && "Validaremos que estés dentro de la cobertura del prestador"}
                {step === 3 && "Slots según la agenda del prestador"}
                {step === 4 && "Pagas como prefieras — en USD o Bs. a tasa del día"}
              </DialogDescription>
            </DialogHeader>

            {/* Paso 0: Servicio + extras */}
            {step === 0 && (
              <div className="space-y-3">
                <div className="grid gap-2">
                  {services.map((s) => {
                    const cm = categoryMeta(s.category);
                    const selected = s.id === serviceId;
                    return (
                      <button
                        key={s.id}
                        onClick={() => { setServiceId(s.id); setExtras([]); }}
                        className={cn(
                          "flex items-start gap-3 rounded-2xl border-2 p-3 text-left transition-all",
                          selected ? "border-primary bg-primary/5 shadow-warm" : "border-border bg-card hover:border-primary/40"
                        )}
                      >
                        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", cm.soft, cm.iconColor)}>
                          <CategoryIcon category={s.category} className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-extrabold">{s.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{s.durationMin} min · {s.petTypes.split(",").map((t) => PET_SPECIES[t]?.split(" ")[1] ?? t).join("/")}</span>
                        </span>
                        <span className="text-right">
                          <span className="block font-display text-sm font-black text-primary">{fmtUsd(s.priceUsd)}</span>
                          <span className="block text-[10px] font-semibold text-muted-foreground">≈ {fmtBs(s.priceUsd * rate)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {extrasList.length > 0 && (
                  <div className="rounded-2xl bg-secondary/60 p-3">
                    <p className="mb-2 text-xs font-black uppercase tracking-wide text-muted-foreground">Extras opcionales ✨</p>
                    <div className="space-y-2">
                      {extrasList.map((e) => (
                        <label key={e.name} className="flex cursor-pointer items-center justify-between gap-2 rounded-xl bg-card px-3 py-2 text-sm font-semibold shadow-sm">
                          <span className="flex items-center gap-2">
                            <Checkbox
                              checked={extras.includes(e.name)}
                              onCheckedChange={(v) => setExtras((xs) => (v ? [...xs, e.name] : xs.filter((x) => x !== e.name)))}
                            />
                            {e.name}
                          </span>
                          <span className="font-bold text-primary">+{fmtUsd(e.usd)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Paso 1: Mascota */}
            {step === 1 && (
              <div className="space-y-2">
                {pets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPetId(p.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all",
                      petId === p.id ? "border-primary bg-primary/5 shadow-warm" : "border-border bg-card hover:border-primary/40"
                    )}
                  >
                    <Avatar name={p.name} emoji={p.species === "GATO" ? "🐱" : p.species === "PERRO" ? "🐶" : "🐾"} className="h-11 w-11 text-lg" />
                    <span className="flex-1">
                      <span className="block font-extrabold">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">{PET_SPECIES[p.species]} {p.breed ? `· ${p.breed}` : ""} · {PET_SIZES[p.size]}</span>
                      {p.notes && <span className="mt-0.5 block text-[11px] italic text-muted-foreground">“{p.notes}”</span>}
                    </span>
                    {petId === p.id && <CheckCircle2 className="h-5 w-5 text-primary" />}
                  </button>
                ))}
                {!newPetOpen ? (
                  <Button variant="outline" onClick={() => setNewPetOpen(true)} className="w-full rounded-2xl border-2 border-dashed font-bold">
                    <Plus className="h-4 w-4" /> Registrar otra mascota
                  </Button>
                ) : (
                  <div className="space-y-2.5 rounded-2xl border-2 border-primary/30 bg-primary/5 p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2 sm:col-span-1">
                        <Label className="text-xs font-bold">Nombre</Label>
                        <Input value={newPet.name} onChange={(e) => setNewPet({ ...newPet, name: e.target.value })} placeholder="Ej: Rocky" className="mt-1 rounded-xl" />
                      </div>
                      <div className="col-span-2 sm:col-span-1">
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
                      <div>
                        <Label className="text-xs font-bold">Raza (opcional)</Label>
                        <Input value={newPet.breed} onChange={(e) => setNewPet({ ...newPet, breed: e.target.value })} placeholder="Ej: Beagle" className="mt-1 rounded-xl" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={createPet} size="sm" className="rounded-xl bg-primary font-bold">Guardar mascota</Button>
                      <Button onClick={() => setNewPetOpen(false)} size="sm" variant="ghost" className="rounded-xl font-bold">Cancelar</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Paso 2: Dirección */}
            {step === 2 && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-bold">Dirección completa</Label>
                  <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3} className="mt-1 rounded-2xl" placeholder="Calle, edificio, piso, apto, puntos de referencia…" />
                </div>
                <div>
                  <Label className="text-xs font-bold">Zona / Municipio</Label>
                  <Select value={zone} onValueChange={setZone}>
                    <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {ZONES.map((z) => (
                        <SelectItem key={z.name} value={z.name}>{z.name} — {z.city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-start gap-2 rounded-xl bg-accent/15 p-3 text-xs font-semibold text-accent-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  El prestador valida que la dirección esté dentro de su radio de cobertura antes de confirmar. Fallback sin GPS: escribe la dirección y ajusta el mapa ✍️
                </div>
              </div>
            )}

            {/* Paso 3: Fecha y hora */}
            {step === 3 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex gap-1">
                    {[0, 1, 2, 3, 4, 5, 6].map((off) => {
                      const d = todayStr(off);
                      const dt = new Date(`${d}T12:00:00.000Z`);
                      const active = d === date;
                      return (
                        <button
                          key={d}
                          onClick={() => setDate(d)}
                          className={cn(
                            "flex w-12 flex-col items-center rounded-xl border py-1.5 text-[10px] font-bold transition-all",
                            active ? "border-primary bg-primary text-primary-foreground shadow-warm" : "border-border bg-card hover:border-primary/40"
                          )}
                        >
                          <span className="uppercase">{["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][dt.getUTCDay()]}</span>
                          <span className="font-display text-sm font-black">{dt.getUTCDate()}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {slots.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed p-6 text-center text-sm text-muted-foreground">
                    😴 El prestador no atiende este día. Prueba otra fecha.
                  </div>
                ) : (
                  <>
                    {slotsTentative && (
                      <p className="rounded-xl bg-accent/15 px-3 py-2 text-xs font-semibold text-accent-foreground">
                        ℹ️ Este prestador aún no configura su horario semanal: se muestran horarios tentativos (8:00–17:00). Se coordinará contigo por WhatsApp tras reservar.
                      </p>
                    )}
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {slots.map((s) => (
                        <SlotChip key={s.time} time={s.time} selected={time === s.time} disabled={!s.available} reason={s.reason} onClick={() => setTime(s.time)} />
                      ))}
                    </div>
                  </>
                )}
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" /> Duración estimada: {service?.durationMin ?? 60} min
                </p>
              </div>
            )}

            {/* Paso 4: Pago */}
            {step === 4 && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setMethod(m.key)}
                      className={cn(
                        "flex items-start gap-2.5 rounded-2xl border-2 p-3 text-left transition-all",
                        method === m.key ? "border-primary bg-primary/5 shadow-warm" : "border-border bg-card hover:border-primary/40"
                      )}
                    >
                      <span className="text-xl">{m.emoji}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-extrabold">{m.label}</span>
                        <span className="block text-[11px] leading-snug text-muted-foreground">{m.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>

                {methodMeta.needsReference && (
                  <div>
                    <Label className="text-xs font-bold">{methodMeta.refLabel}</Label>
                    <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={methodMeta.placeholder} className="mt-1 rounded-xl font-mono" />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Tras transferir, ingresa la referencia. El equipo la concilia (manual/semiautomático) y tu reserva queda confirmada. 💪
                    </p>
                  </div>
                )}

                {/* Resumen */}
                <div className="rounded-2xl border border-border/70 bg-secondary/50 p-4 text-sm">
                  <div className="mb-2 font-display text-xs font-black uppercase tracking-widest text-muted-foreground">Resumen</div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between"><span className="text-muted-foreground">{service?.name}</span><span className="font-bold">{fmtUsd(service?.priceUsd ?? 0)}</span></div>
                    {extrasList.filter((e) => extras.includes(e.name)).map((e) => (
                      <div key={e.name} className="flex justify-between text-xs"><span className="text-muted-foreground">+ {e.name}</span><span className="font-bold">{fmtUsd(e.usd)}</span></div>
                    ))}
                    <div className="flex justify-between border-t border-dashed pt-2"><span className="font-bold">Total</span><span className="font-display font-black text-primary">{fmtUsd(totalUsd)} <span className="text-xs font-bold text-muted-foreground">· {fmtBs(totalUsd * rate)}</span></span></div>
                  </div>
                  <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-accent/15 p-2.5 text-[11px] font-semibold text-accent-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Cancelación: ≥{CANCEL_POLICY.fullRefundHours}h antes = reembolso total · &lt;{CANCEL_POLICY.fullRefundHours}h = {CANCEL_POLICY.partialPct}%. Tu dinero queda en escrow lógico hasta completar el servicio.
                  </div>
                </div>
              </div>
            )}

            {/* Navegación */}
            <div className="mt-5 flex items-center justify-between gap-2">
              <Button variant="ghost" onClick={() => (step === 0 ? closeBooking() : setStep((s) => s - 1))} className="rounded-xl font-bold">
                <ChevronLeft className="h-4 w-4" /> {step === 0 ? "Cancelar" : "Atrás"}
              </Button>
              <div className="flex items-center gap-2">
                <span className="hidden text-right text-xs font-bold sm:block">
                  Total: <span className="text-primary">{fmtUsd(totalUsd)}</span> <span className="text-muted-foreground">· {fmtBs(totalUsd * rate)}</span>
                </span>
                {step < STEPS.length - 1 ? (
                  <Button onClick={nextStep} className="rounded-xl bg-primary font-bold hover:bg-primary/90">
                    Continuar <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button onClick={confirm} disabled={submitting} className="rounded-xl bg-emerald-600 font-bold hover:bg-emerald-600/90">
                    {submitting ? <PawPrint className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                    {submitting ? "Procesando…" : `Confirmar y pagar`}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
