"use client";

/**
 * PetService VE — Piezas del Dashboard del Prestador (Task 19-b)
 * Tipos, helpers de fetch y subcomponentes usados por ProviderDashboard.tsx.
 * Todas las llamadas usan APIs con scope de sesión (anti-IDOR) y fetch relativo.
 */

import { useEffect, useState } from "react";
import {
  Clock, History, Loader2, MapPin, MessageCircle, Pencil, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { apiGet, apiPatch, apiPost } from "@/lib/petservice/api";
import { CATEGORIES, categoryMeta, PET_SIZES } from "@/lib/petservice/constants";
import { fmtUsd, fmtBs, fmtDate, fmtDateTime, fmtDateShort, todayStr, waLink } from "@/lib/petservice/format";
import { Avatar, BookingStatusBadge, CategoryIcon, PaymentStatusBadge } from "@/components/petservice/shared";

// ───────────────────────── Tipos (contratos reales de las APIs) ─────────────────────────

export interface ServiceItem {
  id: string; category: string; name: string; description: string; durationMin: number;
  priceUsd: number; priceToUsd: number | null; modality: string;
  petTypes: string; petSizes: string; extrasJson: string; active: boolean;
}

export interface ContactItem {
  id: string; name: string; phone: string | null; email: string | null;
  petName: string | null; petType: string | null; status: string; source: string;
  notes: string | null; totalVisits: number; totalSpentUsd: number;
  lastVisitAt: string | null; createdAt: string; updatedAt: string;
}

export interface CrmStats { total: number; activos: number; vip: number; ingresos: number; nuevos30d: number; }

export interface HistorialBooking {
  id: string; code: string; status: string; scheduledAt: string; priceUsd: number;
  service: { name: string; category: string } | null;
  pet: { name: string; species: string } | null;
}

export interface HistorialEvent {
  id: string; title: string; date: string; startTime: string | null; type: string; status: string;
}

export interface CalEventItem {
  id: string; title: string; date: string; startTime: string | null; durationMin: number | null;
  type: string; status: string; clientName: string | null; phone: string | null;
  petName: string | null; address: string | null; notes: string | null;
}

export interface ProviderBookingItem {
  id: string; code: string; status: string; address: string; scheduledAt: string;
  priceUsd: number; priceBs: number; commissionUsd: number; extrasJson: string;
  notes: string | null; evidenceNote: string | null;
  client: { id: string; name: string; phone: string | null };
  service: { id: string; name: string; category: string; durationMin: number };
  pet: { id: string; name: string; species: string; breed: string | null; size: string };
  payment: { id: string; method: string; status: string; reference: string | null } | null;
  review: { id: string; rating: number; comment: string } | null;
}

// ───────────────────────── Helpers ─────────────────────────

/** DELETE con manejo de error del body (api.ts no trae DELETE). */
export async function apiDelete(url: string): Promise<void> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `DELETE ${url} → ${res.status}`);
  }
}

export function Spin({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />;
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] font-bold text-rose-600">{children}</p>;
}

export const MODALITY_META: Record<string, { label: string; emoji: string }> = {
  DOMICILIO: { label: "A domicilio", emoji: "🏠" },
  PICKUP: { label: "Recogida", emoji: "🏬" },
  ONLINE: { label: "Online", emoji: "💻" },
};

export const EVENT_TYPE_META: Record<string, { label: string; dot: string; chip: string; emoji: string }> = {
  RESERVA: { label: "Reserva", dot: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300", emoji: "📆" },
  MANUAL: { label: "Manual", dot: "bg-amber-500", chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300", emoji: "📌" },
  RECORDATORIO: { label: "Recordatorio", dot: "bg-orange-500", chip: "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300", emoji: "⏰" },
};

export const EVENT_STATUS_META: Record<string, { label: string; chip: string }> = {
  PENDIENTE: { label: "Pendiente", chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" },
  CONFIRMADO: { label: "Confirmado", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" },
  COMPLETADO: { label: "Completado", chip: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300" },
  CANCELADO: { label: "Cancelado", chip: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
};

const CONTACT_STATUS_META: Record<string, { label: string; chip: string }> = {
  VIP: { label: "👑 VIP", chip: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300" },
  ACTIVO: { label: "Activo", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" },
  NUEVO: { label: "Nuevo", chip: "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300" },
  INACTIVO: { label: "Inactivo", chip: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
};

export function ContactStatusBadge({ status }: { status: string }) {
  const meta = CONTACT_STATUS_META[status] ?? { label: status, chip: "bg-muted text-muted-foreground" };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold", meta.chip)}>{meta.label}</span>;
}

export function EventStatusChip({ status }: { status: string }) {
  const meta = EVENT_STATUS_META[status] ?? { label: status, chip: "bg-muted text-muted-foreground" };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", meta.chip)}>{meta.label}</span>;
}

/** Botón verde de WhatsApp con wa.me (mismo canal que el resto de la app). */
export function WaButton({ phone, text, label = "WhatsApp", className, title }: {
  phone: string | null | undefined; text: string; label?: string; className?: string; title?: string;
}) {
  const href = waLink(phone, text);
  if (!href) return null;
  return (
    <a
      href={href} target="_blank" rel="noopener noreferrer" title={title ?? "Chatear por WhatsApp"}
      className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-xs font-bold text-white transition-colors hover:bg-[#1ebe5b]", className)}
    >
      <MessageCircle className="h-3.5 w-3.5" /> {label}
    </a>
  );
}

/** Tarjeta de dato compacta reutilizable (CRM stats, KPIs). */
export function StatCard({ emoji, label, value, sub, onClick, className }: {
  emoji: string; label: string; value: string; sub?: string; onClick?: () => void; className?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xl">{emoji}</span>
        <span className="truncate text-[11px] font-bold text-muted-foreground">{label}</span>
      </div>
      <div className="mt-1.5 font-display text-xl font-black text-primary">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </>
  );
  const cls = cn(
    "rounded-2xl border border-border/70 bg-card p-4 text-left shadow-sm transition-transform",
    onClick && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md",
    className
  );
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

// ───────────────────────── Servicios: formulario crear/editar ─────────────────────────

const EMPTY_SERVICE_FORM = {
  name: "", category: "GROOMING", description: "", priceUsd: "", priceToUsd: "",
  durationMin: "30", modality: "DOMICILIO", petTypes: ["PERRO", "GATO"] as string[],
  petSizes: ["S", "M", "L"] as string[], active: true,
};

export function ServiceFormDialog({ open, onOpenChange, initial, rate, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  initial: ServiceItem | null; rate: number; onSaved: () => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState(EMPTY_SERVICE_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (initial) {
      setForm({
        name: initial.name, category: initial.category, description: initial.description,
        priceUsd: String(initial.priceUsd),
        priceToUsd: initial.priceToUsd != null ? String(initial.priceToUsd) : "",
        durationMin: String(initial.durationMin), modality: initial.modality,
        petTypes: initial.petTypes.split(",").filter(Boolean),
        petSizes: initial.petSizes.split(",").filter(Boolean),
        active: initial.active,
      });
    } else {
      setForm(EMPTY_SERVICE_FORM);
    }
  }, [open, initial]);

  function toggleIn(key: "petTypes" | "petSizes", val: string, checked: boolean | "indeterminate") {
    setForm((f) => {
      const list = key === "petTypes" ? f.petTypes : f.petSizes;
      const next = checked ? [...new Set([...list, val])] : list.filter((x) => x !== val);
      return key === "petTypes" ? { ...f, petTypes: next } : { ...f, petSizes: next };
    });
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 3) errs.name = "El nombre del servicio debe tener al menos 3 caracteres";
    if (form.description.trim().length < 10) errs.description = "La descripción debe tener al menos 10 caracteres";
    const price = Number(form.priceUsd);
    if (!form.priceUsd || Number.isNaN(price) || price <= 0) errs.priceUsd = "El precio debe ser mayor a 0";
    else if (price < 0.5 || price > 2000) errs.priceUsd = "El precio debe estar entre 0.5 y 2000 USD";
    if (form.priceToUsd.trim()) {
      const pTo = Number(form.priceToUsd);
      if (Number.isNaN(pTo) || pTo < 0.5 || pTo > 2000) errs.priceToUsd = "Debe estar entre 0.5 y 2000 USD (o déjalo vacío)";
      else if (!errs.priceUsd && pTo < price) errs.priceToUsd = "No puede ser menor que el precio base";
    }
    const dur = Number(form.durationMin);
    if (!form.durationMin || Number.isNaN(dur) || dur <= 0) errs.durationMin = "La duración debe ser mayor a 0";
    else if (!Number.isInteger(dur) || dur < 10 || dur > 600) errs.durationMin = "Debe ser un entero entre 10 y 600 minutos";
    if (form.petTypes.length === 0) errs.petTypes = "Selecciona al menos un tipo de mascota";
    if (form.petSizes.length === 0) errs.petSizes = "Selecciona al menos un tamaño";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(), category: form.category, description: form.description.trim(),
        priceUsd: Number(form.priceUsd),
        priceToUsd: form.priceToUsd.trim() ? Number(form.priceToUsd) : null,
        durationMin: Number(form.durationMin), modality: form.modality,
        petTypes: form.petTypes, petSizes: form.petSizes, active: form.active,
      };
      if (isEdit && initial) await apiPatch(`/api/provider/services/${initial.id}`, body);
      else await apiPost("/api/provider/services", body);
      toast.success(isEdit ? "Servicio actualizado ✨" : "¡Servicio publicado! 🎉");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el servicio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto scroll-slim rounded-3xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display font-black">
            {isEdit ? `Editar “${initial?.name}” ✏️` : "Nuevo servicio 🎀"}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? "Ajusta precio, duración o disponibilidad de tu servicio." : "Publícalo en el marketplace: los clientes lo verán de inmediato."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs font-bold">Nombre del servicio *</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ej: Baño y corte premium para gatos" className="mt-1 rounded-xl" />
            {errors.name && <FieldError>{errors.name}</FieldError>}
          </div>

          <div>
            <Label className="text-xs font-bold">Categoría *</Label>
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.key} value={c.key}>{c.emoji} {c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-bold">Modalidad *</Label>
            <Select value={form.modality} onValueChange={(v) => setForm((f) => ({ ...f, modality: v }))}>
              <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(MODALITY_META).map(([k, m]) => (
                  <SelectItem key={k} value={k}>{m.emoji} {m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2">
            <Label className="text-xs font-bold">Descripción *</Label>
            <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="mt-1 rounded-2xl" placeholder="Cuenta qué incluye el servicio, marcas de productos, para qué peludito es ideal…" />
            {errors.description && <FieldError>{errors.description}</FieldError>}
          </div>

          <div>
            <Label className="text-xs font-bold">Precio desde (USD) *</Label>
            <Input type="number" min="0.5" step="0.5" inputMode="decimal" value={form.priceUsd} onChange={(e) => setForm((f) => ({ ...f, priceUsd: e.target.value }))} placeholder="15" className="mt-1 rounded-xl" />
            {errors.priceUsd ? <FieldError>{errors.priceUsd}</FieldError> : <p className="mt-1 text-[10px] text-muted-foreground">≈ {fmtBs((Number(form.priceUsd) || 0) * rate)}</p>}
          </div>

          <div>
            <Label className="text-xs font-bold">Precio hasta (opcional)</Label>
            <Input type="number" min="0.5" step="0.5" inputMode="decimal" value={form.priceToUsd} onChange={(e) => setForm((f) => ({ ...f, priceToUsd: e.target.value }))} placeholder="25" className="mt-1 rounded-xl" />
            {errors.priceToUsd && <FieldError>{errors.priceToUsd}</FieldError>}
          </div>

          <div>
            <Label className="text-xs font-bold">Duración (minutos) *</Label>
            <Input type="number" min="10" step="5" inputMode="numeric" value={form.durationMin} onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))} className="mt-1 rounded-xl" />
            {errors.durationMin && <FieldError>{errors.durationMin}</FieldError>}
          </div>

          <div className="flex items-end">
            <div className="flex w-full items-center justify-between rounded-xl border border-border/70 px-3 py-2.5">
              <Label className="cursor-pointer text-xs font-bold">Servicio activo</Label>
              <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
            </div>
          </div>

          <div>
            <Label className="text-xs font-bold">Mascotas *</Label>
            <div className="mt-1 flex gap-2">
              {(["PERRO", "GATO"] as const).map((t) => (
                <label key={t} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/70 px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary/60 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10">
                  <Checkbox checked={form.petTypes.includes(t)} onCheckedChange={(v) => toggleIn("petTypes", t, v)} />
                  {t === "PERRO" ? "🐕 Perro" : "🐈 Gato"}
                </label>
              ))}
            </div>
            {errors.petTypes && <FieldError>{errors.petTypes}</FieldError>}
          </div>

          <div>
            <Label className="text-xs font-bold">Tamaños *</Label>
            <div className="mt-1 flex gap-2">
              {Object.entries(PET_SIZES).map(([k, label]) => (
                <label key={k} className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border/70 px-2 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary/60 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10">
                  <Checkbox checked={form.petSizes.includes(k)} onCheckedChange={(v) => toggleIn("petSizes", k, v)} />
                  <span className="font-display font-black">{k}</span>
                  <span className="hidden text-[10px] text-muted-foreground sm:inline">{label}</span>
                </label>
              ))}
            </div>
            {errors.petSizes && <FieldError>{errors.petSizes}</FieldError>}
          </div>
        </div>

        <Button onClick={save} disabled={saving} className="w-full rounded-xl bg-primary font-bold">
          {saving ? <><Spin /> Guardando…</> : isEdit ? "Guardar cambios" : "Publicar servicio"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Servicios: tarjeta ─────────────────────────

export function ServiceCard({ s, busy, onEdit, onToggle, onDelete }: {
  s: ServiceItem; busy: boolean;
  onEdit: () => void; onToggle: (active: boolean) => void; onDelete: () => void;
}) {
  const cm = categoryMeta(s.category);
  const mod = MODALITY_META[s.modality] ?? MODALITY_META.DOMICILIO;
  const extras = JSON.parse(s.extrasJson || "[]") as { name: string; usd: number }[];
  return (
    <article className={cn("rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-transform hover:-translate-y-0.5", !s.active && "opacity-75")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", cm.soft, cm.iconColor)}>
            <CategoryIcon category={s.category} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-extrabold">{s.name}</h3>
            <span className={cn("mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold", cm.chip)}>
              {cm.emoji} {cm.label}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {busy ? <Spin className="text-muted-foreground" /> : <Switch checked={s.active} onCheckedChange={onToggle} aria-label={s.active ? "Desactivar servicio" : "Activar servicio"} />}
          <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{s.active ? "Activo" : "Inactivo"}</span>
        </div>
      </div>

      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{s.description}</p>

      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-lg font-black text-primary">{fmtUsd(s.priceUsd)}</span>
        {s.priceToUsd != null && <span className="text-xs font-bold text-muted-foreground">hasta {fmtUsd(s.priceToUsd)}</span>}
        <span className="text-[11px] text-muted-foreground">· ⏱ {s.durationMin} min</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="rounded-lg bg-secondary/70 px-2 py-0.5 text-[10px] font-bold">{mod.emoji} {mod.label}</span>
        {s.petTypes.includes("PERRO") && <span className="rounded-lg bg-secondary/70 px-2 py-0.5 text-[10px] font-bold">🐕</span>}
        {s.petTypes.includes("GATO") && <span className="rounded-lg bg-secondary/70 px-2 py-0.5 text-[10px] font-bold">🐈</span>}
        {s.petSizes.split(",").filter(Boolean).map((z) => <span key={z} className="rounded-lg bg-secondary/70 px-2 py-0.5 text-[10px] font-bold">{z}</span>)}
        {extras.length > 0 && <span className="rounded-lg bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent-foreground">+{extras.length} extra{extras.length > 1 ? "s" : ""}</span>}
      </div>

      <div className="mt-3 flex gap-1.5 border-t border-dashed border-border/70 pt-3">
        <Button size="sm" variant="outline" onClick={onEdit} className="h-8 flex-1 rounded-lg text-xs font-bold"><Pencil className="h-3.5 w-3.5" /> Editar</Button>
        <Button size="sm" variant="ghost" onClick={onDelete} disabled={busy} className="h-8 flex-1 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950">
          {busy ? <Spin /> : <Trash2 className="h-3.5 w-3.5" />} Eliminar
        </Button>
      </div>
    </article>
  );
}

// ───────────────────────── CRM: dialog detalle/crear ─────────────────────────

interface ContactHistorial {
  bookings: HistorialBooking[];
  events: HistorialEvent[];
}

export function ContactDialog({ open, onOpenChange, contact, businessName, onSaved, onDeleted }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  contact: ContactItem | null; businessName: string;
  onSaved: () => void; onDeleted: () => void;
}) {
  const isEdit = !!contact;
  const [form, setForm] = useState({ name: "", phone: "", email: "", petName: "", petType: "", status: "NUEVO", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [historial, setHistorial] = useState<ContactHistorial | null>(null);
  const [histLoading, setHistLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setHistorial(null);
    if (contact) {
      setForm({
        name: contact.name, phone: contact.phone ?? "", email: contact.email ?? "",
        petName: contact.petName ?? "", petType: contact.petType ?? "",
        status: contact.status, notes: contact.notes ?? "",
      });
      setHistLoading(true);
      apiGet<{ historial: ContactHistorial }>(`/api/crm/contacts/${contact.id}`)
        .then((d) => setHistorial(d.historial))
        .catch(() => setHistorial(null))
        .finally(() => setHistLoading(false));
    } else {
      setForm({ name: "", phone: "", email: "", petName: "", petType: "", status: "NUEVO", notes: "" });
    }
  }, [open, contact]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = "El nombre del contacto es obligatorio";
    if (form.phone.trim() && !/^[+0-9 ()-]{7,24}$/.test(form.phone.trim())) errs.phone = "Teléfono inválido (ej: +58 412 555 0000)";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(), phone: form.phone.trim() || null, email: form.email.trim() || null,
        petName: form.petName.trim() || null, petType: form.petType || null,
        status: form.status, notes: form.notes.trim() || null,
      };
      if (isEdit && contact) await apiPatch(`/api/crm/contacts/${contact.id}`, body);
      else await apiPost("/api/crm/contacts", body);
      toast.success(isEdit ? "Cliente actualizado 💚" : "¡Cliente agregado a tu CRM! 🤝");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el cliente");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!contact) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/crm/contacts/${contact.id}`);
      toast.success("Cliente eliminado del CRM");
      onOpenChange(false);
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto scroll-slim rounded-3xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display font-black">
            {isEdit ? "Ficha del cliente 👤" : "Nuevo cliente 🤝"}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? "Actualiza sus datos, estado o notas internas." : "Registra un cliente manual (sin cuenta en la plataforma)."}
          </DialogDescription>
        </DialogHeader>

        {isEdit && contact && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary/50 p-3">
            <Avatar name={contact.name} className="h-10 w-10 text-xs" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold">{contact.name}</div>
              <div className="text-[11px] text-muted-foreground">
                {contact.totalVisits} visita{contact.totalVisits === 1 ? "" : "s"} · {fmtUsd(contact.totalSpentUsd)} acumulado · fuente {contact.source === "RESERVA" ? "reservas" : "manual"}
              </div>
            </div>
            <ContactStatusBadge status={contact.status} />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs font-bold">Nombre *</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ej: María González" className="mt-1 rounded-xl" />
            {errors.name && <FieldError>{errors.name}</FieldError>}
          </div>
          <div>
            <Label className="text-xs font-bold">Teléfono</Label>
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+58 412 555 0000" className="mt-1 rounded-xl" />
            {errors.phone && <FieldError>{errors.phone}</FieldError>}
          </div>
          <div>
            <Label className="text-xs font-bold">Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="maria@correo.com" className="mt-1 rounded-xl" />
          </div>
          <div>
            <Label className="text-xs font-bold">Mascota</Label>
            <Input value={form.petName} onChange={(e) => setForm((f) => ({ ...f, petName: e.target.value }))} placeholder="Ej: Toby" className="mt-1 rounded-xl" />
          </div>
          <div>
            <Label className="text-xs font-bold">Tipo de mascota</Label>
            <Select value={form.petType || "NONE"} onValueChange={(v) => setForm((f) => ({ ...f, petType: v === "NONE" ? "" : v }))}>
              <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Sin mascota registrada</SelectItem>
                <SelectItem value="PERRO">🐕 Perro</SelectItem>
                <SelectItem value="GATO">🐈 Gato</SelectItem>
                <SelectItem value="OTRO">🐾 Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-bold">Estado</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NUEVO">🟠 Nuevo</SelectItem>
                <SelectItem value="ACTIVO">🟢 Activo</SelectItem>
                <SelectItem value="VIP">👑 VIP</SelectItem>
                <SelectItem value="INACTIVO">⚪ Inactivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs font-bold">Notas internas</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="mt-1 rounded-2xl" placeholder="Preferencias, alergias, recordatorios de seguimiento…" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving} className="min-w-36 flex-1 rounded-xl bg-primary font-bold">
            {saving ? <><Spin /> Guardando…</> : "Guardar cliente"}
          </Button>
          {isEdit && contact && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" disabled={deleting} className="rounded-xl font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950">
                  {deleting ? <Spin /> : <Trash2 className="h-4 w-4" />} Eliminar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-3xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-display font-black">¿Eliminar a {contact.name}? 🗑️</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se borrará del CRM (sus eventos quedarán sin enlace, sin perderse). Esta acción no se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl font-bold">Mejor no</AlertDialogCancel>
                  <AlertDialogAction onClick={remove} className="rounded-xl bg-rose-600 font-bold hover:bg-rose-700">Sí, eliminar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {isEdit && contact?.phone && (
            <WaButton
              phone={contact.phone}
              text={`Hola ${contact.name.split(" ")[0]}! 👋 Te escribo de ${businessName}. ¿Cómo sigue tu peludito${contact.petName ? ` ${contact.petName}` : ""}? 🐾`}
              title={`Chatear con ${contact.name}`}
            />
          )}
        </div>

        {isEdit && (
          <div className="rounded-2xl border border-border/70 p-3">
            <h4 className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-muted-foreground"><History className="h-3.5 w-3.5" /> Historial del contacto</h4>
            {histLoading ? (
              <div className="flex justify-center py-4"><Spin /></div>
            ) : historial && (historial.bookings.length > 0 || historial.events.length > 0) ? (
              <div className="scroll-slim mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
                {historial.bookings.map((b) => (
                  <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/50 px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <span className="font-bold">{b.service?.name ?? "Servicio"}</span>
                      {b.pet && <span className="text-muted-foreground"> · {b.pet.species === "GATO" ? "🐱" : "🐶"} {b.pet.name}</span>}
                      <div className="text-[10px] text-muted-foreground">{b.code} · {fmtDateTime(b.scheduledAt)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-black text-primary">{fmtUsd(b.priceUsd)}</span>
                      <BookingStatusBadge status={b.status} />
                    </div>
                  </div>
                ))}
                {historial.events.map((ev) => (
                  <div key={ev.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-accent/10 px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <span className="font-bold">📌 {ev.title}</span>
                      <div className="text-[10px] text-muted-foreground">{fmtDateShort(`${ev.date}T12:00:00Z`)}{ev.startTime ? ` · ${ev.startTime}` : ""}</div>
                    </div>
                    <EventStatusChip status={ev.status} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Sin reservas ni eventos ligados todavía 🗂️</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Calendario: grid mensual ─────────────────────────

export interface DayItem { kind: "booking" | "event"; type: string; label: string; }

export function MonthGrid({ year, month, today, byDay, selected, onSelectDay }: {
  year: number; month: number; today: string;
  byDay: Record<string, DayItem[]>; selected: string | null; onSelectDay: (day: string) => void;
}) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const firstDow = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Lun = 0
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-2 shadow-sm sm:p-3">
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
          <div key={d} className="pb-1 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:text-xs">{d}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`empty-${i}`} className="min-h-[52px] rounded-xl sm:min-h-[78px]" />;
          const key = `${year}-${pad(month)}-${pad(d)}`;
          const items = byDay[key] ?? [];
          const shown = items.slice(0, 3);
          const extra = items.length - shown.length;
          const isToday = key === today;
          const isSel = key === selected;
          return (
            <button
              key={key} type="button" onClick={() => onSelectDay(key)}
              aria-label={`Ver agenda del ${key}`}
              className={cn(
                "flex min-h-[52px] cursor-pointer flex-col gap-1 rounded-xl border p-1 text-left transition-colors sm:min-h-[78px] sm:p-1.5",
                isSel ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border/50 bg-secondary/30 hover:bg-secondary/60",
                !isSel && isToday && "border-primary/70"
              )}
            >
              <span className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-extrabold sm:text-xs",
                isToday ? "bg-primary font-black text-white" : "text-foreground/80"
              )}>
                {d}
              </span>
              <span className="flex flex-wrap items-center gap-0.5">
                {shown.map((it, j) => (
                  <span key={j} title={it.label} className={cn("h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2", (EVENT_TYPE_META[it.type] ?? EVENT_TYPE_META.MANUAL).dot)} />
                ))}
                {extra > 0 && <span className="text-[8px] font-bold text-muted-foreground sm:text-[9px]">+{extra}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────── Calendario: formulario de evento ─────────────────────────

export function EventFormDialog({ open, onOpenChange, day, event, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  day: string | null; event: CalEventItem | null; onSaved: () => void;
}) {
  const isEdit = !!event;
  const [form, setForm] = useState({ title: "", date: todayStr(), startTime: "", durationMin: "", type: "MANUAL", status: "PENDIENTE", clientName: "", phone: "", petName: "", address: "", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (event) {
      setForm({
        title: event.title, date: event.date, startTime: event.startTime ?? "",
        durationMin: event.durationMin != null ? String(event.durationMin) : "",
        type: event.type, status: event.status,
        clientName: event.clientName ?? "", phone: event.phone ?? "",
        petName: event.petName ?? "", address: event.address ?? "", notes: event.notes ?? "",
      });
    } else {
      setForm({ title: "", date: day ?? todayStr(), startTime: "", durationMin: "", type: "MANUAL", status: "PENDIENTE", clientName: "", phone: "", petName: "", address: "", notes: "" });
    }
  }, [open, event, day]);

  async function save() {
    const errs: Record<string, string> = {};
    if (form.title.trim().length < 2) errs.title = "El título del evento es obligatorio";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) errs.date = "Fecha inválida";
    if (form.durationMin) {
      const d = Number(form.durationMin);
      if (!Number.isInteger(d) || d < 5 || d > 720) errs.durationMin = "Entre 5 y 720 minutos";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(), date: form.date,
        startTime: form.startTime || null,
        durationMin: form.durationMin ? Number(form.durationMin) : null,
        type: form.type, status: form.status,
        clientName: form.clientName.trim() || null, phone: form.phone.trim() || null,
        petName: form.petName.trim() || null, address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (isEdit && event) await apiPatch(`/api/calendar/events/${event.id}`, body);
      else await apiPost("/api/calendar/events", body);
      toast.success(isEdit ? "Evento actualizado 📅" : "Evento agendado 📅");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el evento");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto scroll-slim rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display font-black">{isEdit ? "Editar evento ✏️" : "Nuevo evento 📅"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Ajusta los datos de tu evento de agenda." : `Se creará el ${fmtDate(`${form.date}T12:00:00Z`)}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs font-bold">Título *</Label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ej: Corte de uñas de Rocky" className="mt-1 rounded-xl" />
            {errors.title && <FieldError>{errors.title}</FieldError>}
          </div>
          <div>
            <Label className="text-xs font-bold">Fecha {isEdit ? "" : "(del día elegido)"}</Label>
            {isEdit ? (
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="mt-1 rounded-xl" />
            ) : (
              <Input value={form.date} readOnly disabled className="mt-1 rounded-xl font-bold" />
            )}
            {errors.date && <FieldError>{errors.date}</FieldError>}
          </div>
          <div>
            <Label className="text-xs font-bold">Hora de inicio</Label>
            <Input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} className="mt-1 rounded-xl" />
          </div>
          <div>
            <Label className="text-xs font-bold">Duración (min)</Label>
            <Input type="number" min="5" step="5" inputMode="numeric" value={form.durationMin} onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value }))} placeholder="60" className="mt-1 rounded-xl" />
            {errors.durationMin && <FieldError>{errors.durationMin}</FieldError>}
          </div>
          <div>
            <Label className="text-xs font-bold">Tipo</Label>
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MANUAL">📌 Manual</SelectItem>
                <SelectItem value="RECORDATORIO">⏰ Recordatorio</SelectItem>
                <SelectItem value="RESERVA">📆 Reserva</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-bold">Estado</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDIENTE">Pendiente</SelectItem>
                <SelectItem value="CONFIRMADO">Confirmado</SelectItem>
                <SelectItem value="COMPLETADO">Completado</SelectItem>
                <SelectItem value="CANCELADO">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs font-bold">Cliente</Label>
              <Input value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} placeholder="Nombre" className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs font-bold">Teléfono</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+58 …" className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs font-bold">Mascota</Label>
              <Input value={form.petName} onChange={(e) => setForm((f) => ({ ...f, petName: e.target.value }))} placeholder="Nombre" className="mt-1 rounded-xl" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs font-bold">Dirección</Label>
            <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Zona / dirección de referencia" className="mt-1 rounded-xl" />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs font-bold">Notas</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="mt-1 rounded-2xl" placeholder="Detalles, herramientas a llevar, gate code…" />
          </div>
        </div>

        <Button onClick={save} disabled={saving} className="w-full rounded-xl bg-primary font-bold">
          {saving ? <><Spin /> Guardando…</> : isEdit ? "Guardar cambios" : "Agendar evento"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Reservas: dialog de detalle ─────────────────────────

export function BookingDetailDialog({ booking, onClose, busy, onAction }: {
  booking: ProviderBookingItem | null; onClose: () => void; busy: boolean;
  onAction: (b: ProviderBookingItem, action: "start" | "cancel" | "complete") => void;
}) {
  return (
    <Dialog open={!!booking} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto scroll-slim rounded-3xl sm:max-w-lg">
        {booking && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 font-display font-black">
                Reserva {booking.code} <BookingStatusBadge status={booking.status} />
              </DialogTitle>
              <DialogDescription>{booking.service.name} · {fmtDateTime(booking.scheduledAt)}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-2 rounded-2xl border border-border/70 p-3 text-sm sm:grid-cols-2">
              <div><span className="font-bold">👤 Cliente:</span> {booking.client.name}</div>
              <div><span className="font-bold">📞 Tel:</span> {booking.client.phone ?? "—"}</div>
              <div><span className="font-bold">{booking.pet.species === "GATO" ? "🐱" : "🐶"} Mascota:</span> {booking.pet.name} ({booking.pet.breed ?? "criollo"} · {booking.pet.size})</div>
              <div className="flex items-start gap-1 sm:col-span-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span className="font-bold">Dirección:</span> {booking.address}</div>
              <div className="flex items-center gap-1 sm:col-span-2"><Clock className="h-4 w-4 text-muted-foreground" /> Duración estimada: {booking.service.durationMin} min</div>
            </div>

            <div className="rounded-2xl bg-secondary/50 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-display text-lg font-black text-primary">{fmtUsd(booking.priceUsd)}</span>
                <span className="text-muted-foreground">{fmtBs(booking.priceBs)} · comisión {fmtUsd(booking.commissionUsd)}</span>
              </div>
              {booking.payment && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <PaymentStatusBadge status={booking.payment.status} />
                  <span className="font-bold">{booking.payment.method.replace("_", " ").toLowerCase()}</span>
                  {booking.payment.reference && <span className="text-muted-foreground">ref: {booking.payment.reference}</span>}
                </div>
              )}
              {booking.extrasJson !== "[]" && (() => {
                try {
                  const extras = JSON.parse(booking.extrasJson) as { name: string; usd: number }[];
                  if (!Array.isArray(extras) || extras.length === 0) return null;
                  return (
                    <div className="mt-1.5 text-xs text-muted-foreground">
                      Extras: {extras.map((x) => `${x.name} (+${fmtUsd(x.usd)})`).join(" · ")}
                    </div>
                  );
                } catch { return null; }
              })()}
            </div>

            {booking.notes && <div className="rounded-xl bg-accent/15 px-3 py-2 text-xs font-semibold text-accent-foreground">💬 Nota del cliente: {booking.notes}</div>}
            {booking.evidenceNote && <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">📸 Evidencia: {booking.evidenceNote}</div>}
            {booking.review && (
              <div className="rounded-xl border border-border/70 px-3 py-2 text-xs">
                <span className="font-bold">⭐ Reseña del cliente ({booking.review.rating}/5):</span> {booking.review.comment}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {booking.status !== "CANCELADA" && booking.client.phone && (
                <WaButton
                  phone={booking.client.phone}
                  text={`Hola ${booking.client.name.split(" ")[0]}! 👋 Te escribo de PetService VE por tu reserva ${booking.code} (${booking.service.name} de ${booking.pet.name}). 🐾`}
                />
              )}
              {booking.status === "CONFIRMADA" && (
                <Button size="sm" disabled={busy} onClick={() => onAction(booking, "start")} className="h-8 flex-1 rounded-lg bg-primary text-xs font-bold">Iniciar servicio</Button>
              )}
              {booking.status === "EN_CURSO" && (
                <Button size="sm" disabled={busy} onClick={() => onAction(booking, "complete")} className="h-8 flex-1 rounded-lg bg-emerald-600 text-xs font-bold hover:bg-emerald-700">Completar</Button>
              )}
              {(booking.status === "CONFIRMADA" || booking.status === "PENDIENTE_PAGO") && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction(booking, "cancel")} className="h-8 flex-1 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950">Cancelar reserva</Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
