/**
 * PetService VE — Formato de moneda y fechas (es-VE)
 * Las fechas se guardan como UTC "naive": se formatean leyendo las partes UTC
 * para que lo mostrado coincida siempre con lo agendado (America/Caracas demo).
 */

const numFmt = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numFmt0 = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 });

export function fmtUsd(n: number): string {
  return `$${numFmt.format(n)}`;
}

export function fmtBs(n: number): string {
  return `Bs. ${numFmt.format(n)}`;
}

export function fmtNum(n: number): string {
  return numFmt0.format(n);
}

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const WEEKDAYS_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** "lun 15 feb 2025" */
export function fmtDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "lun 15 feb" */
export function fmtDateShort(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

/** "10:00 a.m." */
export function fmtTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h < 12 ? "a.m." : "p.m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** "lun 15 feb · 10:00 a.m." */
export function fmtDateTime(iso: string | Date): string {
  return `${fmtDateShort(iso)} · ${fmtTime(iso)}`;
}

export function fmtWeekdayLong(idx: number): string {
  return WEEKDAYS_LONG[idx % 7];
}

/** "hace 3 días" / "hoy" / "ayer" */
export function fmtRelative(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const hours = Math.floor(diffMs / 3600000);
  if (hours < 1) return "hace unos minutos";
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return `hace ${months} ${months === 1 ? "mes" : "meses"}`;
}

/** yyyy-mm-dd de hoy (UTC naive) */
export function todayStr(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** yyyy-mm-dd → Date naive UTC a mediodía */
export function dateFromStr(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00.000Z`);
}

/** Construye Date naive UTC desde yyyy-mm-dd + "HH:mm" */
export function slotDate(dateStr: string, time: string): Date {
  return new Date(`${dateStr}T${time}:00.000Z`);
}

/**
 * Enlace de WhatsApp click-to-chat (wa.me).
 * Acepta "+58 412 5551111" → "https://wa.me/584125551111?text=..."
 * Es el canal REAL prestador↔cliente de la demo: sin APIs de pago,
 * cada parte usa su propio número y el historial vive en WhatsApp.
 */
export function waLink(phone: string | null | undefined, text: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
