"use client";

/**
 * PetService VE — Gating de monetización para el panel del prestador (Task 42)
 *
 * Cuando el plan es FREE, las tabs de CRM y Calendario muestran este bloque en
 * vez del contenido: explica las 3 vías de desbloqueo y ofrece:
 *  - Convenio de comisiones: self-serve (leer + aceptar → desbloqueo inmediato)
 *  - Suscripción mensual: solicitud por WhatsApp (admin concilia y activa)
 *  - Destacado/publicidad: solicitud por WhatsApp (independiente del CRM)
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { apiPost } from "@/lib/petservice/api";
import { SUPPORT_WHATSAPP, SUPPORT_WHATSAPP_WA } from "@/lib/petservice/constants";
import { COMMISSION_TERMS_PARAGRAPHS, COMMISSION_TERMS_TITLE, COMMISSION_TERMS_VERSION } from "@/lib/petservice/monetization";

export interface GatePricing {
  commissionPct: number;
  subscriptionMonthlyUsd: number;
  adsBoostWeeklyUsd: number;
}

interface PlanGateProps {
  section: "crm" | "calendario";
  pricing: GatePricing | null;
  businessName: string;
  rate: number;
  onUnlocked: () => void;
}

function waLink(text: string) {
  return `https://wa.me/${SUPPORT_WHATSAPP_WA}?text=${encodeURIComponent(text)}`;
}

export function MonetizationGate({ section, pricing, businessName, rate, onUnlocked }: PlanGateProps) {
  const [termsOpen, setTermsOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [sending, setSending] = useState(false);

  const sectionName = section === "crm" ? "el CRM de clientes" : "el calendario avanzado";
  const commPct = pricing?.commissionPct ?? 15;
  const subUsd = pricing?.subscriptionMonthlyUsd ?? 5;
  const adsUsd = pricing?.adsBoostWeeklyUsd ?? 3;

  async function acceptCommission() {
    if (!accepted) {
      toast.error("Primero marca la casilla: leí y acepto el convenio");
      return;
    }
    setSending(true);
    try {
      await apiPost("/api/provider/monetization", { action: "accept-commission" });
      toast.success("¡Convenio aceptado! 🤝 CRM y calendario desbloqueados");
      setTermsOpen(false);
      onUnlocked();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar la aceptación");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Encabezado del bloqueo */}
      <div className="rounded-2xl border border-amber-300/70 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/30">
        <h2 className="font-display text-lg font-extrabold text-amber-800 dark:text-amber-200">
          🔒 {section === "crm" ? "CRM de clientes" : "Calendario avanzado"} — disponible con tu plan
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-amber-800/90 dark:text-amber-200/90">
          Tu plan <strong>Gratis</strong> incluye publicar servicios, tu perfil, recibir reservas, reseñas y el contacto
          directo por WhatsApp (siempre gratis, sin comisión de intermediación). Para usar {sectionName} elige una de
          estas 3 vías:
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {/* Opción 1: Convenio de comisiones (self-serve) */}
        <div className="flex flex-col rounded-2xl border-2 border-emerald-500/60 bg-card p-4 shadow-sm">
          <span className="w-fit rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
            Recomendado · inmediato
          </span>
          <h3 className="mt-2 font-display text-base font-extrabold">🤝 Convenio de comisiones</h3>
          <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">
            Usa todo el panel sin pago fijo: aceptas pagar <strong className="text-foreground">{commPct}% por reserva completada</strong> gestionada
            dentro de PetService VE. Resumen mensual por WhatsApp. Tu WhatsApp directo con clientes sigue siendo libre.
          </p>
          <Button onClick={() => { setAccepted(false); setTermsOpen(true); }} className="mt-3 rounded-xl bg-emerald-600 font-bold hover:bg-emerald-700">
            Leer y aceptar convenio
          </Button>
        </div>

        {/* Opción 2: Suscripción */}
        <div className="flex flex-col rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
          <span className="w-fit rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
            Pago mensual
          </span>
          <h3 className="mt-2 font-display text-base font-extrabold">💎 Suscripción</h3>
          <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">
            <strong className="text-foreground">${subUsd}/mes</strong> (≈ Bs. {(subUsd * rate).toLocaleString("es-VE", { maximumFractionDigits: 0 })} a tasa BCV)
            y usas CRM + calendario <strong className="text-foreground">sin comisión por transacción</strong>. Pagas por Pago Móvil o transferencia.
          </p>
          <a
            href={waLink(`Hola PetService VE 👋 Soy ${businessName || "prestador"}. Quiero activar la SUSCRIPCIÓN mensual ($${subUsd}/mes) para desbloquear mi CRM y calendario. ¿Cómo hago el pago?`)}
            target="_blank" rel="noopener noreferrer"
            className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#128C4A] px-4 text-sm font-bold text-white transition-colors hover:bg-[#0e7a40]"
          >
            Solicitar por WhatsApp
          </a>
        </div>

        {/* Opción 3: Destacado */}
        <div className="flex flex-col rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
          <span className="w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            Publicidad
          </span>
          <h3 className="mt-2 font-display text-base font-extrabold">📢 Destacado</h3>
          <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">
            Aparece <strong className="text-foreground">PRIMERO en las búsquedas</strong> de tu zona con insignia 📢, por ${adsUsd}/semana.
            Es publicidad de posicionamiento; no desbloquea el CRM.
          </p>
          <a
            href={waLink(`Hola PetService VE 👋 Soy ${businessName || "prestador"}. Quiero contratar el DESTACADO ($${adsUsd}/semana) para aparecer primero en las búsquedas. ¿Cómo hago el pago?`)}
            target="_blank" rel="noopener noreferrer"
            className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-bold text-white transition-colors hover:bg-amber-600"
          >
            Solicitar por WhatsApp
          </a>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        ¿Dudas? Escríbenos a WhatsApp <strong>{SUPPORT_WHATSAPP}</strong> · El bloqueo se aplica en el servidor, tus datos no se pierden al activar un plan.
      </p>

      {/* Diálogo del convenio */}
      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">{COMMISSION_TERMS_TITLE}</DialogTitle>
            <DialogDescription>
              Lee con calma. Al aceptar, tu CRM y calendario se desbloquean al instante.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5 rounded-xl bg-secondary/50 p-3.5 text-xs leading-relaxed text-foreground/90">
            {COMMISSION_TERMS_PARAGRAPHS.map((p) => <p key={p.slice(0, 24)}>{p}</p>)}
            <p className="text-[11px] text-muted-foreground">Versión del texto: {COMMISSION_TERMS_VERSION} · Tu aceptación queda registrada con fecha.</p>
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/70 p-3 text-sm">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-emerald-600"
            />
            <span>Leí y acepto el convenio de comisiones ({commPct}% por reserva completada gestionada en PetService VE).</span>
          </label>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTermsOpen(false)} className="rounded-xl font-bold">Cerrar</Button>
            <Button onClick={acceptCommission} disabled={sending || !accepted} className="rounded-xl bg-emerald-600 font-bold hover:bg-emerald-700 disabled:opacity-50">
              {sending ? "Registrando…" : "Aceptar y desbloquear 🎉"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
