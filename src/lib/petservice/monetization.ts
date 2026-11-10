/**
 * PetService VE — Monetización de prestadores (Task 42)
 *
 * Tres caminos para desbloquear el CRM/Calendario del prestador:
 *  1. COMMISSION  — self-serve: acepta el convenio de comisión por transacción
 *  2. SUBSCRIPTION — paga mensualidad; el admin activa con fecha de vencimiento
 *  3. Destacado (adsBoost) — publicidad/posicionamiento en búsquedas (independiente
 *     del plan: no desbloquea CRM, solo posiciona primero)
 *
 * El contacto directo por WhatsApp (wa.me) NUNCA se bloquea ni se cobra:
 * es el motor de confianza del marketplace. La comisión del convenio aplica a las
 * reservas gestionadas dentro de PetService VE (acuerdo de honorabilidad), no al
 * canal directo del prestador con su cliente.
 *
 * Este módulo se usa en cliente (UI de gating) y servidor (403 en APIs), así que
 * no debe importar nada de server-only.
 */

export const COMMISSION_TERMS_VERSION = "v1-2026-02";

export const COMMISSION_TERMS_TITLE = "Convenio de comisiones por transacción — PetService VE";

/** Texto del convenio (párrafos). AL MODIFICARLO: subir COMMISSION_TERMS_VERSION
 *  para que las aceptaciones queden atadas a la versión correcta. */
export const COMMISSION_TERMS_PARAGRAPHS: string[] = [
  "1. Qué es. Este convenio es el acuerdo entre el prestador de servicios («el prestador») y PetService VE que permite usar, sin pago fijo ni mensualidad, las herramientas de gestión del panel (CRM de clientes y Calendario) a cambio de un porcentaje de comisión sobre las reservas completadas dentro de la plataforma.",
  "2. Comisión. El porcentaje vigente es el que muestra la plataforma al momento de aceptar (configurable por PetService VE). Se calcula sobre el valor de cada reserva COMPLETADA (servicio prestado y cobrado) originada en PetService VE. Las reservas canceladas o no concretadas no generan comisión.",
  "3. Liquidación. PetService VE enviará al prestador un resumen mensual de sus reservas completadas y la comisión acumulada. El pago se coordina por WhatsApp y Pago Móvil/transferencia dentro de los primeros 10 días del mes siguiente.",
  "4. WhatsApp directo. El contacto directo entre el prestador y el dueño de la mascota por WhatsApp es libre y SIN comisión de intermediación. La comisión aplica únicamente a reservas gestionadas dentro de PetService VE; pedimos honestidad: si cierras tratos que llegaron por la plataforma, la plataforma no recibe nada sin este convenio.",
  "5. Duración y salida. El prestador puede desactivar este convenio cuando quiera escribiendo a soporte (WhatsApp +58 424 9526402). Al desactivarse, el CRM/Calendario vuelve a bloquearse, pero los datos del prestador no se pierden y las comisiones de reservas ya completadas siguen debiéndose.",
  "6. Transparencia de datos. PetService VE usa la información de reservas únicamente para calcular comisiones y mejorar el servicio. No se venden datos del prestador ni de sus clientes a terceros.",
  "7. Aceptación. Al marcar la casilla y aceptar, el prestador confirma que leyó y entiende este convenio. La aceptación queda registrada con fecha y versión del texto.",
];

export type PlanKey = "FREE" | "SUBSCRIPTION" | "COMMISSION";

export const PLAN_LABELS: Record<string, string> = {
  FREE: "Gratis",
  SUBSCRIPTION: "Suscripción",
  COMMISSION: "Comisión",
};

/** Estado mínimo del prestador para calcular el gating (campos del schema) */
export interface MonetizationFields {
  plan: string;
  planExpiresAt: Date | string | null;
  commissionAcceptedAt: Date | string | null;
  adsBoostUntil?: Date | string | null;
}

/** Fecha fin de un valor DateTime | string | null (cliente recibe strings ISO) */
function asDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isFinite(d.getTime()) ? d : null;
}

/** ¿Puede el prestador usar CRM/Calendario? (lógica única cliente/servidor) */
export function crmUnlocked(p: Pick<MonetizationFields, "plan" | "planExpiresAt" | "commissionAcceptedAt"> | null | undefined): boolean {
  if (!p) return false;
  if (p.plan === "SUBSCRIPTION") {
    const exp = asDate(p.planExpiresAt);
    // null = sin vencimiento (decisión explícita del admin)
    return exp === null || exp.getTime() > Date.now();
  }
  if (p.plan === "COMMISSION") {
    // El plan COMMISSION desbloquea: la aceptación self-serve siempre deja
    // commissionAcceptedAt registrada; si el admin activa el plan directamente
    // (sin aceptación en pantalla), se desbloquea igual por decisión del admin.
    return true;
  }
  return false;
}

/** ¿Está activo el destacado (publicidad/posicionamiento)? */
export function adsActive(p: Pick<MonetizationFields, "adsBoostUntil"> | null | undefined): boolean {
  if (!p?.adsBoostUntil) return false;
  const d = asDate(p.adsBoostUntil);
  return d !== null && d.getTime() > Date.now();
}

/**
 * ¿Las reservas de este prestador se cobran por la plataforma (cuentas de
 * PetService VE + conciliación del admin)? Solo si aceptó el convenio de
 * comisiones o tiene suscripción activa.
 *
 * En CUALQUIER OTRO caso (FREE sin convenio, suscripción vencida) aplica el
 * flujo de PRERESERVA DIRECTA: el cliente elige solo el TIPO de pago (sin
 * datos de depósito de la plataforma), la reserva queda confirmada de una vez
 * y el dinero se acuerda directamente entre dueño y prestador — el admin de
 * PetService VE NO concilia nada porque no hay dinero de por medio.
 */
export function usesPlatformPayments(
  p: Pick<MonetizationFields, "plan" | "planExpiresAt" | "commissionAcceptedAt"> | null | undefined
): boolean {
  return crmUnlocked(p);
}

/** Etiqueta legible del estado del plan para badges del panel */
export function planStatusLabel(p: MonetizationFields | null | undefined): string {
  if (!p) return "Gratis";
  if (p.plan === "SUBSCRIPTION") {
    const exp = asDate(p.planExpiresAt);
    if (exp === null) return "Suscripción activa";
    return exp.getTime() > Date.now() ? `Suscripción hasta ${exp.toLocaleDateString("es-VE")}` : "Suscripción vencida";
  }
  if (p.plan === "COMMISSION" && p.commissionAcceptedAt) return "Convenio de comisión";
  return "Gratis";
}
