import { NextResponse, after } from "next/server";
import { db, flushDb } from "@/lib/db";
import { requireRole, cleanText, sameOriginOrError, readJson } from "@/lib/petservice/auth";
import { notify } from "@/lib/petservice/server";

const BOOKING_STATUSES = ["PENDIENTE_PAGO", "CONFIRMADA", "EN_CURSO", "COMPLETADA", "CANCELADA"];
const CATEGORIES = ["GROOMING", "DELIVERY", "PET_SITTING", "DOG_WALKING", "TRAINING", "PET_TAXI", "SPA_MOVIL", "VET"];

/**
 * GET /api/admin/bookings — todas las reservas del marketplace con filtros
 * y resumen de agregados. Solo ADMIN.
 *
 * Query: ?city=Puerto%20Ordaz&category=GROOMING&status=CONFIRMADA&providerId=…
 *        &from=2025-01-01&to=2025-01-31&q=texto&sort=date_desc|date_asc|price_desc
 * Respuesta: {
 *   bookings: [...con client/provider/service/pet/payment],
 *   summary: { total, porEstado: {…}, ingresosCompletadas, gmv }
 * }
 */
export async function GET(req: Request) {
  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const city = cleanText(searchParams.get("city"), 60);
  const category = cleanText(searchParams.get("category"), 20).toUpperCase();
  const status = cleanText(searchParams.get("status"), 20).toUpperCase();
  const providerId = cleanText(searchParams.get("providerId"), 40);
  const from = cleanText(searchParams.get("from"), 10);
  const to = cleanText(searchParams.get("to"), 10);
  const q = cleanText(searchParams.get("q"), 60);
  const sort = cleanText(searchParams.get("sort"), 12) || "date_desc";

  const where: Record<string, unknown> = {};
  if (city) where.provider = { is: { city } };
  if (CATEGORIES.includes(category)) where.service = { is: { category } };
  if (BOOKING_STATUSES.includes(status)) where.status = status;
  if (providerId) where.providerId = providerId;
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) || /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    where.scheduledAt = {
      ...(from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
      ...(to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
    };
  }
  if (q) {
    where.OR = [
      { code: { contains: q } },
      { address: { contains: q } },
      { client: { is: { name: { contains: q } } } },
      { pet: { is: { name: { contains: q } } } },
      { provider: { is: { businessName: { contains: q } } } },
    ];
  }

  const orderBy =
    sort === "date_asc" ? { scheduledAt: "asc" as const }
    : sort === "price_desc" ? { priceUsd: "desc" as const }
    : { scheduledAt: "desc" as const };

  const bookings = await db.booking.findMany({
    where,
    include: {
      client: { select: { id: true, name: true, phone: true } },
      provider: { select: { id: true, businessName: true, city: true, zoneName: true } },
      service: { select: { id: true, name: true, category: true } },
      pet: { select: { id: true, name: true, species: true } },
      payment: { select: { id: true, method: true, status: true, reference: true } },
    },
    orderBy,
    take: 300,
  });

  // Resumen sobre el MISMO filtro (agregado en JS: dataset demo pequeño)
  const porEstado: Record<string, number> = {};
  for (const s of BOOKING_STATUSES) porEstado[s] = 0;
  let ingresosCompletadas = 0;
  let gmv = 0; // todo lo no cancelado
  for (const b of bookings) {
    porEstado[b.status] = (porEstado[b.status] ?? 0) + 1;
    if (b.status === "COMPLETADA") ingresosCompletadas += b.priceUsd;
    if (b.status !== "CANCELADA") gmv += b.priceUsd;
  }

  return NextResponse.json({
    bookings,
    summary: {
      total: bookings.length,
      porEstado,
      ingresosCompletadas: Math.round(ingresosCompletadas * 100) / 100,
      gmv: Math.round(gmv * 100) / 100,
    },
  });
}

/**
 * POST /api/admin/bookings — acción administrativa sobre una reserva (SOLO ADMIN)
 * Body: { id, action: "confirm" | "cancel" }
 *
 * - confirm → el admin da por recibido el pago (p. ej. el cliente pagó directo
 *   y no registró comprobante, o el prestador avisó por WhatsApp): crea/verifica
 *   el Payment (reconciledBy = email del admin) y la reserva pasa a CONFIRMADA.
 *   Notifica al cliente Y al prestador.
 * - cancel → cancela la reserva (PENDIENTE_PAGO / CONFIRMADA) notificando a ambas
 *   partes.
 *
 * Esto cierra el hueco de conciliación: las reservas PENDIENTE_PAGO que nunca
 * registraron comprobante no aparecían en la cola de pagos y el admin no podía
 * hacer nada con ellas.
 */
export async function POST(req: Request) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  const body = await readJson<Record<string, unknown>>(req, 4096);
  if (!body) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });

  const id = cleanText(body.id, 40);
  const action = cleanText(body.action, 20);
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const booking = await db.booking.findUnique({
    where: { id },
    include: {
      service: { select: { name: true } },
      pet: { select: { name: true } },
      client: { select: { id: true, name: true } },
      provider: { select: { userId: true, businessName: true } },
      payment: true,
    },
  });
  if (!booking) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });

  const label = `${booking.service.name} de ${booking.pet.name}`;

  if (action === "confirm") {
    if (booking.status !== "PENDIENTE_PAGO") {
      return NextResponse.json({ error: "Solo se confirman reservas pendientes de pago" }, { status: 400 });
    }
    // Payment: si ya existía (p. ej. rechazado antes), se verifica; si no, se crea
    if (booking.payment) {
      await db.payment.update({
        where: { id: booking.payment.id },
        data: { status: "VERIFICADO", reconciledBy: auth.email },
      });
    } else {
      await db.payment.create({
        data: {
          bookingId: booking.id,
          method: "PAGO_MOVIL",
          amountUsd: booking.priceUsd,
          amountBs: booking.priceBs,
          reference: "CONFIRMADO-POR-ADMIN",
          status: "VERIFICADO",
          reconciledBy: auth.email,
        },
      });
    }
    await db.booking.update({ where: { id }, data: { status: "CONFIRMADA" } });
    await notify(
      booking.clientId,
      "PAGO_VERIFICADO",
      `✅ PetService VE: ¡Pago verificado! Tu reserva ${booking.code} (${label}) está CONFIRMADA. Monto: $${booking.priceUsd.toFixed(2)}.`
    );
    await notify(
      booking.provider.userId,
      "PAGO_VERIFICADO_PRESTADOR",
      `💰 PetService VE: El pago de ${booking.code} (${label}) fue verificado por el equipo. ${booking.client.name} ya está confirmado para la cita. Monto: $${booking.priceUsd.toFixed(2)}.`
    );
    return NextResponse.json({ ok: true, status: "CONFIRMADA" });
  }

  if (action === "cancel") {
    if (["COMPLETADA", "CANCELADA"].includes(booking.status)) {
      return NextResponse.json({ error: "La reserva ya está completada o cancelada" }, { status: 400 });
    }
    await db.booking.update({ where: { id }, data: { status: "CANCELADA" } });
    await notify(
      booking.clientId,
      "RESERVA_CANCELADA",
      `❌ PetService VE: Tu reserva ${booking.code} (${label}) fue cancelada por el equipo de soporte. Si crees que es un error, escríbenos.`
    );
    await notify(
      booking.provider.userId,
      "RESERVA_CANCELADA",
      `❌ PetService VE: La reserva ${booking.code} (${label}) fue cancelada por el equipo de soporte.`
    );
    return NextResponse.json({ ok: true, status: "CANCELADA" });
  }

  return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
}
