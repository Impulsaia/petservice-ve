import { NextResponse, after } from "next/server";
import { db, flushDb } from "@/lib/db";
import { requireRole, sameOriginOrError, readJson, jsonError, cleanText } from "@/lib/petservice/auth";
import { getProviderOf } from "@/lib/petservice/server";

const EVENT_TYPES = ["MANUAL", "RESERVA", "RECORDATORIO"];
const EVENT_STATUSES = ["PENDIENTE", "CONFIRMADO", "COMPLETADO", "CANCELADO"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * PATCH /api/calendar/events/[id] — edita un evento PROPIO de la agenda.
 * Acepta cualquier subconjunto: title, date, startTime, durationMin, type, status,
 * contactId, clientName, phone, petName, address, notes.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "PROVIDER");
  if (auth instanceof NextResponse) return auth;

  const provider = await getProviderOf(auth.id);
  if (!provider) return jsonError("Perfil de prestador no encontrado", 404);

  const { id } = await params;
  const event = await db.calendarEvent.findUnique({ where: { id } });
  if (!event || event.providerId !== provider.id) return jsonError("Evento no encontrado", 404);

  const body = await readJson<Record<string, unknown>>(req, 8192);
  if (!body) return jsonError("Solicitud inválida", 400);

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const title = cleanText(body.title, 120);
    if (title.length < 2) return jsonError("El título debe tener al menos 2 caracteres", 400);
    data.title = title;
  }
  if (body.date !== undefined) {
    const date = cleanText(body.date, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonError("Fecha inválida (usa YYYY-MM-DD)", 400);
    data.date = date;
  }
  if (body.startTime !== undefined) {
    const startTime = body.startTime ? cleanText(body.startTime, 5) : null;
    if (startTime && !TIME_RE.test(startTime)) return jsonError("startTime inválido (usa HH:MM)", 400);
    data.startTime = startTime;
  }
  if (body.durationMin !== undefined) {
    if (body.durationMin === null || body.durationMin === "") {
      data.durationMin = null;
    } else {
      const d = Number(body.durationMin);
      if (!Number.isInteger(d) || d < 5 || d > 720) return jsonError("durationMin debe ser un entero entre 5 y 720", 400);
      data.durationMin = d;
    }
  }
  if (body.type !== undefined) {
    const type = cleanText(body.type, 14).toUpperCase();
    if (!EVENT_TYPES.includes(type)) return jsonError(`Type debe ser: ${EVENT_TYPES.join(", ")}`, 400);
    data.type = type;
  }
  if (body.status !== undefined) {
    const status = cleanText(body.status, 12).toUpperCase();
    if (!EVENT_STATUSES.includes(status)) return jsonError(`Status debe ser: ${EVENT_STATUSES.join(", ")}`, 400);
    data.status = status;
  }
  if (body.contactId !== undefined) {
    if (!body.contactId) {
      data.contactId = null;
    } else {
      const cid = cleanText(body.contactId, 40);
      const contact = await db.crmContact.findUnique({ where: { id: cid } });
      if (!contact || contact.providerId !== provider.id) return jsonError("Contacto no encontrado", 404);
      data.contactId = cid;
    }
  }
  if (body.clientName !== undefined) data.clientName = body.clientName ? cleanText(body.clientName, 80) : null;
  if (body.phone !== undefined) data.phone = body.phone ? cleanText(body.phone, 24) : null;
  if (body.petName !== undefined) data.petName = body.petName ? cleanText(body.petName, 40) : null;
  if (body.address !== undefined) data.address = body.address ? cleanText(body.address, 300) : null;
  if (body.notes !== undefined) data.notes = body.notes ? cleanText(body.notes, 500) : null;

  const updated = await db.calendarEvent.update({ where: { id }, data });
  return NextResponse.json({ event: updated });
}

/** DELETE /api/calendar/events/[id] — elimina un evento PROPIO */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "PROVIDER");
  if (auth instanceof NextResponse) return auth;

  const provider = await getProviderOf(auth.id);
  if (!provider) return jsonError("Perfil de prestador no encontrado", 404);

  const { id } = await params;
  const event = await db.calendarEvent.findUnique({ where: { id } });
  if (!event || event.providerId !== provider.id) return jsonError("Evento no encontrado", 404);

  await db.calendarEvent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
