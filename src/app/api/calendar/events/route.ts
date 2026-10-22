import { NextResponse, after } from "next/server";
import { db, flushDb } from "@/lib/db";
import { requireRole, sameOriginOrError, readJson, jsonError, cleanText } from "@/lib/petservice/auth";
import { getProviderOf } from "@/lib/petservice/server";

const EVENT_TYPES = ["MANUAL", "RESERVA", "RECORDATORIO"];
const EVENT_STATUSES = ["PENDIENTE", "CONFIRMADO", "COMPLETADO", "CANCELADO"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * GET /api/calendar/events — agenda del prestador autenticado.
 * Query: ?from=2025-01-01&to=2025-01-31&type=MANUAL&status=PENDIENTE
 * Respuesta: { events: [...] } ordenados por fecha y hora ascendente.
 */
export async function GET(req: Request) {
  const auth = await requireRole(req, "PROVIDER");
  if (auth instanceof NextResponse) return auth;

  const provider = await getProviderOf(auth.id);
  if (!provider) return jsonError("Perfil de prestador no encontrado", 404);

  const { searchParams } = new URL(req.url);
  const from = cleanText(searchParams.get("from"), 10);
  const to = cleanText(searchParams.get("to"), 10);
  const type = cleanText(searchParams.get("type"), 14).toUpperCase();
  const status = cleanText(searchParams.get("status"), 12).toUpperCase();

  const where: Record<string, unknown> = { providerId: provider.id };
  if (EVENT_TYPES.includes(type)) where.type = type;
  if (EVENT_STATUSES.includes(status)) where.status = status;
  if (DATE_RE.test(from) || DATE_RE.test(to)) {
    where.date = {
      ...(DATE_RE.test(from) ? { gte: from } : {}),
      ...(DATE_RE.test(to) ? { lte: to } : {}),
    };
  }

  const events = await db.calendarEvent.findMany({
    where,
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    take: 300,
  });
  return NextResponse.json({ events });
}

/**
 * POST /api/calendar/events — crea un evento de agenda.
 * Body: { title, date:"YYYY-MM-DD", startTime?:"HH:MM", durationMin?, type?, status?,
 *         contactId?, clientName?, phone?, petName?, address?, notes? }
 */
export async function POST(req: Request) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "PROVIDER");
  if (auth instanceof NextResponse) return auth;

  const provider = await getProviderOf(auth.id);
  if (!provider) return jsonError("Perfil de prestador no encontrado", 404);

  const body = await readJson<Record<string, unknown>>(req, 8192);
  if (!body) return jsonError("Solicitud inválida", 400);

  const title = cleanText(body.title, 120);
  const date = cleanText(body.date, 10);
  if (title.length < 2) return jsonError("El título del evento es obligatorio", 400);
  if (!DATE_RE.test(date)) return jsonError("Fecha inválida (usa YYYY-MM-DD)", 400);

  const startTime = body.startTime ? cleanText(body.startTime, 5) : null;
  if (startTime && !TIME_RE.test(startTime)) return jsonError("startTime inválido (usa HH:MM)", 400);

  let durationMin: number | null = null;
  if (body.durationMin !== undefined && body.durationMin !== null && body.durationMin !== "") {
    const d = Number(body.durationMin);
    if (!Number.isInteger(d) || d < 5 || d > 720) return jsonError("durationMin debe ser un entero entre 5 y 720", 400);
    durationMin = d;
  }

  const type = body.type ? cleanText(body.type, 14).toUpperCase() : "MANUAL";
  if (!EVENT_TYPES.includes(type)) return jsonError(`Type debe ser: ${EVENT_TYPES.join(", ")}`, 400);
  const status = body.status ? cleanText(body.status, 12).toUpperCase() : "PENDIENTE";
  if (!EVENT_STATUSES.includes(status)) return jsonError(`Status debe ser: ${EVENT_STATUSES.join(", ")}`, 400);

  // contactId opcional: solo acepta contactos PROPIOS (anti-IDOR)
  let contactId: string | null = null;
  if (body.contactId) {
    const cid = cleanText(body.contactId, 40);
    const contact = await db.crmContact.findUnique({ where: { id: cid } });
    if (!contact || contact.providerId !== provider.id) return jsonError("Contacto no encontrado", 404);
    contactId = cid;
  }

  const event = await db.calendarEvent.create({
    data: {
      providerId: provider.id,
      title,
      date,
      startTime,
      durationMin,
      type,
      status,
      contactId,
      clientName: body.clientName ? cleanText(body.clientName, 80) : null,
      phone: body.phone ? cleanText(body.phone, 24) : null,
      petName: body.petName ? cleanText(body.petName, 40) : null,
      address: body.address ? cleanText(body.address, 300) : null,
      notes: body.notes ? cleanText(body.notes, 500) : null,
    },
  });
  return NextResponse.json({ event }, { status: 201 });
}
