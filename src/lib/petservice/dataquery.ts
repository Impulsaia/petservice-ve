/**
 * PetService VE — Motor de consultas en lenguaje natural para dashboards
 *
 * Diseño de seguridad:
 * - NUNCA se ejecuta SQL crudo: la pregunta se traduce a un "QuerySpec"
 *   con whitelist de datasets/métricas/ filtros y se agrega en JS.
 * - El alcance (scope) se aplica en el servidor:
 *   · admin    → datos de todo el marketplace
 *   · provider → SOLO datos del prestador autenticado (providerId de la sesión)
 * - El LLM (si se usa) solo traduce pregunta → JSON validado; el texto de la
 *   respuesta se construye de forma determinista con números reales (cero
 *   riesgo de alucinación de cifras).
 */
import { db } from "@/lib/db";
import { fmtUsd, fmtBs } from "@/lib/petservice/format";

export type Scope = "admin" | "provider";

export interface QuerySpec {
  dataset: "bookings" | "payments" | "providers" | "reviews" | "services";
  metric: "count" | "revenue" | "commission" | "avgRating";
  groupBy: null | "status" | "city" | "zone" | "category" | "method" | "day" | "rating";
  filters: {
    city?: string | null;
    zone?: string | null;
    status?: string | null;
    method?: string | null;
    category?: string | null;
    lastNDays?: number | null;
  };
  limit: number;
}

export interface QueryResult {
  spec: QuerySpec;
  answer: string;
  engine: "local" | "llm";
  columns: string[];
  rows: (string | number)[][];
}

// ─────────────── Vocabulario (es-VE) ───────────────

const STATUS_WORDS: [RegExp, string][] = [
  [/completada?s?|terminada?s?|finalizada?s?/i, "COMPLETADA"],
  [/cancelada?s?/i, "CANCELADA"],
  [/en curso|activas?\b|en marcha/i, "EN_CURSO"],
  [/confirmada?s?/i, "CONFIRMADA"],
  [/pendiente?s? de pago|por pagar|pendiente?s?\b/i, "PENDIENTE_PAGO"],
];
const METHOD_WORDS: [RegExp, string][] = [
  [/pago m[óo]vil|pagom[óo]vil/i, "PAGO_MOVIL"],
  [/transferencia|transfer/i, "TRANSFERENCIA"],
  [/zelle/i, "ZELLE"],
  [/binance|usdt|cripto/i, "BINANCE"],
  [/efectivo/i, "EFECTIVO"],
];
const CATEGORY_WORDS: [RegExp, string][] = [
  [/grooming|peluquer[ií]a|peluqueria/i, "GROOMING"],
  [/veterinari[oa]s?\b|\bvet\b|consultas|vacunaci[óo]n|desparasitaci[óo]n/i, "VET"],
  [/delivery/i, "DELIVERY"],
  [/pet sitting|sitting|cuidado/i, "PET_SITTING"],
  [/paseos?\b|dog walking/i, "DOG_WALKING"],
  [/adiestramiento|training/i, "TRAINING"],
  [/pet taxi|taxi/i, "PET_TAXI"],
  [/spa m[óo]vil|spa\b/i, "SPA_MOVIL"],
];
const CITY_NAMES = ["Puerto Ordaz", "San Félix", "Ciudad Bolívar", "Upata"];

const DATASET_LABEL: Record<QuerySpec["dataset"], string> = {
  bookings: "reservas",
  payments: "pagos",
  providers: "prestadores",
  reviews: "reseñas",
  services: "servicios",
};

// ─────────────── Parser local determinista ───────────────

function firstMatch(words: [RegExp, string][], q: string): string | null {
  for (const [re, v] of words) if (re.test(q)) return v;
  return null;
}

export function parseQuestion(question: string, scope: Scope): Partial<QuerySpec> | null {
  const q = question.toLowerCase();

  let dataset: QuerySpec["dataset"] | null = null;
  if (/reserva|agenda|cita|solicitud/.test(q)) dataset = "bookings";
  else if (/pago|concilia|recaudaci|cobr/.test(q)) dataset = "payments";
  else if (/prestador|negocio|tienda|empresa/.test(q)) dataset = "providers";
  else if (/rese[ñn]a|califica|estrella/.test(q)) dataset = "reviews";
  else if (/servicio/.test(q)) dataset = "services";
  if (!dataset) return null;

  let metric: QuerySpec["metric"] = "count";
  if (/ingreso|factur|gmv|vendido|venta|revenue|ganancia|recaud|monto|cu[áa]nto dinero/.test(q)) metric = "revenue";
  else if (/comisi[óo]n/.test(q)) metric = "commission";
  else if (/promedio|rating|estrella|calificaci[óo]n media|puntaje/.test(q)) metric = "avgRating";

  let groupBy: QuerySpec["groupBy"] = null;
  if (/por estado|por status|por situaci[óo]n|distribuci[óo]n/.test(q)) groupBy = "status";
  else if (/por ciudad|por zona|ciudades|zonas/.test(q)) groupBy = "city";
  else if (/por categor[ií]a/.test(q)) groupBy = "category";
  else if (/por m[ée]todo|formas de pago|m[ée]todos de pago/.test(q)) groupBy = "method";
  else if (/por d[ií]a|por semana|evoluci[óo]n|a lo largo|timeline/.test(q)) groupBy = "day";
  else if (/por estrella|por puntaje|por rating|distribuci[óo]n de rating/.test(q)) groupBy = "rating";
  else if (/m[ée]todo de pago m[áa]s usado|cu[áa]l m[ée]todo/.test(q)) { groupBy = "method"; }
  if (metric === "revenue" && /por m[ée]todo/.test(q)) groupBy = "method";

  const limitMatch = q.match(/top\s*(\d{1,2})/);
  const limit = limitMatch ? Math.min(20, Math.max(1, Number(limitMatch[1]))) : 6;

  const city = CITY_NAMES.find((c) => q.includes(c.toLowerCase())) ?? null;
  let zoneName: string | null = null;
  if (!city) {
    for (const z of ["Alta Vista", "Unare", "Villa América", "Los Mangos", "Villa Colombia", "Cachamay", "La Llovizna", "San Félix Centro", "El Roble", "Los Olivos", "Villa Española", "Las Américas", "11 de Abril", "Dalla Costa", "Los Tanques", "El Niño", "La Cruz", "Guaicara", "Caratal", "Caruachi", "El Palúu", "Centro Histórico", "Vista Hermosa", "La Sabanita", "Paseo Orinoco", "La Coromoto", "Upata Centro", "Las Mercedes", "La Concepción", "El Cerro"]) {
      if (q.includes(z.toLowerCase())) { zoneName = z; break; }
    }
  }

  let lastNDays: number | null = null;
  if (/\bhoy\b/.test(q)) lastNDays = 1;
  else if (/esta semana|[úu]ltimos 7|[úu]ltima semana/.test(q)) lastNDays = 7;
  else if (/este mes|[úu]ltimos 30|[úu]ltimo mes/.test(q)) lastNDays = 30;
  else if (/[úu]ltimos (\d{1,3}) d[ií]as/.test(q)) lastNDays = Math.min(365, Number(q.match(/[úu]ltimos (\d{1,3}) d[ií]as/)?.[1] ?? 30));

  return {
    dataset,
    metric,
    groupBy,
    filters: {
      city,
      zone: zoneName,
      status: firstMatch(STATUS_WORDS, q),
      method: firstMatch(METHOD_WORDS, q),
      category: firstMatch(CATEGORY_WORDS, q),
      lastNDays,
    },
    limit,
  };
}

// ─────────────── Ejecución segura del QuerySpec ───────────────

function startOfDayNDaysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export async function executeQuery(spec: QuerySpec, scope: Scope, providerId?: string, engine: "local" | "llm" = "local"): Promise<QueryResult> {
  const settings = await db.settings.findUnique({ where: { id: "main" } });
  const rate = settings?.usdToBs ?? 40;
  const f = spec.filters;
  const since = f.lastNDays ? startOfDayNDaysAgo(f.lastNDays) : null;
  const fmt = (n: number) => fmtUsd(n);
  const nLabel = f.lastNDays ? (f.lastNDays === 1 ? "hoy" : `en los últimos ${f.lastNDays} días`) : "en total";

  // ── bookings ──
  if (spec.dataset === "bookings") {
    const where: Record<string, unknown> = {};
    if (scope === "provider") where.providerId = providerId;
    if (f.status) where.status = f.status;
    if (since) where.createdAt = { gte: since.toISOString() };
    const rows = await db.booking.findMany({
      where,
      select: {
        status: true, priceUsd: true, commissionUsd: true, createdAt: true,
        service: { select: { category: true } },
        provider: { select: { city: true, zoneName: true } },
        pet: { select: { species: true } },
      },
      take: 2000,
    });
    let list = rows;
    if (f.city) list = list.filter((b) => b.provider.city === f.city);
    if (f.zone) list = list.filter((b) => b.provider.zoneName === f.zone);
    if (f.category) list = list.filter((b) => b.service.category === f.category);
    if (spec.metric === "revenue" && !f.status) {
      // ingresos = reservas no canceladas (aviso en la respuesta)
      list = list.filter((b) => b.status !== "CANCELADA");
    }
    const total = list.reduce((a, b) => a + b.priceUsd, 0);
    const comm = list.reduce((a, b) => a + b.commissionUsd, 0);

    let answer: string;
    let columns: string[];
    let table: (string | number)[][];

    if (spec.groupBy === "status") {
      const groups = countBy(list, (b) => b.status);
      const labels: Record<string, string> = { PENDIENTE_PAGO: "Pendiente de pago", CONFIRMADA: "Confirmada", EN_CURSO: "En curso", COMPLETADA: "Completada", CANCELADA: "Cancelada" };
      table = [...groups.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [labels[k] ?? k, v, pct(v, list.length)]);
      columns = ["Estado", "Reservas", "%"];
      answer = `📅 ${list.length} reservas ${nLabel}${desc(f)}${spec.metric === "revenue" ? ` · monto ${fmt(total)} (≈ ${fmtBs(total * rate)})` : ""}, agrupadas por estado.`;
    } else if (spec.groupBy === "city") {
      const groups = sumBy(list, (b) => b.provider.city, spec.metric === "count");
      table = [...groups.entries()].sort((a, b) => (b[1] as number) - (a[1] as number)).map(([k, v]) => [k, spec.metric === "count" ? v : fmt(v as number)]);
      columns = ["Ciudad", spec.metric === "count" ? "Reservas" : "Monto"];
      answer = `🏙️ Reservas por ciudad ${nLabel}${desc(f)} — total ${list.length} · ${fmt(total)}.`;
    } else if (spec.groupBy === "zone") {
      const groups = sumBy(list, (b) => `${b.provider.zoneName} (${b.provider.city})`, spec.metric === "count");
      table = [...groups.entries()].sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, spec.limit).map(([k, v]) => [k, spec.metric === "count" ? v : fmt(v as number)]);
      columns = ["Zona", spec.metric === "count" ? "Reservas" : "Monto"];
      answer = `📍 Top zonas por ${spec.metric === "count" ? "número de reservas" : "monto"} ${nLabel}${desc(f)} — total ${list.length} reservas · ${fmt(total)}.`;
    } else if (spec.groupBy === "category") {
      const groups = sumBy(list, (b) => b.service.category, spec.metric === "count");
      table = [...groups.entries()].sort((a, b) => (b[1] as number) - (a[1] as number)).map(([k, v]) => [k, spec.metric === "count" ? v : fmt(v as number)]);
      columns = ["Categoría", spec.metric === "count" ? "Reservas" : "Monto"];
      answer = `🗂️ Reservas por categoría ${nLabel}${desc(f)} — total ${list.length} · ${fmt(total)}.`;
    } else if (spec.groupBy === "day") {
      const groups = new Map<string, number>();
      for (const b of list) {
        const d = new Date(b.createdAt);
        const key = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
        const v = spec.metric === "count" ? 1 : b.priceUsd;
        groups.set(key, (groups.get(key) ?? 0) + v);
      }
      table = [...groups.entries()].slice(-14).map(([k, v]) => [k, spec.metric === "count" ? v : fmt(v)]);
      columns = ["Día", spec.metric === "count" ? "Reservas" : "Monto"];
      answer = `📈 Evolución diaria ${nLabel}${desc(f)} — ${list.length} reservas · ${fmt(total)}${spec.metric !== "count" ? ` · comisión ${fmt(comm)}` : ""}.`;
    } else {
      answer =
        spec.metric === "revenue"
          ? `💰 Monto de reservas ${nLabel}${desc(f)}: ${fmt(total)} (≈ ${fmtBs(total * rate)}) · comisión de plataforma ${fmt(comm)}.`
          : `🎯 ${list.length} reservas ${nLabel}${desc(f)} · monto total ${fmt(total)}.`;
      columns = ["Métrica", "Valor"];
      table = [
        ["Reservas", list.length],
        ...(spec.metric === "commission" ? ([["Comisión", fmt(comm)]] as (string | number)[][]) : []),
        ["Monto", fmt(total)],
      ];
    }
    return { spec, answer, engine, columns, rows: table };
  }

  // ── payments ──
  if (spec.dataset === "payments") {
    let answer: string;
    let columns: string[];
    let table: (string | number)[][];
    const rows = await db.payment.findMany({
      where: since ? { createdAt: { gte: since.toISOString() } } : undefined,
      select: {
        method: true, status: true, amountUsd: true, amountBs: true, createdAt: true,
        booking: { select: { providerId: true, provider: { select: { city: true, zoneName: true } } } },
      },
      take: 2000,
    });
    let list = rows;
    if (scope === "provider") list = list.filter((p) => p.booking.providerId === providerId);
    const payStatus = f.status ? (f.status === "PENDIENTE_PAGO" ? "PENDIENTE" : f.status.toUpperCase()) : null;
    if (payStatus && ["PENDIENTE", "VERIFICADO", "RECHAZADO"].includes(payStatus)) list = list.filter((p) => p.status === payStatus);
    else if (payStatus === "COMPLETADA") list = list.filter((p) => p.status === "VERIFICADO");
    if (f.method) list = list.filter((p) => p.method === f.method);
    if (f.city) list = list.filter((p) => p.booking.provider.city === f.city);
    const total = list.reduce((a, p) => a + p.amountUsd, 0);

    if (spec.groupBy === "method") {
      const groups = sumBy(list, (p) => p.method.replace("_", " "), spec.metric === "count");
      table = [...groups.entries()].sort((a, b) => (b[1] as number) - (a[1] as number)).map(([k, v]) => [k, spec.metric === "count" ? v : fmt(v as number)]);
      columns = ["Método", spec.metric === "count" ? "Pagos" : "Monto"];
      answer = `💳 Pagos por método ${nLabel} — ${list.length} pagos · ${fmt(total)}.`;
    } else if (spec.groupBy === "status") {
      const groups = countBy(list, (p) => p.status);
      const labels: Record<string, string> = { PENDIENTE: "Por verificar", VERIFICADO: "Verificado", RECHAZADO: "Rechazado" };
      table = [...groups.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [labels[k] ?? k, v, pct(v, list.length)]);
      columns = ["Estado del pago", "Cantidad", "%"];
      answer = `🧾 ${list.length} pagos ${nLabel}${desc(f)} — monto ${fmt(total)}.`;
    } else if (spec.groupBy === "day") {
      const groups = new Map<string, number>();
      for (const p of list) {
        const d = new Date(p.createdAt);
        const key = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
        groups.set(key, (groups.get(key) ?? 0) + (spec.metric === "count" ? 1 : p.amountUsd));
      }
      table = [...groups.entries()].slice(-14).map(([k, v]) => [k, spec.metric === "count" ? v : fmt(v)]);
      columns = ["Día", spec.metric === "count" ? "Pagos" : "Monto"];
      answer = `📈 Pagos por día ${nLabel} — ${list.length} pagos · ${fmt(total)}.`;
    } else {
      answer = `💳 ${list.length} pagos ${nLabel}${desc(f)} · monto total ${fmt(total)} (≈ ${fmtBs(total * rate)}).`;
      columns = ["Métrica", "Valor"];
      table = [["Pagos", list.length], ["Monto", fmt(total)]];
    }
    return { spec, answer, engine, columns, rows: table };
  }

  // ── providers ──
  if (spec.dataset === "providers") {
    let answer: string;
    let columns: string[];
    let table: (string | number)[][];
    if (scope === "provider") {
      return { spec, answer: "ℹ️ Para prestadores las consultas cubren tus reservas, pagos y reseñas. Las métricas globales de prestadores son del panel admin.", engine: "local", columns: [], rows: [] };
    }
    const rows = await db.provider.findMany({ select: { city: true, zoneName: true, status: true, ratingAvg: true }, take: 2000 });
    let list = rows;
    if (f.city) list = list.filter((p) => p.city === f.city);
    if (f.status) list = list.filter((p) => p.status === f.status!.toUpperCase());
    const avg = list.length ? list.reduce((a, p) => a + p.ratingAvg, 0) / list.length : 0;

    if (spec.groupBy === "city") {
      const groups = countBy(list, (p) => p.city);
      table = [...groups.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v]);
      columns = ["Ciudad", "Prestadores"];
      answer = `🏙️ ${list.length} prestadores registrados${desc(f)}.`;
    } else if (spec.groupBy === "status") {
      const groups = countBy(list, (p) => p.status);
      const labels: Record<string, string> = { PENDING: "En verificación", VERIFIED: "Verificado", REJECTED: "Rechazado", SUSPENDED: "Suspendido" };
      table = [...groups.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [labels[k] ?? k, v, pct(v, list.length)]);
      columns = ["Estado", "Prestadores", "%"];
      answer = `🛡️ ${list.length} prestadores${desc(f)} · rating promedio ⭐ ${avg.toFixed(2)}.`;
    } else {
      answer = `🧑‍🎨 ${list.length} prestadores${desc(f)} · rating promedio ⭐ ${avg.toFixed(2)}.`;
      columns = ["Métrica", "Valor"];
      table = [["Prestadores", list.length], ["Rating promedio", avg.toFixed(2)]];
    }
    return { spec, answer, engine, columns, rows: table };
  }

  // ── reviews ──
  if (spec.dataset === "reviews") {
    let answer: string;
    let columns: string[];
    let table: (string | number)[][];
    const rows = await db.review.findMany({
      where: since ? { createdAt: { gte: since.toISOString() } } : undefined,
      select: { rating: true, hidden: true, provider: { select: { id: true, businessName: true, city: true, zoneName: true } } },
      take: 2000,
    });
    let list = rows;
    if (scope === "provider") list = list.filter((r) => r.provider.id === providerId);
    if (f.city) list = list.filter((r) => r.provider.city === f.city);
    const avg = list.length ? list.reduce((a, r) => a + r.rating, 0) / list.length : 0;

    if (spec.groupBy === "rating") {
      table = [5, 4, 3, 2, 1].map((n) => [`${n} ⭐`, list.filter((r) => r.rating === n).length]);
      columns = ["Rating", "Reseñas"];
      answer = `⭐ ${list.length} reseñas ${nLabel}${desc(f)} · promedio ${avg.toFixed(2)} estrellas.`;
    } else if (spec.groupBy === "city" && scope === "admin") {
      const groups = new Map<string, { n: number; sum: number }>();
      for (const r of list) {
        const g = groups.get(r.provider.city) ?? { n: 0, sum: 0 };
        g.n++; g.sum += r.rating;
        groups.set(r.provider.city, g);
      }
      table = [...groups.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => [k, v.n, (v.sum / v.n).toFixed(2)]);
      columns = ["Ciudad", "Reseñas", "Promedio"];
      answer = `🏙️ Reseñas por ciudad ${nLabel} — ${list.length} en total, promedio ${avg.toFixed(2)}.`;
    } else if (spec.groupBy === "status") {
      const groups = countBy(list, (r) => (r.hidden ? "Ocultas" : "Visibles"));
      table = [...groups.entries()].map(([k, v]) => [k, v]);
      columns = ["Estado", "Reseñas"];
      answer = `👁️ ${list.length} reseñas ${nLabel}${desc(f)} · promedio ${avg.toFixed(2)}.`;
    } else {
      answer = `⭐ ${list.length} reseñas ${nLabel}${desc(f)} · promedio ${avg.toFixed(2)} estrellas.`;
      columns = ["Métrica", "Valor"];
      table = [["Reseñas", list.length], ["Promedio", avg.toFixed(2)]];
    }
    return { spec, answer, engine, columns, rows: table };
  }

  // ── services ──
  const rows = await db.service.findMany({
    select: { category: true, priceUsd: true, active: true, provider: { select: { id: true, city: true, zoneName: true } } },
    take: 2000,
  });
  let list = rows;
  if (scope === "provider") list = list.filter((s) => s.provider.id === providerId);
  if (f.city) list = list.filter((s) => s.provider.city === f.city);
  if (f.category) list = list.filter((s) => s.category === f.category);
  const avgPrice = list.length ? list.reduce((a, s) => a + s.priceUsd, 0) / list.length : 0;

  let columns: string[];
  let table: (string | number)[][];
  let answer: string;
  if (spec.groupBy === "category") {
    const groups = new Map<string, { n: number; sum: number }>();
    for (const s of list) {
      const g = groups.get(s.category) ?? { n: 0, sum: 0 };
      g.n++; g.sum += s.priceUsd;
      groups.set(s.category, g);
    }
    table = [...groups.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => [k, v.n, fmtUsd(v.sum / v.n)]);
    columns = ["Categoría", "Servicios", "Precio promedio"];
    answer = `🗂️ ${list.length} servicios publicados${desc(f)} · precio promedio ${fmtUsd(avgPrice)} (≈ ${fmtBs(avgPrice * rate)}).`;
  } else if (spec.groupBy === "city" && scope === "admin") {
    const groups = countBy(list, (s) => s.provider.city);
    table = [...groups.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v]);
    columns = ["Ciudad", "Servicios"];
    answer = `🏙️ ${list.length} servicios publicados${desc(f)} · precio promedio ${fmtUsd(avgPrice)}.`;
  } else {
    answer = `🛠️ ${list.length} servicios ${nLabel}${desc(f)} · precio promedio ${fmtUsd(avgPrice)} (≈ ${fmtBs(avgPrice * rate)}).`;
    columns = ["Métrica", "Valor"];
    table = [["Servicios", list.length], ["Precio promedio", fmtUsd(avgPrice)]];
  }
  return { spec, answer, engine, columns, rows: table };

  // helpers internos
  function countBy<T>(arr: T[], key: (x: T) => string): Map<string, number> {
    const m = new Map<string, number>();
    for (const x of arr) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
    return m;
  }
  function sumBy<T>(arr: T[], key: (x: T) => string, count: boolean): Map<string, number> {
    const m = new Map<string, number>();
    for (const x of arr) {
      const k = key(x);
      m.set(k, (m.get(k) ?? 0) + (count ? 1 : priceOfItem(x)));
    }
    return m;
  }
  function pct(part: number, total: number): number {
    return total ? Math.round((part / total) * 100) : 0;
  }
  function desc(f: QuerySpec["filters"]): string {
    const parts: string[] = [];
    if (f.city) parts.push(f.city);
    if (f.zone) parts.push(f.zone);
    if (f.category) parts.push(f.category.replace("_", " ").toLowerCase());
    if (f.method) parts.push(f.method.replace("_", " ").toLowerCase());
    return parts.length ? ` en ${parts.join(", ")}` : "";
  }
}

/** Suma el monto (priceUsd / amountUsd) del item */
function priceOfItem(x: unknown): number {
  const o = x as { priceUsd?: number; amountUsd?: number };
  return o?.priceUsd ?? o?.amountUsd ?? 0;
}

/**
 * Punto de entrada: pregunta en español → resultado con tabla y resumen.
 * 1) parser local; 2) si no hay dataset, LLM fallback (JSON validado);
 * 3) ejecución whitelist + agregación JS.
 */
export async function runDataQuery(question: string, scope: Scope, providerId?: string): Promise<QueryResult> {
  const parsed = parseQuestion(question, scope);
  if (parsed?.dataset) {
    const spec: QuerySpec = {
      dataset: parsed.dataset,
      metric: parsed.metric ?? "count",
      groupBy: parsed.groupBy ?? null,
      filters: parsed.filters ?? {},
      limit: parsed.limit ?? 6,
    };
    return executeQuery(spec, scope, providerId, "local");
  }

  // ── LLM fallback: traduce pregunta → spec validado ──
  const llmSpec = await specWithLlm(question);
  if (llmSpec) {
    if (scope === "provider" && (llmSpec.dataset === "providers" || llmSpec.dataset === "services")) {
      const mapped: QuerySpec = { ...llmSpec, dataset: "bookings" };
      return executeQuery(mapped, scope, providerId, "llm");
    }
    return executeQuery(llmSpec, scope, providerId, "llm");
  }

  throw new Error("NO_ENTENDI");
}

async function specWithLlm(question: string): Promise<QuerySpec | null> {
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content: `Eres un traductor de preguntas de negocio a consultas analíticas para un marketplace de mascotas en Venezuela. Devuelve SOLO JSON con esta forma exacta:
{"dataset":"bookings"|"payments"|"providers"|"reviews"|"services","metric":"count"|"revenue"|"commission"|"avgRating","groupBy":null|"status"|"city"|"zone"|"category"|"method"|"day"|"rating","filters":{"city":string|null,"zone":string|null,"status":string|null,"method":string|null,"category":string|null,"lastNDays":number|null},"limit":number}

Reglas: reservas/citas→bookings; pagos/conciliación→payments; prestadores/negocios→providers; reseñas/calificaciones→reviews; servicios/catálogo→services. ingresos/ganancias/dinero→revenue. Método de pago ∈ PAGO_MOVIL, TRANSFERENCIA, ZELLE, BINANCE, EFECTIVO. Estado reserva ∈ PENDIENTE_PAGO, CONFIRMADA, EN_CURSO, COMPLETADA, CANCELADA. Ciudad ∈ "Puerto Ordaz","San Félix","Ciudad Bolívar","Upata". lastNDays null si no menciona tiempo. Si no aplica algo → null.`,
        },
        { role: "user", content: question.slice(0, 300) },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const p = JSON.parse(match[0]) as QuerySpec;
    const DATASETS = ["bookings", "payments", "providers", "reviews", "services"];
    const METRICS = ["count", "revenue", "commission", "avgRating"];
    const GROUPS = [null, "status", "city", "zone", "category", "method", "day", "rating"];
    if (!DATASETS.includes(p.dataset) || !METRICS.includes(p.metric) || !GROUPS.includes(p.groupBy ?? null)) return null;
    return {
      dataset: p.dataset,
      metric: p.metric,
      groupBy: p.groupBy ?? null,
      limit: Math.min(20, Math.max(1, Number(p.limit) || 6)),
      filters: {
        city: CITY_NAMES.includes(p.filters?.city ?? "") ? p.filters.city : null,
        zone: typeof p.filters?.zone === "string" ? p.filters.zone.slice(0, 40) : null,
        status: typeof p.filters?.status === "string" ? p.filters.status.slice(0, 20) : null,
        method: typeof p.filters?.method === "string" ? p.filters.method.slice(0, 20) : null,
        category: typeof p.filters?.category === "string" ? p.filters.category.slice(0, 20) : null,
        lastNDays: typeof p.filters?.lastNDays === "number" && p.filters.lastNDays > 0 ? Math.min(365, Math.round(p.filters.lastNDays)) : null,
      },
    };
  } catch {
    return null;
  }
}
