"use client";

/**
 * PetService VE — Agenda personalizada por prestador (BookingFlowDialog)
 *
 * Diálogo tipo chat que renderiza el bookingFlowJson del prestador:
 * nodos con opciones numeradas (navegación con historial), acciones de
 * reserva (mini-formulario → POST /api/bookings) y acciones de WhatsApp.
 * El contrato del POST lo define src/app/api/bookings/route.ts — el precio
 * SIEMPRE lo calcula el backend.
 */

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  Lock,
  MapPin,
  MessageCircle,
  PartyPopper,
  PawPrint,
  X,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/petservice/api";
import { useAppStore } from "@/lib/petservice/store";
import { fmtUsd, fmtBs, todayStr, waLink } from "@/lib/petservice/format";
import { PET_SIZES, PET_SPECIES } from "@/lib/petservice/constants";

// ───────────────────────────── Tipos del flow ─────────────────────────────

interface FlowOption {
  label: string;
  target: string;
}
interface FlowAction {
  type: string;
  label: string;
  serviceName?: string;
  selectService?: boolean;
  message?: string;
}
interface FlowNode {
  title?: string;
  body?: string[];
  footer?: string;
  options?: FlowOption[];
  actions?: FlowAction[];
}
export interface BookingFlowData {
  version?: number;
  rootId?: string;
  title?: string;
  subtitle?: string;
  buttonLabel?: string;
  nodes: Record<string, FlowNode>;
}
export interface FlowService {
  id: string;
  name: string;
  description?: string;
  durationMin: number;
  priceUsd: number;
  priceToUsd?: number | null;
  modality?: string;
  petTypes?: string;
  petSizes?: string;
}
export interface BookingFlowProvider {
  id: string;
  businessName: string;
  phone?: string | null;
  services: FlowService[];
  bookingFlow: BookingFlowData | null;
}
interface PetLite {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  size: string;
}

const MODALITY_LABEL: Record<string, string> = {
  DOMICILIO: "🏠 A domicilio",
  PICKUP: "🏢 En el local del negocio",
  ONLINE: "💻 Online",
};

/** Horas válidas del flujo personalizado (09:00–17:00, pasos de 1 hora) */
const TIME_OPTIONS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

/** *texto* → <strong> tras escapar HTML (markdown mínimo, seguro) */
function markdownLite(text: string): string {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return esc.replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>");
}

function horaLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h < 12 ? "a.m." : "p.m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** Busca el servicio del action: match EXACTO por nombre, fallback includes */
function matchService(services: FlowService[], serviceName?: string): FlowService | null {
  if (!serviceName) return null;
  return (
    services.find((s) => s.name === serviceName) ??
    services.find((s) => s.name.includes(serviceName)) ??
    services.find((s) => serviceName.includes(s.name)) ??
    null
  );
}

// ───────────────────────────── Acción WhatsApp ─────────────────────────────

function WhatsAppAction({
  phone,
  businessName,
  label,
  message,
}: {
  phone: string | null | undefined;
  businessName: string;
  label: string;
  message?: string;
}) {
  const wa = waLink(phone, message || `Hola ${businessName}! 👋 Los contacto desde PetService VE 🐾`);
  if (!wa) {
    return (
      <Button variant="outline" disabled aria-label={`${label} (teléfono no publicado)`} className="min-h-[44px] w-full rounded-2xl font-bold">
        <MessageCircle className="h-4 w-4" /> {label} — teléfono no publicado
      </Button>
    );
  }
  return (
    <a
      href={wa}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#1ebe5b]"
    >
      <MessageCircle className="h-4 w-4" /> {label}
    </a>
  );
}

// ───────────────────────────── Componente principal ─────────────────────────────

interface SuccessInfo {
  code: string;
  priceUsd: number;
  petName: string;
  serviceName: string;
  date: string;
  time: string;
}

export function BookingFlowDialog({
  open,
  onOpenChange,
  provider,
  rate,
  onBooked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  provider: BookingFlowProvider;
  rate: number;
  onBooked?: () => void;
}) {
  const flow = provider.bookingFlow;
  const rootId = flow?.rootId || "root";
  const { user, setView, bumpData } = useAppStore();

  const [nodeId, setNodeId] = useState<string>(rootId);
  const [history, setHistory] = useState<string[]>([]);
  const [screen, setScreen] = useState<"menu" | "form" | "success">("menu");
  const [action, setAction] = useState<FlowAction | null>(null);

  // Formulario de reserva
  const [pets, setPets] = useState<PetLite[] | null>(null); // null = cargando
  const [petId, setPetId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [date, setDate] = useState(todayStr(1));
  const [time, setTime] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessInfo | null>(null);

  // Reset cada vez que se abre el diálogo
  useEffect(() => {
    if (open) {
      setNodeId(rootId);
      setHistory([]);
      setScreen("menu");
      setAction(null);
      setPets(null);
      setPetId(null);
      setServiceId(provider.services[0]?.id ?? null);
      setDate(todayStr(1));
      setTime(null);
      setAddress("");
      setSubmitting(false);
      setSuccess(null);
    }
  }, [open, rootId, provider.services]);

  const node = flow?.nodes?.[nodeId] ?? null;

  // Mascotas del cliente (solo al entrar al formulario y con sesión activa)
  useEffect(() => {
    if (!open || screen !== "form" || !user || pets !== null) return;
    apiGet<{ pets: PetLite[] }>("/api/pets")
      .then((d) => {
        setPets(d.pets);
        if (d.pets.length) setPetId((cur) => cur ?? d.pets[0].id);
      })
      .catch(() => {
        setPets([]);
        toast.error("No pudimos cargar tus mascotas — revisa tu sesión");
      });
  }, [open, screen, user, pets]);

  const service = useMemo(() => provider.services.find((s) => s.id === serviceId) ?? null, [provider.services, serviceId]);
  const preselected = action?.serviceName ? matchService(provider.services, action.serviceName) : null;

  // ── Navegación del flow ──
  function go(target: string) {
    if (!flow?.nodes?.[target]) {
      toast.error("Esta rama del menú no está disponible 😕");
      return;
    }
    setHistory((h) => [...h, nodeId]);
    setNodeId(target);
  }
  function goBack() {
    if (!history.length) return;
    setNodeId(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  }
  function goMenu() {
    setNodeId(rootId);
    setHistory([]);
    setScreen("menu");
    setAction(null);
  }
  function cancelForm() {
    setScreen("menu");
    setAction(null);
  }

  // ── Reserva ──
  function startBooking(a: FlowAction) {
    if (!provider.services.length) {
      toast.error("Este negocio aún no publica servicios agendables");
      return;
    }
    const pre = matchService(provider.services, a.serviceName);
    setAction(a);
    setServiceId(pre?.id ?? provider.services[0]?.id ?? null);
    setDate(todayStr(1));
    setTime(null);
    setAddress("");
    setNotes(`Agenda personalizada ${provider.businessName}: ${a.label}`.slice(0, 300));
    setSuccess(null);
    setPets(null);
    setPetId(null);
    setScreen("form");
  }

  async function confirm() {
    if (!service) return toast.error("Selecciona un servicio");
    if (!petId) return toast.error("Selecciona una mascota");
    if (!date) return toast.error("Elige la fecha de la cita");
    if (date < todayStr()) return toast.error("La fecha no puede ser en el pasado");
    if (!time || !/^\d{2}:\d{2}$/.test(time) || time < "09:00" || time > "17:00") {
      return toast.error("La hora debe estar entre 09:00 y 17:00");
    }
    if (address.trim().length < 5) return toast.error("Escribe la zona o dirección exacta (mínimo 5 caracteres)");

    setSubmitting(true);
    try {
      const { booking } = await apiPost<{ booking: { id: string; code: string; status: string; priceUsd: number; priceBs: number } }>(
        "/api/bookings",
        {
          providerId: provider.id,
          serviceId: service.id,
          petId,
          address: address.trim(),
          date,
          time,
          extras: [],
          notes: notes.trim() || undefined,
        }
      );
      setSuccess({
        code: booking.code,
        priceUsd: booking.priceUsd,
        petName: pets?.find((p) => p.id === petId)?.name ?? "tu mascota",
        serviceName: service.name,
        date,
        time,
      });
      setScreen("success");
      bumpData();
      toast.success(`¡Pre-agenda ${booking.code} creada! 🎉`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear la pre-agenda");
    } finally {
      setSubmitting(false);
    }
  }

  if (!flow) return null;

  const flowTitle = flow.title || provider.businessName;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-lg">
        {/* ── Cabecera estilo chat ── */}
        <div className="relative bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-500 p-4 pb-5 text-white sm:p-5">
          <div className="bg-paw-dots absolute inset-0 opacity-20" aria-hidden />
          <DialogHeader className="relative space-y-1 pr-10 text-left">
            <DialogTitle className="font-display text-lg font-black leading-tight text-white">{flowTitle}</DialogTitle>
            {flow.subtitle && <DialogDescription className="text-xs font-medium text-white/85">{flow.subtitle}</DialogDescription>}
          </DialogHeader>
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Cerrar agenda personalizada"
            className="absolute top-1.5 right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/30"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ══ MENÚ (navegación del flow) ══ */}
        {screen === "menu" && (
          <>
            <div className="scroll-slim max-h-[70svh] min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
              {node ? (
                <>
                  {/* Burbuja del nodo */}
                  <div className="rounded-2xl rounded-tl-sm bg-secondary/70 p-4">
                    {node.title && (
                      <h3
                        className="font-display text-base font-extrabold leading-snug"
                        dangerouslySetInnerHTML={{ __html: markdownLite(node.title) }}
                      />
                    )}
                    {node.body?.map((p, i) => (
                      <p
                        key={i}
                        className="mt-1.5 text-sm leading-relaxed text-foreground/80"
                        dangerouslySetInnerHTML={{ __html: markdownLite(p) }}
                      />
                    ))}
                    {node.footer && <p className="mt-2 text-[11px] italic text-muted-foreground">{node.footer}</p>}
                  </div>

                  {/* Opciones numeradas */}
                  {node.options && node.options.length > 0 && (
                    <div className="space-y-2" role="group" aria-label="Opciones del menú">
                      {node.options.map((opt, i) => (
                        <button
                          key={`${opt.target}-${i}`}
                          onClick={() => go(opt.target)}
                          className="flex min-h-[44px] w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 text-left text-sm font-bold shadow-sm transition-all hover:border-primary/50 hover:bg-primary/5"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
                            {i + 1}.
                          </span>
                          <span className="flex-1">{opt.label}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Acciones (reservar / WhatsApp) */}
                  {node.actions && node.actions.length > 0 && (
                    <div className="space-y-2 pt-1" role="group" aria-label="Acciones">
                      {node.actions.map((a, i) =>
                        a.type === "book" ? (
                          <Button
                            key={`a-${i}`}
                            onClick={() => startBooking(a)}
                            className="min-h-[44px] w-full rounded-2xl bg-primary font-bold hover:bg-primary/90"
                          >
                            <CalendarPlus className="h-4 w-4" /> {a.label}
                          </Button>
                        ) : (
                          <WhatsAppAction
                            key={`a-${i}`}
                            phone={provider.phone ?? null}
                            businessName={provider.businessName}
                            label={a.label}
                            message={a.message}
                          />
                        )
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  Este menú no está disponible en este momento.
                </div>
              )}
            </div>

            {/* Nav fija: Volver / Menú */}
            <div className="flex items-center gap-2 border-t bg-card p-3">
              {history.length > 0 && (
                <Button
                  variant="outline"
                  onClick={goBack}
                  aria-label="Volver al paso anterior"
                  className="min-h-[44px] flex-1 rounded-xl font-bold"
                >
                  <ChevronLeft className="h-4 w-4" /> VOLVER
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={goMenu}
                aria-label="Volver al menú principal"
                className={cn("min-h-[44px] rounded-xl font-bold", history.length > 0 ? "flex-1" : "w-full")}
              >
                🏠 Menú
              </Button>
            </div>
          </>
        )}

        {/* ══ FORMULARIO DE RESERVA ══ */}
        {screen === "form" && action && (
          <div className="scroll-slim max-h-[70svh] min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            <button
              onClick={cancelForm}
              className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground transition-colors hover:text-primary"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Volver al menú
            </button>

            <h3 className="font-display text-lg font-black leading-tight">🗓️ {action.label}</h3>

            {/* Sin sesión → patrón del BookingWizard */}
            {!user ? (
              <div className="rounded-2xl border border-border bg-card p-5 text-center">
                <span className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-accent/25 text-3xl">🔐</span>
                <h4 className="font-display text-lg font-black">Inicia sesión para agendar</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Para reservar con <strong>{provider.businessName}</strong> necesitas una cuenta de cliente (es gratis, en 1 minuto 🐸).
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button variant="outline" className="min-h-[44px] rounded-xl font-bold" onClick={() => onOpenChange(false)}>
                    Ahora no
                  </Button>
                  <Button
                    className="min-h-[44px] rounded-xl bg-primary font-bold hover:bg-primary/90"
                    onClick={() => {
                      onOpenChange(false);
                      setView("login");
                    }}
                  >
                    <Lock className="h-4 w-4" /> Iniciar sesión
                  </Button>
                </div>
              </div>
            ) : pets === null ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl bg-secondary/60 p-6 text-sm font-semibold text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando tus mascotas…
              </div>
            ) : pets.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-5 text-center">
                <span className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-accent/25 text-3xl">🐾</span>
                <h4 className="font-display text-lg font-black">Primero registra una mascota</h4>
                <p className="mt-1 text-sm text-muted-foreground">
                  Necesitamos al menos una mascota en tu perfil para agendar con {provider.businessName}.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button variant="outline" className="min-h-[44px] rounded-xl font-bold" onClick={() => onOpenChange(false)}>
                    Ahora no
                  </Button>
                  <Button
                    className="min-h-[44px] rounded-xl bg-primary font-bold hover:bg-primary/90"
                    onClick={() => {
                      onOpenChange(false);
                      setView("client");
                    }}
                  >
                    <PawPrint className="h-4 w-4" /> Ir a mis mascotas
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Servicio */}
                {preselected ? (
                  <div>
                    <Label className="text-xs font-black uppercase tracking-wide text-muted-foreground">Servicio</Label>
                    <div className="mt-1.5 rounded-2xl border-2 border-primary/25 bg-primary/5 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-extrabold">{preselected.name}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Clock3 className="h-3 w-3" aria-hidden /> {preselected.durationMin} min
                            </span>
                            <span>{MODALITY_LABEL[preselected.modality ?? "DOMICILIO"] ?? "🏠 A domicilio"}</span>
                          </p>
                        </div>
                        <div className="text-right leading-tight">
                          <p className="font-display text-base font-black text-primary">{fmtUsd(preselected.priceUsd)}</p>
                          <p className="text-[10px] font-semibold text-muted-foreground">≈ {fmtBs(preselected.priceUsd * rate)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="bflow-service" className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                      Servicio
                    </Label>
                    <Select value={serviceId ?? undefined} onValueChange={(v) => setServiceId(v)}>
                      <SelectTrigger id="bflow-service" className="mt-1.5 min-h-[44px] w-full rounded-xl">
                        <SelectValue placeholder="Elige un servicio" />
                      </SelectTrigger>
                      <SelectContent>
                        {provider.services.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} — {fmtUsd(s.priceUsd)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {service && (
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="font-bold text-primary">{fmtUsd(service.priceUsd)}</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3 w-3" aria-hidden /> {service.durationMin} min
                        </span>
                        <span>{MODALITY_LABEL[service.modality ?? "DOMICILIO"] ?? "🏠 A domicilio"}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Mascota */}
                <div>
                  <Label htmlFor="bflow-pet" className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                    Mascota
                  </Label>
                  <Select value={petId ?? undefined} onValueChange={(v) => setPetId(v)}>
                    <SelectTrigger id="bflow-pet" className="mt-1.5 min-h-[44px] w-full rounded-xl">
                      <SelectValue placeholder="Elige una mascota" />
                    </SelectTrigger>
                    <SelectContent>
                      {pets.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.species === "GATO" ? "🐱" : "🐶"} {p.name} · {PET_SPECIES[p.species] ?? p.species} · {PET_SIZES[p.size] ?? p.size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Fecha + hora */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="bflow-date" className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                      Fecha
                    </Label>
                    <Input
                      id="bflow-date"
                      type="date"
                      min={todayStr()}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="mt-1.5 min-h-[44px] rounded-xl"
                    />
                  </div>
                  <div>
                    <Label htmlFor="bflow-time" className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                      Hora (09:00–17:00)
                    </Label>
                    <Select value={time ?? undefined} onValueChange={(v) => setTime(v)}>
                      <SelectTrigger id="bflow-time" className="mt-1.5 min-h-[44px] w-full rounded-xl">
                        <SelectValue placeholder="Elige la hora" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_OPTIONS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {horaLabel(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Dirección */}
                <div>
                  <Label htmlFor="bflow-address" className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                    Zona / dirección
                  </Label>
                  <div className="relative mt-1.5">
                    <MapPin className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      id="bflow-address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Zona / dirección exacta…"
                      className="min-h-[44px] rounded-xl pl-9"
                    />
                  </div>
                </div>

                {/* Notas */}
                <div>
                  <Label htmlFor="bflow-notes" className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                    Notas (opcional)
                  </Label>
                  <Textarea
                    id="bflow-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value.slice(0, 300))}
                    rows={2}
                    maxLength={300}
                    className="mt-1.5 rounded-xl"
                  />
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={cancelForm} className="min-h-[44px] rounded-xl font-bold">
                    Cancelar
                  </Button>
                  <Button
                    onClick={confirm}
                    disabled={submitting}
                    className="min-h-[44px] flex-1 rounded-xl bg-primary font-bold hover:bg-primary/90"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Agendando…
                      </>
                    ) : (
                      <>
                        <CalendarPlus className="h-4 w-4" /> Confirmar pre-agenda
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ ÉXITO ══ */}
        {screen === "success" && success && (
          <div className="scroll-slim max-h-[70svh] min-h-0 flex-1 overflow-y-auto p-6 text-center sm:p-8">
            <span className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950">
              <PartyPopper className="h-8 w-8" aria-hidden />
            </span>
            <DialogHeader className="items-center space-y-1.5 text-center">
              <DialogTitle className="font-display text-2xl font-black">¡Pre-agenda creada! 🎉</DialogTitle>
              <DialogDescription className="text-center">
                Código <strong className="font-mono">{success.code}</strong> · {fmtUsd(success.priceUsd)}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 rounded-2xl bg-violet-50 p-4 text-sm font-semibold text-violet-800 dark:bg-violet-950/40 dark:text-violet-300">
              <CheckCircle2 className="mr-1 inline h-4 w-4" aria-hidden />
              ✅ Quedó en tu <strong>Pre-agenda</strong> — registra tu pago para confirmar.
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              {success.serviceName} · {success.date} · {horaLabel(success.time)} · para {success.petName}
            </p>

            {(() => {
              const wa = waLink(
                provider.phone ?? null,
                `Hola ${provider.businessName}! 🐾 Acabo de agendar ${success.serviceName} (${fmtUsd(success.priceUsd)}) el ${success.date} a las ${success.time} para ${success.petName}. Código ${success.code}.`
              );
              return wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Avisar al negocio por WhatsApp"
                  className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#1ebe5b]"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden /> Avisar al negocio por WhatsApp
                </a>
              ) : null;
            })()}

            <Button
              onClick={() => {
                onOpenChange(false);
                onBooked?.();
              }}
              className="mt-3 min-h-[44px] w-full rounded-xl bg-primary font-bold hover:bg-primary/90"
            >
              Listo
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
