import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, cleanText } from "@/lib/petservice/auth";

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
