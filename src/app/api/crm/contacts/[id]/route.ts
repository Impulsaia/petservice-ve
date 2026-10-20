import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, sameOriginOrError, readJson, jsonError, cleanText } from "@/lib/petservice/auth";
import { getProviderOf } from "@/lib/petservice/server";

const CONTACT_STATUSES = ["NUEVO", "ACTIVO", "VIP", "INACTIVO"];
const CONTACT_SOURCES = ["MANUAL", "RESERVA"];

/**
 * GET /api/crm/contacts/[id] — detalle de un contacto PROPIO (anti-IDOR),
 * con historial de reservas (match por userId o teléfono del cliente) y
 * eventos de calendario enlazados.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, "PROVIDER");
  if (auth instanceof NextResponse) return auth;

  const provider = await getProviderOf(auth.id);
  if (!provider) return jsonError("Perfil de prestador no encontrado", 404);

  const { id } = await params;
  const contact = await db.crmContact.findUnique({ where: { id } });
  if (!contact || contact.providerId !== provider.id) return jsonError("Contacto no encontrado", 404);

  // Historial: reservas del usuario vinculado O reservas con ese teléfono de cliente
  const bookings = await db.booking.findMany({
    where: {
      providerId: provider.id,
      OR: [
        ...(contact.userId ? [{ clientId: contact.userId }] : []),
        ...(contact.phone ? [{ client: { is: { phone: contact.phone } } }] : []),
      ],
    },
    include: {
      service: { select: { name: true, category: true } },
      pet: { select: { name: true, species: true } },
      client: { select: { name: true, phone: true } },
    },
    orderBy: { scheduledAt: "desc" },
    take: 100,
  });

  const events = await db.calendarEvent.findMany({
    where: { providerId: provider.id, contactId: contact.id },
    orderBy: { date: "desc" },
    take: 100,
  });

  return NextResponse.json({ contact, historial: { bookings, events } });
}

/**
 * PATCH /api/crm/contacts/[id] — edita un contacto PROPIO.
 * Campos: name, phone, email, petName, petType, status, notes, source.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "PROVIDER");
  if (auth instanceof NextResponse) return auth;

  const provider = await getProviderOf(auth.id);
  if (!provider) return jsonError("Perfil de prestador no encontrado", 404);

  const { id } = await params;
  const contact = await db.crmContact.findUnique({ where: { id } });
  if (!contact || contact.providerId !== provider.id) return jsonError("Contacto no encontrado", 404);

  const body = await readJson<Record<string, unknown>>(req, 8192);
  if (!body) return jsonError("Solicitud inválida", 400);

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) {
    const name = cleanText(body.name, 80);
    if (name.length < 2) return jsonError("El nombre debe tener al menos 2 caracteres", 400);
    data.name = name;
  }
  if (body.phone !== undefined) {
    const phone = body.phone ? cleanText(body.phone, 24) : null;
    if (phone && !/^[+0-9 ()-]{7,24}$/.test(phone)) return jsonError("Teléfono inválido", 400);
    data.phone = phone;
  }
  if (body.email !== undefined) data.email = body.email ? cleanText(body.email, 254) : null;
  if (body.petName !== undefined) data.petName = body.petName ? cleanText(body.petName, 40) : null;
  if (body.petType !== undefined) data.petType = body.petType ? cleanText(body.petType, 20) : null;
  if (body.notes !== undefined) data.notes = body.notes ? cleanText(body.notes, 500) : null;
  if (body.status !== undefined) {
    const status = cleanText(body.status, 12).toUpperCase();
    if (!CONTACT_STATUSES.includes(status)) return jsonError(`Status debe ser: ${CONTACT_STATUSES.join(", ")}`, 400);
    data.status = status;
  }
  if (body.source !== undefined) {
    const source = cleanText(body.source, 10).toUpperCase();
    if (!CONTACT_SOURCES.includes(source)) return jsonError("Source debe ser MANUAL o RESERVA", 400);
    data.source = source;
  }

  const updated = await db.crmContact.update({ where: { id }, data });
  return NextResponse.json({ contact: updated });
}

/** DELETE /api/crm/contacts/[id] — elimina un contacto PROPIO (los eventos quedan con contactId suelto → se limpia) */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "PROVIDER");
  if (auth instanceof NextResponse) return auth;

  const provider = await getProviderOf(auth.id);
  if (!provider) return jsonError("Perfil de prestador no encontrado", 404);

  const { id } = await params;
  const contact = await db.crmContact.findUnique({ where: { id } });
  if (!contact || contact.providerId !== provider.id) return jsonError("Contacto no encontrado", 404);

  await db.$transaction([
    db.calendarEvent.updateMany({ where: { contactId: id }, data: { contactId: null } }),
    db.crmContact.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
}
