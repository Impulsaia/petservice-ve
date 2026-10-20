"use client";

/**
 * PetService VE — CRM-lite WhatsApp (Task 26-d)
 * Piezas nuevas del CRM del prestador:
 *  1. Etiquetas: barra de filtros por tag (chips) + panel de contacto por etiqueta.
 *  2. Plantillas de WhatsApp editables con variables {cliente} {mascota} {servicio}
 *     {fecha} {prestador} — persistidas en localStorage por providerId
 *     (clave `petservice.waTemplates.<providerId>`, sin cambios de schema).
 *  3. QR de WhatsApp real (librería qrcode, client-side) para que los clientes
 *     escaneen y escriban al prestador por wa.me.
 *  4. Exportación de los contactos FILTRADOS a CSV (BOM UTF-8) y vCard 3.0.
 *
 * Todo corre en el cliente salvo las APIs CRM existentes (mismo canal wa.me
 * de siempre: se abre un chat por contacto, el envío es manual — sin baneos).
 */

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  Download, ExternalLink, MessageCircle, MessageSquareQuote, Pencil, QrCode, Send, Tag, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { apiGet } from "@/lib/petservice/api";
import { fmtDate, todayStr, waLink } from "@/lib/petservice/format";
import { Avatar, EmptyState } from "@/components/petservice/shared";
import { ContactItem, HistorialBooking, parseTags } from "@/components/petservice/provider-parts";

// ───────────────────────── Estilo compartido del botón verde WhatsApp ─────────────────────────

export const WA_GREEN_BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#25D366] font-bold text-white transition-colors hover:bg-[#1ebe5b]";

// ───────────────────────── 2) Plantillas de WhatsApp (localStorage) ─────────────────────────

export interface WaTemplate { id: string; name: string; emoji: string; text: string; }

export const WA_TEMPLATE_VARS = ["{cliente}", "{mascota}", "{servicio}", "{fecha}", "{prestador}"] as const;

export const DEFAULT_WA_TEMPLATES: WaTemplate[] = [
  {
    id: "confirmacion", name: "Confirmación de reserva", emoji: "✅",
    text: "Hola {cliente}! 👋 Te confirmamos tu reserva de {servicio} para {mascota} el {fecha}. ¡Te esperamos! — {prestador} 🐾",
  },
  {
    id: "recordatorio24", name: "Recordatorio 24 h", emoji: "⏰",
    text: "Hola {cliente}! ⏰ Te recordamos que {mascota} tiene su cita de {servicio} el {fecha}. Si necesitas moverla, respóndenos por aquí. — {prestador}",
  },
  {
    id: "gracias", name: "Gracias por su visita (post-servicio)", emoji: "💚",
    text: "Hola {cliente}! 💚 Gracias por confiar en {prestador}: {mascota} quedó feliz después de su {servicio} del {fecha}. Si te encantó el resultado, cuéntanoslo en una reseña 🙏🐾",
  },
  {
    id: "promo", name: "Promoción / reactivación", emoji: "🎁",
    text: "Hola {cliente}! 🎁 En {prestador} tenemos una promoción especial para {mascota} esta semana. ¿Lo agendamos? Escríbenos por aquí y te guardamos el cupo 🐶🐱",
  },
  {
    id: "pago", name: "Pago pendiente", emoji: "💳",
    text: "Hola {cliente}! 💳 Te escribimos de {prestador} para recordarte el pago pendiente del servicio de {mascota} ({servicio}, {fecha}). ¿Con qué método prefieres cancelarlo? Pago móvil, transferencia o efectivo. ¡Gracias!",
  },
];

function waTplKey(providerId: string): string {
  return `petservice.waTemplates.${providerId || "demo"}`;
}

/** Lee las plantillas guardadas del prestador (merge con las originales por id). */
export function loadWaTemplates(providerId: string): WaTemplate[] {
  if (typeof window === "undefined") return DEFAULT_WA_TEMPLATES;
  let stored: Partial<WaTemplate>[] = [];
  try {
    const raw = window.localStorage.getItem(waTplKey(providerId));
    if (raw) stored = JSON.parse(raw) as Partial<WaTemplate>[];
  } catch {
    stored = [];
  }
  const byId = new Map(stored.filter((t) => t && typeof t.id === "string").map((t) => [t.id as string, t]));
  return DEFAULT_WA_TEMPLATES.map((d) => {
    const s = byId.get(d.id);
    return { ...d, text: typeof s?.text === "string" && s.text.trim() ? s.text : d.text };
  });
}

/** Guarda las plantillas editadas del prestador en localStorage. */
export function saveWaTemplates(providerId: string, templates: WaTemplate[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(waTplKey(providerId), JSON.stringify(templates));
  } catch {
    toast.error("No se pudieron guardar las plantillas en este navegador");
  }
}

/** Sustituye las variables de una plantilla; lo que falte queda como "—". */
export function renderTemplate(text: string, vars: {
  cliente?: string; mascota?: string; servicio?: string; fecha?: string; prestador?: string;
}): string {
  return text
    .split("{cliente}").join(vars.cliente?.trim() || "—")
    .split("{mascota}").join(vars.mascota?.trim() || "—")
    .split("{servicio}").join(vars.servicio?.trim() || "—")
    .split("{fecha}").join(vars.fecha?.trim() || "—")
    .split("{prestador}").join(vars.prestador?.trim() || "—");
}

/** Variables disponibles SOLO con los datos del contacto (sin buscar historial). */
function baseVarsFor(c: ContactItem, businessName: string) {
  return {
    cliente: c.name.split(" ")[0] ?? c.name,
    mascota: c.petName ?? "",
    servicio: "",
    fecha: "",
    prestador: businessName,
  };
}

// ───────────────────────── 4) Exportar contactos: CSV y vCard ─────────────────────────

function downloadBlob(content: string, mime: string, filename: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(v: string): string {
  return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV con BOM UTF-8 para que Excel lo abra bien con acentos. */
export function exportContactsCsv(contacts: ContactItem[]): boolean {
  if (contacts.length === 0) return false;
  const header = "nombre,telefono,email,mascota,tipo mascota,estado,etiquetas,visitas,gastado USD,ultima visita";
  const rows = contacts.map((c) =>
    [
      c.name,
      c.phone ?? "",
      c.email ?? "",
      c.petName ?? "",
      c.petType ?? "",
      c.status,
      c.tags ?? "",
      String(c.totalVisits),
      String(c.totalSpentUsd),
      c.lastVisitAt ? new Date(c.lastVisitAt).toISOString().slice(0, 10) : "",
    ].map(csvCell).join(",")
  );
  const csv = "\uFEFF" + header + "\n" + rows.join("\n") + "\n";
  downloadBlob(csv, "text/csv;charset=utf-8", `crm-contactos-${todayStr()}.csv`);
  return true;
}

function vcardEscape(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** vCard 3.0 (un VCARD por contacto; mascota, estado y etiquetas van en NOTE). */
export function exportContactsVcf(contacts: ContactItem[]): boolean {
  if (contacts.length === 0) return false;
  const cards = contacts.map((c) => {
    const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0", `FN:${vcardEscape(c.name)}`, `N:${vcardEscape(c.name)};;;`];
    if (c.phone) lines.push(`TEL;TYPE=CELL:${c.phone.replace(/[^\d+]/g, "")}`);
    if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${c.email}`);
    const noteBits: string[] = [];
    if (c.petName) noteBits.push(`Mascota: ${c.petName}${c.petType ? ` (${c.petType})` : ""}`);
    if (c.status) noteBits.push(`Estado CRM: ${c.status}`);
    const tags = parseTags(c.tags);
    if (tags.length > 0) noteBits.push(`Etiquetas: ${tags.join(", ")}`);
    if (c.notes) noteBits.push(c.notes);
    if (noteBits.length > 0) lines.push(`NOTE:${vcardEscape(noteBits.join(" · "))}`);
    lines.push("END:VCARD");
    return lines.join("\r\n");
  });
  downloadBlob(cards.join("\r\n") + "\r\n", "text/vcard;charset=utf-8", `crm-contactos-${todayStr()}.vcf`);
  return true;
}

// ───────────────────────── 1) Barra de filtros por etiqueta ─────────────────────────

export function TagFilterBar({ tags, active, onToggle, onClear }: {
  tags: string[]; active: string | null;
  onToggle: (tag: string) => void; onClear: () => void;
}) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border/70 bg-card p-2.5 shadow-sm">
      <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
        <Tag className="h-3 w-3" aria-hidden /> Etiquetas:
      </span>
      {tags.map((t) => {
        const on = active?.toLowerCase() === t.toLowerCase();
        return (
          <button
            key={t.toLowerCase()} type="button" onClick={() => onToggle(t)} aria-pressed={on}
            title={on ? "Quitar filtro" : `Filtrar por “${t}”`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors",
              on
                ? "border-amber-500 bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                : "border-border/70 bg-secondary/40 text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
            )}
          >
            {on && <X className="h-3 w-3" aria-hidden />} {t}
          </button>
        );
      })}
      {active && (
        <Button variant="ghost" size="sm" onClick={onClear} className="ml-1 h-7 rounded-full px-2.5 text-[11px] font-bold text-muted-foreground">
          Limpiar
        </Button>
      )}
    </div>
  );
}

// ───────────────────────── 5) Contactar N contactos por WhatsApp ─────────────────────────

export function BulkContactPanel({ contacts, tag, providerId, businessName, onEditTemplates, refreshKey }: {
  contacts: ContactItem[]; tag: string; providerId: string; businessName: string;
  onEditTemplates: () => void; refreshKey: number;
}) {
  // Se remonta con refreshKey → siempre lee las plantillas recién guardadas.
  const templates = useMemo(() => loadWaTemplates(providerId), [providerId, refreshKey]);
  const [tplId, setTplId] = useState(templates[0]?.id ?? DEFAULT_WA_TEMPLATES[0].id);
  const tpl = templates.find((t) => t.id === tplId) ?? templates[0] ?? DEFAULT_WA_TEMPLATES[0];
  const withPhone = contacts.filter((c) => !!waLink(c.phone, "x")).length;

  return (
    <section className="rounded-2xl border border-[#25D366]/40 bg-[#25D366]/5 p-4 shadow-sm dark:bg-[#25D366]/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-sm font-extrabold sm:text-base">
          <Send className="h-4 w-4 text-[#128C4A]" aria-hidden />
          Contactar {contacts.length} contacto{contacts.length === 1 ? "" : "s"} por WhatsApp
          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            <Tag className="h-2.5 w-2.5" aria-hidden /> {tag}
          </span>
        </h3>
        <div className="flex items-center gap-2">
          <Select value={tpl.id} onValueChange={setTplId}>
            <SelectTrigger className="h-9 w-[220px] rounded-xl text-xs sm:w-[260px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.emoji} {t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={onEditTemplates} className="h-9 rounded-xl font-bold" title="Editar el texto de las plantillas">
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Button>
        </div>
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground">
        Se abre un chat por contacto — el envío es manual (sin riesgo de baneo). {withPhone}/{contacts.length} tienen teléfono.
      </p>

      <div className="scroll-slim mt-3 max-h-96 space-y-1.5 overflow-y-auto pr-1">
        {contacts.map((c) => {
          const text = renderTemplate(tpl.text, baseVarsFor(c, businessName));
          const href = waLink(c.phone, text);
          return (
            <div key={c.id} className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card px-3 py-2">
              <Avatar name={c.name} className="h-8 w-8 text-[10px]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-extrabold">{c.name}</div>
                <div className="truncate text-[10px] text-muted-foreground">{c.phone ?? "sin teléfono"}{c.petName ? ` · 🐾 ${c.petName}` : ""}</div>
              </div>
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" title={`Enviar plantilla “${tpl.name}” a ${c.name}`} className={cn(WA_GREEN_BTN, "h-8 shrink-0 px-3 text-xs")}>
                  <MessageCircle className="h-3.5 w-3.5" /> Enviar
                </a>
              ) : (
                <Button disabled size="sm" title="Este contacto no tiene teléfono registrado" className="h-8 shrink-0 cursor-not-allowed rounded-lg bg-[#25D366]/50 px-3 text-xs font-bold text-white">
                  <MessageCircle className="h-3.5 w-3.5" /> Enviar
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ───────────────────────── 2) Dialog "Plantillas de WhatsApp" ─────────────────────────

interface HistVars { id: string; servicio: string; fecha: string; }

export function TemplatesDialog({ onOpenChange, providerId, businessName, contacts, initialContactId, onSavedTemplates }: {
  onOpenChange: (v: boolean) => void;
  providerId: string; businessName: string;
  contacts: ContactItem[]; initialContactId: string | null;
  onSavedTemplates?: () => void;
}) {
  const initial = useMemo(() => loadWaTemplates(providerId), [providerId]);
  const [templates, setTemplates] = useState<WaTemplate[]>(initial);
  const [tplId, setTplId] = useState(initial[0]?.id ?? DEFAULT_WA_TEMPLATES[0].id);
  const [contactId, setContactId] = useState(() => initialContactId ?? contacts.find((c) => c.phone)?.id ?? contacts[0]?.id ?? "");
  const [dirty, setDirty] = useState(false);
  const [histVars, setHistVars] = useState<HistVars | null>(null);

  const tpl = templates.find((t) => t.id === tplId) ?? templates[0] ?? DEFAULT_WA_TEMPLATES[0];
  const contact = contacts.find((c) => c.id === contactId) ?? null;

  // Última reserva del contacto (para {servicio} y {fecha}) — fetch asíncrono por contacto.
  useEffect(() => {
    if (!contactId) return;
    let alive = true;
    apiGet<{ historial: { bookings: HistorialBooking[] } }>(`/api/crm/contacts/${contactId}`)
      .then((d) => {
        const b: HistorialBooking | undefined = d.historial?.bookings?.[0];
        if (alive) setHistVars({ id: contactId, servicio: b?.service?.name ?? "", fecha: b ? fmtDate(b.scheduledAt) : "" });
      })
      .catch(() => {
        if (alive) setHistVars({ id: contactId, servicio: "", fecha: "" });
      });
    return () => { alive = false; };
  }, [contactId]);

  const vars = {
    cliente: contact?.name.split(" ")[0] ?? "",
    mascota: contact?.petName ?? "",
    servicio: histVars?.id === contactId ? histVars.servicio : "",
    fecha: histVars?.id === contactId ? histVars.fecha : "",
    prestador: businessName,
  };
  const preview = renderTemplate(tpl.text, vars);
  const waHref = contact ? waLink(contact.phone, preview) : null;

  function editText(next: string) {
    setTemplates((list) => list.map((t) => (t.id === tpl.id ? { ...t, text: next } : t)));
    setDirty(true);
  }
  function resetTpl() {
    const orig = DEFAULT_WA_TEMPLATES.find((d) => d.id === tpl.id);
    if (!orig) return;
    setTemplates((list) => list.map((t) => (t.id === orig.id ? { ...orig } : t)));
    setDirty(true);
    toast.info(`Plantilla “${tpl.name}” restablecida (recuerda guardar)`);
  }
  function save(): boolean {
    saveWaTemplates(providerId, templates);
    setDirty(false);
    onSavedTemplates?.();
    return true;
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto scroll-slim rounded-3xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display font-black">
            <MessageSquareQuote className="h-5 w-5 text-[#128C4A]" aria-hidden /> Plantillas de WhatsApp
          </DialogTitle>
          <DialogDescription>
            Elige un contacto y una plantilla: las variables se sustituyen con sus datos reales y el envío lo haces tú desde tu WhatsApp.
          </DialogDescription>
        </DialogHeader>

        {/* Contacto */}
        <div>
          <Label className="text-xs font-bold">Cliente (contacto del CRM)</Label>
          <Select value={contactId} onValueChange={setContactId}>
            <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="Selecciona un contacto" /></SelectTrigger>
            <SelectContent className="max-h-72">
              {contacts.length === 0 && <SelectItem value="NONE" disabled>Sin contactos en el CRM</SelectItem>}
              {contacts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}{c.phone ? "" : " · sin teléfono"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Selector de plantilla */}
        <div>
          <Label className="text-xs font-bold">Plantilla</Label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <button
                key={t.id} type="button" onClick={() => setTplId(t.id)} aria-pressed={t.id === tpl.id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors",
                  t.id === tpl.id
                    ? "border-[#25D366] bg-[#25D366]/15 text-[#128C4A] dark:text-[#4ade80]"
                    : "border-border/70 bg-secondary/40 text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                )}
              >
                {t.emoji} {t.name}
              </button>
            ))}
          </div>
        </div>

        {/* Editor del texto */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-bold">Texto de la plantilla</Label>
            <Button variant="ghost" size="sm" onClick={resetTpl} className="h-7 rounded-lg px-2 text-[11px] font-bold text-muted-foreground">
              Restablecer original
            </Button>
          </div>
          <Textarea value={tpl.text} onChange={(e) => editText(e.target.value)} rows={4} className="mt-1 rounded-2xl" aria-label="Texto de la plantilla" />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Variables: {WA_TEMPLATE_VARS.join(" ")} — {"{servicio}"} y {"{fecha}"} usan la última reserva del contacto (o “—” si no tiene). Se guarda en este navegador.
          </p>
        </div>

        {/* Preview estilo burbuja de WhatsApp */}
        <div>
          <Label className="text-xs font-bold">Vista previa{contact ? ` para ${contact.name}` : ""}</Label>
          <div className="mt-1 max-w-[95%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-emerald-50 px-3.5 py-2.5 text-sm shadow-sm dark:bg-emerald-950/40">
            {preview}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => { save(); toast.success("Plantillas guardadas en este navegador 💬"); }} className="rounded-xl font-bold">
            <Download className="h-4 w-4" /> {dirty ? "Guardar cambios" : "Guardado ✓"}
          </Button>
          {waHref ? (
            <a
              href={waHref} target="_blank" rel="noopener noreferrer"
              title={`Abrir chat de WhatsApp con ${contact?.name}`}
              onClick={() => { if (dirty) save(); }}
              className={cn(WA_GREEN_BTN, "h-10 min-w-52 flex-1 text-sm")}
            >
              <MessageCircle className="h-4 w-4" /> Enviar por WhatsApp
            </a>
          ) : (
            <Button
              disabled
              title={contact ? "Este contacto no tiene teléfono registrado — edítalo en su ficha" : "Selecciona un contacto"}
              className="h-10 min-w-52 flex-1 cursor-not-allowed rounded-xl bg-[#25D366]/50 font-bold text-white"
            >
              <MessageCircle className="h-4 w-4" /> Enviar por WhatsApp
            </Button>
          )}
        </div>
        {contact && !contact.phone && (
          <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
            ⚠️ {contact.name} no tiene teléfono guardado: añádelo en su ficha del CRM para poder enviarle plantillas.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── 3) Dialog "Mi QR de WhatsApp" ─────────────────────────

export function QrDialog({ onOpenChange, providerPhone, businessName }: {
  onOpenChange: (v: boolean) => void;
  providerPhone: string | null | undefined; businessName: string;
}) {
  const [msg, setMsg] = useState(() => `Hola, los contacto desde ${businessName} 🐾`);
  const [qr, setQr] = useState<{ dataUrl: string; link: string } | null>(null);
  const [failed, setFailed] = useState(false);

  const link = waLink(providerPhone, msg);

  // Genera el PNG del QR (debounce 250 ms mientras se escribe el mensaje).
  useEffect(() => {
    if (!link) return;
    let alive = true;
    const t = setTimeout(() => {
      QRCode.toDataURL(link, { width: 512, margin: 2, color: { dark: "#111827", light: "#ffffff" }, errorCorrectionLevel: "M" })
        .then((dataUrl) => {
          if (alive) { setQr({ dataUrl, link }); setFailed(false); }
        })
        .catch(() => {
          if (alive) { setQr(null); setFailed(true); }
        });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [link]);

  const digits = providerPhone ? providerPhone.replace(/\D/g, "") : "";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto scroll-slim rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display font-black">
            <QrCode className="h-5 w-5 text-[#128C4A]" aria-hidden /> Mi QR de WhatsApp
          </DialogTitle>
          <DialogDescription>
            Tus clientes escanean este QR para escribirte por WhatsApp (puedes imprimirlo para tu local, tarjetas o Instagram).
          </DialogDescription>
        </DialogHeader>

        {!providerPhone ? (
          <EmptyState
            emoji="📱" title="Tu cuenta no tiene teléfono"
            desc="Añade tu número de WhatsApp en tu perfil (el mismo con el que te registraste) y vuelve aquí para generar tu QR."
          />
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-bold">Mensaje prellenado</Label>
              <Input value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={120} className="mt-1 rounded-xl" aria-label="Mensaje prellenado del QR" />
            </div>

            <div className="flex flex-col items-center gap-2 rounded-2xl border border-border/70 bg-card p-4">
              {qr ? (
                <img src={qr.dataUrl} alt={`Código QR de WhatsApp para ${businessName}`} className="h-56 w-56 rounded-2xl bg-white p-2 shadow-sm" />
              ) : failed ? (
                <p className="py-16 text-center text-sm font-semibold text-rose-600">No se pudo generar el QR 😿 Intenta de nuevo.</p>
              ) : (
                <div className="flex h-56 w-56 items-center justify-center rounded-2xl bg-secondary/40 text-xs text-muted-foreground">
                  Generando QR…
                </div>
              )}
              <p className="font-display text-lg font-black tracking-wide">{providerPhone}</p>
              <p className="break-all text-center text-[11px] text-muted-foreground">{link}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <a
                href={qr?.dataUrl ?? "#"}
                download={`whatsapp-qr-${digits || "petservice"}.png`}
                aria-disabled={!qr}
                onClick={(e) => { if (!qr) e.preventDefault(); }}
                className={cn(
                  "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl font-bold",
                  qr ? "bg-primary text-primary-foreground hover:bg-primary/90" : "pointer-events-none bg-muted text-muted-foreground"
                )}
              >
                <Download className="h-4 w-4" /> Descargar PNG
              </a>
              {link && (
                <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border/70 px-4 font-bold hover:bg-secondary/50">
                  <ExternalLink className="h-4 w-4" /> Probar enlace
                </a>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
