import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, jsonError, cleanText } from "@/lib/petservice/auth";
import { getProviderOf } from "@/lib/petservice/server";

/**
 * GET /api/provider/bookings — reservas del negocio del prestador autenticado
 * con filtros opcionales. Anti-IDOR: el scope SIEMPRE lo fija la sesión.
 *
 * Query: ?status=CONFIRMADA&from=2025-01-01&to=2025-02-01&q=texto&serviceId=…
 *   - from/to → filtran scheduledAt (YYYY-MM-DD, inclusive)
 *   - q → busca en code, dirección, nombre del cliente o mascota
 * Respuesta: { bookings: [...con client/service/pet/payment/review], total }
 */
export async function GET(req: Request) {
  const auth = await requireRole(req, "PROVIDER");
  if (auth instanceof NextResponse) return auth;

  const provider = await getProviderOf(auth.id);
  if (!provider) return jsonError("Perfil de prestador no encontrado", 404);

  const { searchParams } = new URL(req.url);
  const status = cleanText(searchParams.get("status"), 20).toUpperCase();
  const from = cleanText(searchParams.get("from"), 10);
  const to = cleanText(searchParams.get("to"), 10);
  const q = cleanText(searchParams.get("q"), 60);
  const serviceId = cleanText(searchParams.get("serviceId"), 40);

  const where: Record<string, unknown> = { providerId: provider.id };
  const BOOKING_STATUSES = ["PENDIENTE_PAGO", "CONFIRMADA", "EN_CURSO", "COMPLETADA", "CANCELADA"];
  if (status && BOOKING_STATUSES.includes(status)) where.status = status;
  if (serviceId) where.serviceId = serviceId;

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
    ];
  }

  const bookings = await db.booking.findMany({
    where,
    include: {
      client: { select: { id: true, name: true, phone: true } },
      service: { select: { id: true, name: true, category: true, durationMin: true } },
      pet: { select: { id: true, name: true, species: true, breed: true, size: true } },
      payment: true,
      review: { select: { id: true, rating: true, comment: true } },
    },
    orderBy: { scheduledAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ bookings, total: bookings.length });
}
