"use client";

/**
 * PetService VE — Dashboard del Prestador (Task 19-b)
 * Tabs: Resumen · Mis Servicios (CRUD) · CRM Clientes · Calendario · Reservas
 *       (+ Reseñas, Consultas IA y Perfil heredados).
 * Los datos vienen de las APIs con scope de sesión (anti-IDOR) vía fetch relativo.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays, Camera, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Download, FilterX,
  LayoutDashboard, MapPin, MessageCircle, MessageSquareQuote, Pencil, Play, Plus, QrCode, Search,
  Scissors, Sparkles, Star, Trash2, TrendingUp, Users, Wallet, XCircle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { apiGet, apiPatch } from "@/lib/petservice/api";
import { useAppStore } from "@/lib/petservice/store";
import { fmtBs, fmtDate, fmtDateTime, fmtDateShort, fmtRelative, fmtUsd, todayStr, waLink } from "@/lib/petservice/format";
import { Avatar, BookingStatusBadge, CategoryIcon, EmptyState, PaymentStatusBadge, RatingStars } from "@/components/petservice/shared";
import { categoryMeta, CATEGORIES } from "@/lib/petservice/constants";
import { ConsultasIA } from "@/components/petservice/ConsultasIA";
import {
  apiDelete, BookingDetailDialog, CalEventItem, ContactDialog, ContactItem, ContactStatusBadge,
  CrmStats, EVENT_STATUS_META, EVENT_TYPE_META, EventFormDialog, MonthGrid,
  ProviderBookingItem, ServiceCard, ServiceFormDialog, ServiceItem, Spin, StatCard, TagBadges, WaButton,
  WeeklyScheduleEditor,
  parseTags,
} from "@/components/petservice/provider-parts";
import {
  BulkContactPanel, QrDialog, TagFilterBar, TemplatesDialog,
  exportContactsCsv, exportContactsVcf,
} from "@/components/petservice/provider-crm-parts";
import { AccountProfileEditor, BusinessProfileEditor } from "@/components/petservice/account-settings";

interface ProviderInfo {
  id: string; businessName: string; status: string; ratingAvg: number; ratingCount: number; zoneName: string; city: string;
  avatarUrl?: string | null;
}
interface ReviewItem {
  id: string; authorName: string; rating: number; comment: string; tags: string; response: string | null; createdAt: string;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

interface UpcomingRowData { key: string; date: string; time: string; title: string; type: string; status: string; sub: string; }

export function ProviderDashboard() {
  const { bumpData, settings, setSettings, user } = useAppStore();
  const rate = settings?.usdToBs ?? 40;
  const [tab, setTab] = useState("resumen");

  // ── Datos base ──
  const [bookings, setBookings] = useState<ProviderBookingItem[] | null>(null);
  const [services, setServices] = useState<ServiceItem[] | null>(null);
  const [events, setEvents] = useState<CalEventItem[] | null>(null);
  const [contacts, setContacts] = useState<ContactItem[] | null>(null);
  const [crmStats, setCrmStats] = useState<CrmStats | null>(null);
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);

  // ── Servicios: filtros y diálogos ──
  const [svcQ, setSvcQ] = useState("");
  const [svcCat, setSvcCat] = useState("all");
  const [svcActive, setSvcActive] = useState("all");
  const [svcMin, setSvcMin] = useState("");
  const [svcMax, setSvcMax] = useState("");
  const [svcDialog, setSvcDialog] = useState<ServiceItem | "NEW" | null>(null);
  const [svcDelete, setSvcDelete] = useState<ServiceItem | null>(null);
  const [svcBusy, setSvcBusy] = useState<string | null>(null);

  // ── CRM ──
  const [cQ, setCQ] = useState("");
  const [cStatus, setCStatus] = useState("all");
  const [cSource, setCSource] = useState("all");
  const [cSort, setCSort] = useState("recent");
  const [cRefresh, setCRefresh] = useState(0);
  const [cLoading, setCLoading] = useState(true);
  const [crmDialog, setCrmDialog] = useState<ContactItem | "NEW" | null>(null);
  // CRM-lite WhatsApp (Task 26-d): etiquetas + plantillas + QR
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplContactId, setTplContactId] = useState<string | null>(null);
  const [tplVersion, setTplVersion] = useState(0);
  const [qrOpen, setQrOpen] = useState(false);

  // ── Calendario ──
  const [cursor, setCursor] = useState(() => {
    const [y, m] = todayStr().split("-").map(Number);
    return { y, m };
  });
  const [calType, setCalType] = useState("all");
  const [calStatus, setCalStatus] = useState("all");
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [eventDialog, setEventDialog] = useState<{ day: string; event: CalEventItem | null } | null>(null);
  const [eventDelete, setEventDelete] = useState<CalEventItem | null>(null);
  const [eventBusy, setEventBusy] = useState<string | null>(null);

  // ── Reservas: filtros y diálogos ──
  const [bStatus, setBStatus] = useState("all");
  const [bFrom, setBFrom] = useState("");
  const [bTo, setBTo] = useState("");
  const [bService, setBService] = useState("all");
  const [bQ, setBQ] = useState("");
  const [bFiltered, setBFiltered] = useState<ProviderBookingItem[] | null>(null);
  const [bLoading, setBLoading] = useState(false);
  const [bRefresh, setBRefresh] = useState(0);
  const [detailFor, setDetailFor] = useState<ProviderBookingItem | null>(null);
  const [completeFor, setCompleteFor] = useState<ProviderBookingItem | null>(null);
  const [evidence, setEvidence] = useState("");
  const [busyBooking, setBusyBooking] = useState<string | null>(null);

  // ── Reseñas ──
  const [respondFor, setRespondFor] = useState<ReviewItem | null>(null);
  const [responseText, setResponseText] = useState("");

  // ───────────────────────── Carga de datos ─────────────────────────

  const loadBookings = useCallback(async () => {
    try {
      const d = await apiGet<{ bookings: ProviderBookingItem[] }>("/api/provider/bookings");
      setBookings(d.bookings);
      setFatal(null);
    } catch (e) {
      const st = e instanceof Error ? /→ (\d{3})/.exec(e.message)?.[1] : undefined;
      if (st === "401" || st === "403") setFatal("Debes iniciar sesión con una cuenta de prestador para ver este panel. 🐾");
      else toast.error("No se pudieron cargar tus reservas");
    }
  }, []);

  const loadServices = useCallback(async () => {
    try {
      const d = await apiGet<{ services: ServiceItem[] }>("/api/provider/services");
      setServices(d.services);
    } catch {
      toast.error("No se pudieron cargar tus servicios");
    }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const d = await apiGet<{ events: CalEventItem[] }>("/api/calendar/events");
      setEvents(d.events);
    } catch {
      toast.error("No se pudo cargar tu agenda");
    }
  }, []);

  const loadProfile = useCallback(() => {
    apiGet<{ provider: ProviderInfo }>("/api/bookings")
      .then(async (d) => {
        setProvider(d.provider);
        const r = await apiGet<{ reviews: ReviewItem[] }>(`/api/providers/${d.provider.id}`);
        setReviews(r.reviews);
      })
      .catch(() => {});
  }, []);

  const loadContacts = useCallback(async () => {
    setCLoading(true);
    try {
      const p = new URLSearchParams();
      if (cQ.trim()) p.set("q", cQ.trim());
      if (cStatus !== "all") p.set("status", cStatus);
      if (cSource !== "all") p.set("source", cSource);
      if (cSort !== "recent") p.set("sort", cSort);
      const qs = p.toString();
      const d = await apiGet<{ contacts: ContactItem[]; stats: CrmStats }>(`/api/crm/contacts${qs ? `?${qs}` : ""}`);
      setContacts(d.contacts);
      setCrmStats(d.stats);
    } catch {
      toast.error("No se pudo cargar tu CRM");
    } finally {
      setCLoading(false);
    }
  }, [cQ, cStatus, cSource, cSort]);

  useEffect(() => {
    loadBookings();
    loadServices();
    loadEvents();
    loadProfile();
    // Settings frescas al abrir el panel (la tasa puede cambiar en Config)
    apiGet<{ settings: { usdToBs: number; commissionPct: number; defaultRadiusKm: number } }>("/api/settings")
      .then((d) => d.settings && setSettings(d.settings))
      .catch(() => {});
  }, [loadBookings, loadServices, loadEvents, loadProfile, bumpData]);

  // CRM con debounce (búsqueda) + recarga tras mutaciones (cRefresh)
  useEffect(() => {
    const t = setTimeout(loadContacts, 300);
    return () => clearTimeout(t);
  }, [loadContacts, cRefresh]);

  // CRM-lite WhatsApp: todas las etiquetas existentes + contactos filtrados por etiqueta activa
  const allTags = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of contacts ?? []) {
      for (const t of parseTags(c.tags)) {
        const k = t.toLowerCase();
        if (!seen.has(k)) seen.set(k, t);
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b, "es"));
  }, [contacts]);

  const shownContacts = useMemo(() => {
    if (!contacts) return null;
    if (!tagFilter) return contacts;
    const k = tagFilter.toLowerCase();
    return contacts.filter((c) => parseTags(c.tags).some((t) => t.toLowerCase() === k));
  }, [contacts, tagFilter]);

  function exportCsv() {
    if (!shownContacts || shownContacts.length === 0) {
      toast.error("No hay contactos para exportar");
      return;
    }
    exportContactsCsv(shownContacts);
    toast.success(`CSV descargado (${shownContacts.length} contacto${shownContacts.length === 1 ? "" : "s"}) 📄`);
  }

  function exportVcf() {
    if (!shownContacts || shownContacts.length === 0) {
      toast.error("No hay contactos para exportar");
      return;
    }
    exportContactsVcf(shownContacts);
    toast.success(`vCard descargada (${shownContacts.length} contacto${shownContacts.length === 1 ? "" : "s"}) 📇`);
  }

  // Reservas filtradas (server-side) con debounce
  const bActive = !!(bStatus !== "all" || bFrom || bTo || bService !== "all" || bQ.trim());
  useEffect(() => {
    if (!bActive) {
      setBFiltered(null);
      return;
    }
    const t = setTimeout(async () => {
      setBLoading(true);
      try {
        const p = new URLSearchParams();
        if (bStatus !== "all") p.set("status", bStatus);
        if (bFrom) p.set("from", bFrom);
        if (bTo) p.set("to", bTo);
        if (bService !== "all") p.set("serviceId", bService);
        if (bQ.trim()) p.set("q", bQ.trim());
        const d = await apiGet<{ bookings: ProviderBookingItem[] }>(`/api/provider/bookings?${p.toString()}`);
        setBFiltered(d.bookings);
      } catch {
        toast.error("No se pudo filtrar las reservas");
      } finally {
        setBLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [bActive, bStatus, bFrom, bTo, bService, bQ, bRefresh]);

  // ───────────────────────── Acciones ─────────────────────────

  const refreshAfterBooking = useCallback(() => {
    loadBookings();
    setBRefresh((x) => x + 1);
  }, [loadBookings]);

  async function actBooking(b: ProviderBookingItem, action: "start" | "cancel" | "complete", extra?: Record<string, unknown>) {
    setBusyBooking(b.id);
    try {
      await apiPatch(`/api/bookings/${b.id}`, { action, ...extra });
      toast.success(
        action === "start" ? `Servicio ${b.code} iniciado 🏃` :
        action === "complete" ? `¡${b.code} completado! 💚` :
        `Reserva ${b.code} cancelada`
      );
      setCompleteFor(null);
      setDetailFor(null);
      refreshAfterBooking();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyBooking(null);
    }
  }

  async function toggleService(s: ServiceItem, active: boolean) {
    setSvcBusy(s.id);
    try {
      await apiPatch(`/api/provider/services/${s.id}`, { active });
      toast.success(active ? `${s.name} activado ✅` : `${s.name} desactivado 😴`);
      loadServices();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setSvcBusy(null);
    }
  }

  async function deleteService() {
    if (!svcDelete) return;
    setSvcBusy(svcDelete.id);
    try {
      await apiDelete(`/api/provider/services/${svcDelete.id}`);
      toast.success(`${svcDelete.name} eliminado 🗑️`);
      setSvcDelete(null);
      loadServices();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
      setSvcDelete(null);
    } finally {
      setSvcBusy(null);
    }
  }

  async function changeEventStatus(e: CalEventItem, status: string) {
    setEventBusy(e.id);
    try {
      await apiPatch(`/api/calendar/events/${e.id}`, { status });
      toast.success("Evento actualizado 📅");
      loadEvents();
    } catch {
      toast.error("No se pudo actualizar el evento");
    } finally {
      setEventBusy(null);
    }
  }

  async function deleteEvent() {
    if (!eventDelete) return;
    setEventBusy(eventDelete.id);
    try {
      await apiDelete(`/api/calendar/events/${eventDelete.id}`);
      toast.success("Evento eliminado 🗑️");
      setEventDelete(null);
      loadEvents();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
      setEventDelete(null);
    } finally {
      setEventBusy(null);
    }
  }

  async function respondReview() {
    if (!respondFor || responseText.trim().length < 3) return;
    try {
      await apiPatch("/api/reviews", { id: respondFor.id, action: "respond", response: responseText });
      toast.success("Respuesta publicada 💬");
      setRespondFor(null);
      setResponseText("");
      loadProfile();
    } catch {
      toast.error("No se pudo responder");
    }
  }

  // ───────────────────────── Derivados ─────────────────────────

  const today = todayStr();
  const in7 = todayStr(7);

  const kpis = useMemo(() => {
    const bs = bookings ?? [];
    const evs = events ?? [];
    return {
      pend: bs.filter((b) => b.status === "PENDIENTE_PAGO").length,
      hoy: bs.filter((b) => b.scheduledAt.slice(0, 10) === today && b.status !== "CANCELADA").length,
      en7: bs.filter((b) => {
        const d = b.scheduledAt.slice(0, 10);
        return d >= today && d <= in7 && b.status !== "CANCELADA";
      }).length,
      ingresos: bs.filter((b) => b.status === "COMPLETADA").reduce((a, b) => a + b.priceUsd, 0),
      proxEventos: evs.filter((e) => e.date >= today && e.status !== "CANCELADO").length,
      activos: (services ?? []).filter((s) => s.active).length,
    };
  }, [bookings, events, services, today, in7]);

  const filteredServices = useMemo(() => (services ?? []).filter((s) => {
    if (svcQ && !`${s.name} ${s.description}`.toLowerCase().includes(svcQ.toLowerCase())) return false;
    if (svcCat !== "all" && s.category !== svcCat) return false;
    if (svcActive === "activo" && !s.active) return false;
    if (svcActive === "inactivo" && s.active) return false;
    if (svcMin && s.priceUsd < Number(svcMin)) return false;
    if (svcMax && s.priceUsd > Number(svcMax)) return false;
    return true;
  }), [services, svcQ, svcCat, svcActive, svcMin, svcMax]);

  const reservas = bActive ? (bFiltered ?? []) : (bookings ?? []);
  const bPend = reservas.filter((b) => b.status === "PENDIENTE_PAGO");
  const bActivas = reservas.filter((b) => ["CONFIRMADA", "EN_CURSO"].includes(b.status));
  const bDone = reservas.filter((b) => ["COMPLETADA", "CANCELADA"].includes(b.status));

  const visibleEvents = useMemo(() => (events ?? []).filter((e) =>
    (calType === "all" || e.type === calType) && (calStatus === "all" || e.status === calStatus)
  ), [events, calType, calStatus]);

  const dayMap = useMemo(() => {
    const map: Record<string, { kind: "booking" | "event"; type: string; label: string }[]> = {};
    const push = (k: string, it: { kind: "booking" | "event"; type: string; label: string }) => {
      (map[k] ??= []).push(it);
    };
    for (const e of visibleEvents) {
      push(e.date, { kind: "event", type: e.type, label: `${e.startTime ? `${e.startTime} ` : ""}${e.title}` });
    }
    if (calType === "all" || calType === "RESERVA") {
      for (const b of bookings ?? []) {
        if (b.status === "CANCELADA") continue;
        push(b.scheduledAt.slice(0, 10), { kind: "booking", type: "RESERVA", label: `${b.scheduledAt.slice(11, 16)} ${b.service.name}` });
      }
    }
    return map;
  }, [visibleEvents, bookings, calType]);

  const dayBookings = useMemo(() => (dayOpen ? (bookings ?? []).filter((b) => b.scheduledAt.slice(0, 10) === dayOpen && b.status !== "CANCELADA") : []), [dayOpen, bookings]);
  const dayEvents = useMemo(() => (dayOpen ? visibleEvents.filter((e) => e.date === dayOpen) : []), [dayOpen, visibleEvents]);

  const upcoming = useMemo(() => {
    const rows: UpcomingRowData[] = [];
    for (const e of visibleEvents) {
      if (e.date >= today && e.status !== "CANCELADO") {
        rows.push({ key: `ev-${e.id}`, date: e.date, time: e.startTime ?? "—", title: e.title, type: e.type, status: e.status, sub: [e.clientName, e.petName].filter(Boolean).join(" · ") });
      }
    }
    for (const b of bookings ?? []) {
      const d = b.scheduledAt.slice(0, 10);
      if (d >= today && b.status !== "CANCELADA") {
        rows.push({ key: `bk-${b.id}`, date: d, time: b.scheduledAt.slice(11, 16), title: b.service.name, type: "RESERVA", status: b.status, sub: `${b.client.name} · ${b.pet.name}` });
      }
    }
    rows.sort((a, r) => `${a.date} ${a.time}`.localeCompare(`${r.date} ${r.time}`));
    return rows.slice(0, 10);
  }, [visibleEvents, bookings, today]);

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(Date.UTC(c.y, c.m - 1 + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
    });
  }

  function goToday() {
    const [y, m] = todayStr().split("-").map(Number);
    setCursor({ y, m });
  }

  function goToDay(dateKey: string) {
    const [y, m] = dateKey.split("-").map(Number);
    setCursor({ y, m });
    setDayOpen(dateKey);
    setTab("calendario");
  }

  // ───────────────────────── Render ─────────────────────────

  if (fatal) {
    return (
      <div className="space-y-5">
        <EmptyState emoji="🔐" title="Panel de prestador" desc={fatal} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Encabezado (branding heredado) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={provider?.businessName ?? "Pet Spa VIP"} emoji="✂️" src={provider?.avatarUrl ?? undefined} className="h-12 w-12 text-xl" />
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

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl bg-secondary p-1.5">
          <TabsTrigger value="resumen" className="shrink-0 gap-1.5 rounded-xl font-bold"><LayoutDashboard className="h-4 w-4" /> Resumen</TabsTrigger>
          <TabsTrigger value="servicios" className="shrink-0 gap-1.5 rounded-xl font-bold"><Scissors className="h-4 w-4" /> Servicios</TabsTrigger>
          <TabsTrigger value="crm" className="shrink-0 gap-1.5 rounded-xl font-bold"><Users className="h-4 w-4" /> CRM</TabsTrigger>
          <TabsTrigger value="calendario" className="shrink-0 gap-1.5 rounded-xl font-bold"><CalendarDays className="h-4 w-4" /> Calendario</TabsTrigger>
          <TabsTrigger value="reservas" className="shrink-0 gap-1.5 rounded-xl font-bold"><ClipboardList className="h-4 w-4" /> Reservas</TabsTrigger>
          <TabsTrigger value="resenas" className="shrink-0 gap-1.5 rounded-xl font-bold"><Star className="h-4 w-4" /> Reseñas ({reviews.length})</TabsTrigger>
          <TabsTrigger value="consultas" className="shrink-0 gap-1.5 rounded-xl font-bold"><Sparkles className="h-4 w-4" /> Consultas IA</TabsTrigger>
          <TabsTrigger value="perfil" className="shrink-0 gap-1.5 rounded-xl font-bold"><PawIcon /> Mi perfil</TabsTrigger>
        </TabsList>

        {/* ── Resumen ── */}
        <TabsContent value="resumen" className="mt-4 space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi emoji="📥" label="Reservas pendientes" value={bookings ? String(kpis.pend) : "…"} hint="esperando pago del cliente" accent="text-amber-600" onClick={() => setTab("reservas")} />
            <Kpi emoji="📅" label="Reservas de hoy" value={bookings ? String(kpis.hoy) : "…"} hint="agenda de hoy" accent="text-emerald-600" onClick={() => setTab("calendario")} />
            <Kpi emoji="🔜" label="Próximos 7 días" value={bookings ? String(kpis.en7) : "…"} hint="confirmadas y por pagar" accent="text-orange-600" onClick={() => setTab("calendario")} />
            <Kpi emoji="💰" label="Ingresos completados" value={bookings ? fmtUsd(kpis.ingresos) : "…"} hint={`≈ ${fmtBs(kpis.ingresos * rate)}`} accent="text-primary" onClick={() => setTab("reservas")} />
            <Kpi emoji="⭐" label="Rating promedio" value={(provider?.ratingAvg ?? 0).toFixed(1)} hint={`${provider?.ratingCount ?? 0} reseñas recibidas`} accent="text-amber-600" onClick={() => setTab("resenas")} />
            <Kpi emoji="🤝" label="Contactos CRM" value={crmStats ? String(crmStats.total) : "…"} hint={`${crmStats?.vip ?? 0} VIP · ${crmStats?.activos ?? 0} activos`} accent="text-violet-600" onClick={() => setTab("crm")} />
            <Kpi emoji="🔔" label="Próximos eventos" value={events ? String(kpis.proxEventos) : "…"} hint="en tu agenda" accent="text-accent-foreground" onClick={() => setTab("calendario")} />
            <Kpi emoji="✂️" label="Servicios activos" value={services ? String(kpis.activos) : "…"} hint={`${services?.length ?? 0} publicados en total`} accent="text-emerald-600" onClick={() => setTab("servicios")} />
          </div>

          <div className="flex flex-wrap gap-2">
            {([
              { t: "servicios", label: "Gestionar servicios", icon: Scissors },
              { t: "crm", label: "CRM de clientes", icon: Users },
              { t: "calendario", label: "Mi calendario", icon: CalendarDays },
              { t: "reservas", label: "Ver reservas", icon: ClipboardList },
            ] as const).map(({ t, label, icon: Icon }) => (
              <Button key={t} variant="outline" onClick={() => setTab(t)} className="rounded-xl font-bold">
                <Icon className="h-4 w-4" /> {label}
              </Button>
            ))}
          </div>

          <section>
            <h2 className="mb-2 font-display text-lg font-extrabold">🐾 Próximas en tu agenda</h2>
            {upcoming.length === 0 ? (
              <EmptyState emoji="📭" title="Nada agendado por ahora" desc="Crea un evento en el calendario o comparte tu perfil para recibir reservas." />
            ) : (
              <div className="grid gap-2 md:grid-cols-3">
                {upcoming.slice(0, 3).map((r) => <UpcomingRow key={r.key} r={r} onClick={() => goToDay(r.date)} />)}
              </div>
            )}
          </section>
        </TabsContent>

        {/* ── Mis Servicios ── */}
        <TabsContent value="servicios" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-extrabold">✂️ Mis servicios <span className="text-sm font-bold text-muted-foreground">({services?.length ?? 0})</span></h2>
            <Button onClick={() => setSvcDialog("NEW")} className="rounded-xl font-bold"><Plus className="h-4 w-4" /> Nuevo servicio</Button>
          </div>

          <div className="grid gap-2 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={svcQ} onChange={(e) => setSvcQ(e.target.value)} placeholder="Buscar servicio…" className="rounded-xl pl-8" />
            </div>
            <Select value={svcCat} onValueChange={setSvcCat}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c.key} value={c.key}>{c.emoji} {c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={svcActive} onValueChange={setSvcActive}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Activos e inactivos</SelectItem>
                <SelectItem value="activo">Solo activos</SelectItem>
                <SelectItem value="inactivo">Solo inactivos</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input type="number" min="0" inputMode="decimal" value={svcMin} onChange={(e) => setSvcMin(e.target.value)} placeholder="Precio mín $" aria-label="Precio mínimo" className="rounded-xl" />
              <span className="text-xs font-bold text-muted-foreground">–</span>
              <Input type="number" min="0" inputMode="decimal" value={svcMax} onChange={(e) => setSvcMax(e.target.value)} placeholder="máx $" aria-label="Precio máximo" className="rounded-xl" />
            </div>
            <Button variant="ghost" onClick={() => { setSvcQ(""); setSvcCat("all"); setSvcActive("all"); setSvcMin(""); setSvcMax(""); }} className="rounded-xl font-bold text-muted-foreground">
              <FilterX className="h-4 w-4" /> Limpiar
            </Button>
          </div>

          {services === null ? (
            <div className="flex justify-center py-10"><Spin className="h-6 w-6 text-muted-foreground" /></div>
          ) : filteredServices.length === 0 ? (
            services.length === 0 ? (
              <EmptyState
                emoji="📦" title="Aún no tienes servicios"
                desc="Crea tu primer servicio: aparecerá en el marketplace y los clientes podrán reservarlo al instante."
                action={<Button onClick={() => setSvcDialog("NEW")} className="rounded-xl font-bold"><Plus className="h-4 w-4" /> Crear mi primer servicio</Button>}
              />
            ) : (
              <EmptyState emoji="🔍" title="Ningún servicio coincide con los filtros" desc="Prueba con otro texto, categoría o rango de precio." />
            )
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredServices.map((s) => (
                <ServiceCard key={s.id} s={s} busy={svcBusy === s.id} onEdit={() => setSvcDialog(s)} onToggle={(v) => toggleService(s, v)} onDelete={() => setSvcDelete(s)} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── CRM Clientes ── */}
        <TabsContent value="crm" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-extrabold">🤝 CRM de clientes</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                variant="outline" onClick={() => { setTplContactId(null); setTplOpen(true); }}
                className="rounded-xl font-bold text-[#128C4A] hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                title="Mensajes rápidos con variables ({cliente}, {mascota}…)"
              >
                <MessageSquareQuote className="h-4 w-4" /> <span className="hidden sm:inline">Plantillas</span>
              </Button>
              <Button
                variant="outline" onClick={() => setQrOpen(true)}
                className="rounded-xl font-bold"
                title="QR de WhatsApp para que tus clientes te escriban"
              >
                <QrCode className="h-4 w-4" /> <span className="hidden sm:inline">Mi QR</span>
              </Button>
              <Button
                variant="outline" onClick={exportCsv}
                className="rounded-xl font-bold"
                title="Descargar los contactos filtrados (CSV para Excel)"
              >
                <Download className="h-4 w-4" /> <span className="hidden sm:inline">CSV</span>
              </Button>
              <Button
                variant="outline" onClick={exportVcf}
                className="rounded-xl font-bold"
                title="Descargar los contactos filtrados (vCard para tu teléfono)"
              >
                <Download className="h-4 w-4" /> <span className="hidden md:inline">vCard</span>
              </Button>
              <Button onClick={() => setCrmDialog("NEW")} className="rounded-xl font-bold"><Plus className="h-4 w-4" /> Nuevo cliente</Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard emoji="👥" label="Total contactos" value={crmStats ? String(crmStats.total) : "…"} />
            <StatCard emoji="🟢" label="Activos" value={crmStats ? String(crmStats.activos) : "…"} />
            <StatCard emoji="👑" label="VIP" value={crmStats ? String(crmStats.vip) : "…"} />
            <StatCard emoji="💰" label="Ingresos acumulados" value={crmStats ? fmtUsd(crmStats.ingresos) : "…"} sub="gasto histórico de tus clientes" />
            <StatCard emoji="🌱" label="Nuevos (30 días)" value={crmStats ? String(crmStats.nuevos30d) : "…"} className="col-span-2 sm:col-span-1" />
          </div>

          <div className="grid gap-2 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={cQ} onChange={(e) => setCQ(e.target.value)} placeholder="Nombre, tel, email, mascota…" className="rounded-xl pl-8" />
            </div>
            <Select value={cStatus} onValueChange={setCStatus}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="NUEVO">🟠 Nuevo</SelectItem>
                <SelectItem value="ACTIVO">🟢 Activo</SelectItem>
                <SelectItem value="VIP">👑 VIP</SelectItem>
                <SelectItem value="INACTIVO">⚪ Inactivo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={cSource} onValueChange={setCSource}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toda fuente</SelectItem>
                <SelectItem value="RESERVA">De reservas</SelectItem>
                <SelectItem value="MANUAL">Manual</SelectItem>
              </SelectContent>
            </Select>
            <Select value={cSort} onValueChange={setCSort}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Orden: más recientes</SelectItem>
                <SelectItem value="spent">Orden: mayor gasto</SelectItem>
                <SelectItem value="visits">Orden: más visitas</SelectItem>
                <SelectItem value="name">Orden: nombre A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {contacts !== null && <TagFilterBar tags={allTags} active={tagFilter} onToggle={(t) => setTagFilter((cur) => (cur?.toLowerCase() === t.toLowerCase() ? null : t))} onClear={() => setTagFilter(null)} />}

          {tagFilter && shownContacts && shownContacts.length > 0 && (
            <BulkContactPanel
              key={tplVersion}
              contacts={shownContacts}
              tag={tagFilter}
              providerId={provider?.id ?? user?.id ?? "demo"}
              businessName={provider?.businessName ?? "PetService VE"}
              onEditTemplates={() => { setTplContactId(null); setTplOpen(true); }}
              refreshKey={tplVersion}
            />
          )}

          {shownContacts === null || (cLoading && shownContacts === null) ? (
            <div className="flex justify-center py-10"><Spin className="h-6 w-6 text-muted-foreground" /></div>
          ) : shownContacts.length === 0 ? (
            cQ || cStatus !== "all" || cSource !== "all" || tagFilter ? (
              <EmptyState emoji="🔍" title="Sin clientes con esos filtros" desc="Prueba con otro término, estado o etiqueta." />
            ) : (
              <EmptyState
                emoji="🗂️" title="Tu CRM está vacío"
                desc="Cada reserva registra a tu cliente automáticamente. También puedes crear contactos manuales."
                action={<Button onClick={() => setCrmDialog("NEW")} className="rounded-xl font-bold"><Plus className="h-4 w-4" /> Agregar cliente</Button>}
              />
            )
          ) : (
            <>
              {/* Tabla (md+) */}
              <div className="hidden overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm md:block">
                <div className="scroll-slim max-h-[540px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Teléfono</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-center">Visitas</TableHead>
                        <TableHead className="text-right">Gasto total</TableHead>
                        <TableHead>Última visita</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shownContacts.map((c) => (
                        <TableRow key={c.id} onClick={() => setCrmDialog(c)} className="cursor-pointer">
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <Avatar name={c.name} className="h-9 w-9 text-xs" />
                              <div>
                                <div className="text-sm font-extrabold">{c.name}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  {c.petName ? `${c.petType === "GATO" ? "🐱" : c.petType === "PERRO" ? "🐶" : "🐾"} ${c.petName}` : "sin mascota registrada"}
                                </div>
                                <TagBadges tags={c.tags} className="mt-0.5" />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{c.phone ?? "—"}</TableCell>
                          <TableCell><ContactStatusBadge status={c.status} /></TableCell>
                          <TableCell className="text-center text-sm font-bold">{c.totalVisits}</TableCell>
                          <TableCell className="text-right font-display text-sm font-black text-primary">{fmtUsd(c.totalSpentUsd)}</TableCell>
                          <TableCell className="text-xs">{c.lastVisitAt ? fmtDateShort(c.lastVisitAt) : "—"}</TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1.5">
                              {c.phone && (
                                <WaButton
                                  phone={c.phone}
                                  text={`Hola ${c.name.split(" ")[0]}! 👋 Te escribo de ${provider?.businessName ?? "PetService VE"}. ¿Cómo sigue tu peludito${c.petName ? ` ${c.petName}` : ""}? 🐾`}
                                  label="" title={`Chatear con ${c.name}`} className="px-2.5"
                                />
                              )}
                              {c.phone && (
                                <Button
                                  size="sm" variant="outline" title="Enviar plantilla de WhatsApp"
                                  onClick={(e) => { e.stopPropagation(); setTplContactId(c.id); setTplOpen(true); }}
                                  className="h-8 rounded-lg px-2.5 text-xs font-bold text-[#128C4A] hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                >
                                  <MessageSquareQuote className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button size="sm" variant="outline" onClick={() => setCrmDialog(c)} className="h-8 rounded-lg px-2.5 text-xs font-bold">Ver</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              {/* Tarjetas (móvil) */}
              <div className="space-y-2 md:hidden">
                {shownContacts.map((c) => (
                  <button key={c.id} type="button" onClick={() => setCrmDialog(c)} className="w-full rounded-2xl border border-border/70 bg-card p-3 text-left shadow-sm transition-colors hover:bg-secondary/40">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={c.name} className="h-10 w-10 text-xs" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-extrabold">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground">{c.phone ?? "sin teléfono"}</div>
                      </div>
                      <ContactStatusBadge status={c.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>👣 {c.totalVisits} visita{c.totalVisits === 1 ? "" : "s"}</span>
                      <span className="font-display font-black text-primary">{fmtUsd(c.totalSpentUsd)}</span>
                      <span>últ. {c.lastVisitAt ? fmtDateShort(c.lastVisitAt) : "—"}</span>
                      {c.petName && <span>{c.petType === "GATO" ? "🐱" : c.petType === "PERRO" ? "🐶" : "🐾"} {c.petName}</span>}
                    </div>
                    <TagBadges tags={c.tags} className="mt-1.5" />
                  </button>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Calendario ── */}
        <TabsContent value="calendario" className="mt-4 space-y-4">
          <WeeklyScheduleEditor />
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-xl border border-border/70 bg-card p-1 shadow-sm">
              <Button variant="ghost" size="icon" onClick={() => shiftMonth(-1)} aria-label="Mes anterior" className="h-8 w-8 rounded-lg"><ChevronLeft className="h-4 w-4" /></Button>
              <span className="min-w-[140px] text-center font-display text-sm font-black capitalize">{MESES[cursor.m - 1]} {cursor.y}</span>
              <Button variant="ghost" size="icon" onClick={() => shiftMonth(1)} aria-label="Mes siguiente" className="h-8 w-8 rounded-lg"><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <Button variant="outline" size="sm" onClick={goToday} className="h-9 rounded-xl font-bold">Hoy</Button>
            <div className="ml-auto flex flex-wrap gap-2">
              <Select value={calType} onValueChange={setCalType}>
                <SelectTrigger className="h-9 w-[150px] rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  <SelectItem value="RESERVA">📆 Reservas</SelectItem>
                  <SelectItem value="MANUAL">📌 Manuales</SelectItem>
                  <SelectItem value="RECORDATORIO">⏰ Recordatorios</SelectItem>
                </SelectContent>
              </Select>
              <Select value={calStatus} onValueChange={setCalStatus}>
                <SelectTrigger className="h-9 w-[170px] rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  {Object.entries(EVENT_STATUS_META).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px] font-semibold text-muted-foreground">
            <span className="text-xs font-extrabold uppercase tracking-wide">Leyenda:</span>
            {(["RESERVA", "MANUAL", "RECORDATORIO"] as const).map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", EVENT_TYPE_META[t].dot)} /> {EVENT_TYPE_META[t].label}
              </span>
            ))}
          </div>

          {events === null ? (
            <div className="flex justify-center py-10"><Spin className="h-6 w-6 text-muted-foreground" /></div>
          ) : (
            <MonthGrid year={cursor.y} month={cursor.m} today={today} byDay={dayMap} selected={dayOpen} onSelectDay={(d) => setDayOpen(d)} />
          )}

          <section>
            <h3 className="mb-2 font-display text-lg font-extrabold">🔔 Próximos eventos</h3>
            {upcoming.length === 0 ? (
              <EmptyState emoji="📭" title="Nada próximo en tu agenda" desc="Toca cualquier día del calendario y agrega un evento." />
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {upcoming.map((r) => <UpcomingRow key={r.key} r={r} onClick={() => goToDay(r.date)} />)}
              </div>
            )}
          </section>

          {/* Sheet del día */}
          <Sheet open={!!dayOpen} onOpenChange={(v) => !v && setDayOpen(null)}>
            <SheetContent side="right" className="w-full overflow-y-auto scroll-slim sm:max-w-md">
              <SheetHeader>
                <SheetTitle className="font-display font-black">📅 {dayOpen ? fmtDate(`${dayOpen}T12:00:00Z`) : ""}</SheetTitle>
                <SheetDescription>
                  {dayBookings.length + dayEvents.length === 0
                    ? "Día libre — perfecto para agendar algo 🌤️"
                    : `${dayBookings.length + dayEvents.length} actividad${dayBookings.length + dayEvents.length === 1 ? "" : "es"} este día`}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-8">
                <Button onClick={() => dayOpen && setEventDialog({ day: dayOpen, event: null })} className="w-full rounded-xl font-bold">
                  <Plus className="h-4 w-4" /> Nuevo evento este día
                </Button>

                {dayBookings.map((b) => (
                  <article key={b.id} className="rounded-2xl border border-emerald-200 bg-card p-3 shadow-sm dark:border-emerald-900">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">RESERVA</span>
                        <span className="font-display text-sm font-black">{b.scheduledAt.slice(11, 16)}</span>
                      </div>
                      <BookingStatusBadge status={b.status} />
                    </div>
                    <div className="mt-1.5 text-sm font-extrabold">{b.service.name} · {b.code}</div>
                    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      <div>👤 {b.client.name}{b.client.phone ? ` · ${b.client.phone}` : ""}</div>
                      <div>{b.pet.species === "GATO" ? "🐱" : "🐶"} {b.pet.name} ({b.pet.breed ?? "criollo"} · {b.pet.size})</div>
                      <div className="flex items-start gap-1"><MapPin className="mt-0.5 h-3 w-3 shrink-0" />{b.address}</div>
                      {b.notes && <div className="rounded-lg bg-accent/15 px-2 py-1 font-semibold text-accent-foreground">💬 {b.notes}</div>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {b.client.phone && (
                        <WaButton phone={b.client.phone} text={`Hola ${b.client.name.split(" ")[0]}! 👋 Te escribo de PetService VE por tu reserva ${b.code} (${b.service.name} de ${b.pet.name}). 🐾`} />
                      )}
                      {b.status === "CONFIRMADA" && (
                        <Button size="sm" disabled={busyBooking === b.id} onClick={() => actBooking(b, "start")} className="h-8 rounded-lg bg-primary text-xs font-bold"><Play className="h-3.5 w-3.5" /> Iniciar</Button>
                      )}
                      {b.status === "EN_CURSO" && (
                        <Button size="sm" disabled={busyBooking === b.id} onClick={() => actBooking(b, "complete")} className="h-8 rounded-lg bg-emerald-600 text-xs font-bold hover:bg-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Completar</Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setDetailFor(b)} className="h-8 rounded-lg text-xs font-bold">Detalle</Button>
                    </div>
                  </article>
                ))}

                {dayEvents.map((e) => (
                  <article key={e.id} className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={cn("inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-black", (EVENT_TYPE_META[e.type] ?? EVENT_TYPE_META.MANUAL).chip)}>
                          {(EVENT_TYPE_META[e.type] ?? EVENT_TYPE_META.MANUAL).emoji} {(EVENT_TYPE_META[e.type] ?? EVENT_TYPE_META.MANUAL).label}
                        </span>
                        {e.startTime && <span className="font-display text-sm font-black">{e.startTime}{e.durationMin ? ` · ${e.durationMin} min` : ""}</span>}
                      </div>
                      {eventBusy === e.id ? (
                        <Spin />
                      ) : (
                        <Select value={e.status} onValueChange={(v) => changeEventStatus(e, v)}>
                          <SelectTrigger className="h-7 w-[135px] rounded-lg text-xs" aria-label="Estado del evento"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(EVENT_STATUS_META).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div className="mt-1.5 text-sm font-extrabold">{e.title}</div>
                    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {e.clientName && <div>👤 {e.clientName}{e.phone ? ` · ${e.phone}` : ""}</div>}
                      {e.petName && <div>🐾 {e.petName}</div>}
                      {e.address && <div className="flex items-start gap-1"><MapPin className="mt-0.5 h-3 w-3 shrink-0" />{e.address}</div>}
                      {e.notes && <div className="rounded-lg bg-accent/15 px-2 py-1 font-semibold text-accent-foreground">💬 {e.notes}</div>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {e.phone && (
                        <WaButton phone={e.phone} text={`Hola ${e.clientName?.split(" ")[0] ?? ""}! 👋 Te escribo de ${provider?.businessName ?? "PetService VE"} sobre “${e.title}”. 🐾`} />
                      )}
                      <Button size="sm" variant="outline" onClick={() => setEventDialog({ day: e.date, event: e })} className="h-8 flex-1 rounded-lg text-xs font-bold"><Pencil className="h-3.5 w-3.5" /> Editar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEventDelete(e)} className="h-8 flex-1 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950"><Trash2 className="h-3.5 w-3.5" /> Eliminar</Button>
                    </div>
                  </article>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </TabsContent>

        {/* ── Reservas ── */}
        <TabsContent value="reservas" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-extrabold">🧾 Reservas <span className="text-sm font-bold text-muted-foreground">({reservas.length})</span></h2>
            {bLoading && <span className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground"><Spin /> filtrando…</span>}
          </div>

          <div className="grid gap-2 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-6">
            <Select value={bStatus} onValueChange={setBStatus}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="PENDIENTE_PAGO">Pendiente de pago</SelectItem>
                <SelectItem value="CONFIRMADA">Confirmada</SelectItem>
                <SelectItem value="EN_CURSO">En curso</SelectItem>
                <SelectItem value="COMPLETADA">Completada</SelectItem>
                <SelectItem value="CANCELADA">Cancelada</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={bFrom} onChange={(e) => setBFrom(e.target.value)} aria-label="Desde" className="rounded-xl" />
            <Input type="date" value={bTo} onChange={(e) => setBTo(e.target.value)} aria-label="Hasta" className="rounded-xl" />
            <Select value={bService} onValueChange={setBService}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los servicios</SelectItem>
                {(services ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={bQ} onChange={(e) => setBQ(e.target.value)} placeholder="Código, cliente, mascota…" className="rounded-xl pl-8" />
            </div>
            <Button variant="ghost" onClick={() => { setBStatus("all"); setBFrom(""); setBTo(""); setBService("all"); setBQ(""); }} disabled={!bActive} className="rounded-xl font-bold text-muted-foreground">
              <FilterX className="h-4 w-4" /> Limpiar
            </Button>
          </div>

          {bookings === null ? (
            <div className="flex justify-center py-10"><Spin className="h-6 w-6 text-muted-foreground" /></div>
          ) : (
            <>
              {bActivas.length > 0 && (
                <section>
                  <h3 className="mb-2 font-display text-base font-extrabold">🔔 Activas — atiende a tus peluditos</h3>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {bActivas.map((b) => (
                      <BookingCard key={b.id} b={b} rate={rate} busy={busyBooking === b.id} onDetail={() => setDetailFor(b)} onStart={() => actBooking(b, "start")} onComplete={() => { setCompleteFor(b); setEvidence(""); }} onCancel={() => actBooking(b, "cancel")} />
                    ))}
                  </div>
                </section>
              )}
              {bPend.length > 0 && (
                <section>
                  <h3 className="mb-2 font-display text-base font-extrabold">⏳ Pendientes de pago</h3>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {bPend.map((b) => (
                      <BookingCard key={b.id} b={b} rate={rate} busy={busyBooking === b.id} onDetail={() => setDetailFor(b)} onCancel={() => actBooking(b, "cancel")} />
                    ))}
                  </div>
                </section>
              )}
              <section>
                <h3 className="mb-2 font-display text-base font-extrabold">📚 Historial</h3>
                {bDone.length === 0 ? (
                  bActivas.length + bPend.length === 0 && (
                    <EmptyState emoji="🔍" title="Sin reservas con esos filtros" desc="Amplía el rango de fechas, cambia el estado o limpia los filtros." />
                  )
                ) : (
                  <div className="scroll-slim max-h-[460px] space-y-3 overflow-y-auto pr-1">
                    {bDone.map((b) => <BookingCard key={b.id} b={b} rate={rate} busy={busyBooking === b.id} compact onDetail={() => setDetailFor(b)} />)}
                  </div>
                )}
              </section>
            </>
          )}
        </TabsContent>

        {/* ── Reseñas (heredado) ── */}
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

        {/* ── Consultas IA (heredado) ── */}
        <TabsContent value="consultas" className="mt-4">
          <ConsultasIA scope="provider" />
        </TabsContent>

        {/* ── Mi perfil (editable: negocio + cuenta) ── */}
        <TabsContent value="perfil" className="mt-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-4">
              <BusinessProfileEditor onSaved={loadProfile} />
            </div>
            <div className="space-y-4">
              <AccountProfileEditor />
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
                  <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2"><span className="font-semibold">Servicios publicados</span><span className="font-bold">{services ? `${kpis.activos} activos de ${services.length}` : "…"}</span></div>
                  <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2"><span className="font-semibold">Clientes en CRM</span><span className="font-bold">{crmStats ? crmStats.total : "…"}</span></div>
                  <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2"><span className="font-semibold">Tasa del día</span><span className="font-bold">{rate.toFixed(2)} Bs./$</span></div>
                </div>
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground">
                  <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  Los pagos verificados se acumulan para tu próximo payout semanal (escrow lógico liberado por servicio completado).
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Diálogos y sheets globales ── */}

      <ServiceFormDialog
        open={svcDialog !== null}
        onOpenChange={(v) => !v && setSvcDialog(null)}
        initial={svcDialog && svcDialog !== "NEW" ? svcDialog : null}
        rate={rate}
        onSaved={loadServices}
      />

      <AlertDialog open={!!svcDelete} onOpenChange={(v) => !v && setSvcDelete(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display font-black">¿Eliminar “{svcDelete?.name}”? 🗑️</AlertDialogTitle>
            <AlertDialogDescription>
              Si el servicio tiene reservas asociadas no podrá borrarse (en ese caso te conviene desactivarlo). Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl font-bold">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteService} className="rounded-xl bg-rose-600 font-bold hover:bg-rose-700">Sí, eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ContactDialog
        open={crmDialog !== null}
        onOpenChange={(v) => !v && setCrmDialog(null)}
        contact={crmDialog && crmDialog !== "NEW" ? crmDialog : null}
        businessName={provider?.businessName ?? "PetService VE"}
        onSaved={() => setCRefresh((x) => x + 1)}
        onDeleted={() => setCRefresh((x) => x + 1)}
        onOpenTemplates={(c) => { setCrmDialog(null); setTplContactId(c.id); setTplOpen(true); }}
      />

      {/* CRM-lite WhatsApp (Task 26-d): plantillas + QR — montados solo al abrirlos */}
      {tplOpen && (
        <TemplatesDialog
          onOpenChange={(v) => {
            if (!v) {
              setTplOpen(false);
              setTplContactId(null);
              setTplVersion((x) => x + 1); // refresca el panel de contacto masivo si estaba visible
            }
          }}
          providerId={provider?.id ?? user?.id ?? "demo"}
          businessName={provider?.businessName ?? "PetService VE"}
          contacts={contacts ?? []}
          initialContactId={tplContactId}
          onSavedTemplates={() => setTplVersion((x) => x + 1)}
        />
      )}

      {qrOpen && (
        <QrDialog
          onOpenChange={(v) => !v && setQrOpen(false)}
          providerPhone={user?.phone ?? null}
          businessName={provider?.businessName ?? "PetService VE"}
        />
      )}

      <EventFormDialog
        open={!!eventDialog}
        onOpenChange={(v) => !v && setEventDialog(null)}
        day={eventDialog?.day ?? null}
        event={eventDialog?.event ?? null}
        onSaved={loadEvents}
      />

      <AlertDialog open={!!eventDelete} onOpenChange={(v) => !v && setEventDelete(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display font-black">¿Eliminar “{eventDelete?.title}”? 🗑️</AlertDialogTitle>
            <AlertDialogDescription>El evento desaparecerá de tu calendario. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl font-bold">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteEvent} className="rounded-xl bg-rose-600 font-bold hover:bg-rose-700">Sí, eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BookingDetailDialog
        booking={detailFor}
        onClose={() => setDetailFor(null)}
        busy={!!detailFor && busyBooking === detailFor.id}
        onAction={(b, action) => actBooking(b, action)}
      />

      {/* Dialog completar con evidencia (heredado) */}
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
            <Button onClick={() => completeFor && actBooking(completeFor, "complete", { evidence })} disabled={!!completeFor && busyBooking === completeFor.id} className="w-full rounded-xl bg-emerald-600 font-bold hover:bg-emerald-700">
              {busyBooking ? <><Spin /> Guardando…</> : <><CheckCircle2 className="h-4 w-4" /> Marcar como completado</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog responder reseña (heredado) */}
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

// ───────────────────────── Componentes locales ─────────────────────────

function PawIcon() {
  return <span aria-hidden className="text-sm leading-none">🐾</span>;
}

function Kpi({ emoji, label, value, hint, accent, onClick }: {
  emoji: string; label: string; value: string; hint: string; accent: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border border-border/70 bg-card p-4 text-left shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-xl">{emoji}</span>
        <TrendingUp className="h-4 w-4 text-muted-foreground/40" />
      </div>
      <div className={cn("mt-1.5 font-display text-xl font-black", accent)}>{value}</div>
      <div className="text-xs font-bold">{label}</div>
      <div className="text-[10px] text-muted-foreground">{hint}</div>
    </button>
  );
}

function UpcomingRow({ r, onClick }: { r: UpcomingRowData; onClick: () => void }) {
  const meta = EVENT_TYPE_META[r.type] ?? EVENT_TYPE_META.MANUAL;
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 text-left shadow-sm transition-colors hover:bg-secondary/50">
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", meta.dot)} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-extrabold">{r.title}</div>
        <div className="truncate text-[11px] text-muted-foreground">{r.sub || meta.label}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-xs font-bold">{fmtDateShort(`${r.date}T12:00:00Z`)}</div>
        <div className="text-[10px] text-muted-foreground">{r.time !== "—" ? r.time : meta.label}</div>
      </div>
    </button>
  );
}

function BookingCard({ b, rate, busy, compact, onDetail, onStart, onComplete, onCancel }: {
  b: ProviderBookingItem; rate: number; busy?: boolean; compact?: boolean;
  onDetail?: () => void; onStart?: () => void; onComplete?: () => void; onCancel?: () => void;
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
        <div><span className="font-bold">👤 {b.client.name}</span> <span className="text-muted-foreground">· {b.client.phone ?? "sin teléfono"}</span></div>
        <div><span className="font-bold">{b.pet.species === "GATO" ? "🐱" : "🐶"} {b.pet.name}</span> <span className="text-muted-foreground">({b.pet.breed ?? "criollo"} · {b.pet.size})</span></div>
        <div className="sm:col-span-2 text-muted-foreground">📍 {b.address}</div>
        {b.notes && <div className="sm:col-span-2 rounded-lg bg-accent/15 px-2.5 py-1.5 font-semibold text-accent-foreground">💬 Nota del cliente: {b.notes}</div>}
        {b.evidenceNote && <div className="sm:col-span-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">📸 {b.evidenceNote}</div>}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-border/70 pt-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-display font-black text-primary">{fmtUsd(b.priceUsd)}</span>
          <span className="text-muted-foreground">· {fmtBs(b.priceBs)} · com. {fmtUsd(b.commissionUsd)}</span>
          {b.payment && <PaymentStatusBadge status={b.payment.status} />}
          {b.payment && <span className="inline-flex items-center gap-1 text-muted-foreground"><Wallet className="h-3.5 w-3.5" />{b.payment.method.replace("_", " ").toLowerCase()}</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(() => {
            const wa = waLink(
              b.client.phone,
              `Hola ${b.client.name.split(" ")[0]}! 👋 Te escribo de PetService VE por tu reserva ${b.code} (${b.service.name} de ${b.pet.name}). 🐾`
            );
            return wa && b.status !== "CANCELADA" ? (
              <a
                href={wa} target="_blank" rel="noopener noreferrer"
                title={`Chatear con ${b.client.name} por WhatsApp`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-xs font-bold text-white transition-colors hover:bg-[#1ebe5b]"
              >
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
            ) : null;
          })()}
          {onDetail && (
            <Button size="sm" variant="outline" onClick={onDetail} className="h-8 rounded-lg px-3 text-xs font-bold">Detalle</Button>
          )}
          {b.status === "CONFIRMADA" && onStart && (
            <Button size="sm" disabled={busy} onClick={onStart} className="h-8 rounded-lg bg-primary px-3 text-xs font-bold"><Play className="h-3.5 w-3.5" /> Iniciar</Button>
          )}
          {b.status === "EN_CURSO" && onComplete && (
            <Button size="sm" disabled={busy} onClick={onComplete} className="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-bold hover:bg-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Completar</Button>
          )}
          {b.status === "PENDIENTE_PAGO" && !onStart && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground"><XCircle className="h-3.5 w-3.5" /> Esperando pago del cliente</span>
          )}
          {(b.status === "CONFIRMADA" || b.status === "PENDIENTE_PAGO") && onCancel && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel} className="h-8 rounded-lg px-3 text-xs font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950">Cancelar</Button>
          )}
        </div>
      </div>
    </article>
  );
}
