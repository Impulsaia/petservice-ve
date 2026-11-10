import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/petservice/auth";

/**
 * GET /api/admin/metrics — KPIs del marketplace
 * GMV, reservas, conversión, comisiones, serie 7 días (FREE vs gestionadas),
 * top prestadores.
 *
 * Clasificación de cada reserva:
 *  - FREE (prereserva directa): pago con reconciledBy "AUTO-PRERESERVA" — el
 *    dinero se acordó directo entre dueño y prestador (prestador sin convenio).
 *  - GESTIONADA: entra por las cuentas de PetService VE (convenio de comisión
 *    o suscripción) — el admin la concilia.
 */
export async function GET(req: Request) {
  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;
  const [paymentsVerified, bookings, providers, allPayments] = await Promise.all([
    db.payment.findMany({ where: { status: "VERIFICADO" }, include: { booking: { select: { status: true, commissionUsd: true, providerId: true } } } }),
    db.booking.findMany({
      select: { status: true, scheduledAt: true, commissionUsd: true, priceUsd: true, providerId: true, createdAt: true, payment: { select: { reconciledBy: true, status: true } } },
    }),
    db.provider.findMany({ select: { id: true, businessName: true, ratingAvg: true, ratingCount: true, zoneName: true } }),
    db.payment.findMany({ select: { status: true } }),
  ]);

  const activePayments = paymentsVerified.filter((p) => p.booking.status !== "CANCELADA");
  const gmv = activePayments.reduce((a, p) => a + p.amountUsd, 0);
  const commissionRevenue = activePayments.reduce((a, p) => a + p.booking.commissionUsd, 0);

  const byStatus: Record<string, number> = {};
  for (const b of bookings) byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;

  const pendingPayments = allPayments.filter((p) => p.status === "PENDIENTE").length;
  const totalBookings = bookings.length;
  const confirmed = (byStatus["CONFIRMADA"] ?? 0) + (byStatus["EN_CURSO"] ?? 0) + (byStatus["COMPLETADA"] ?? 0);
  const conversion = totalBookings ? (confirmed / totalBookings) * 100 : 0;

  /** ¿Es prereserva directa FREE? (pago auto-registrado, sin dinero de la plataforma) */
  const isFree = (b: { payment: { reconciledBy: string | null; status: string } | null }) =>
    b.payment?.reconciledBy === "AUTO-PRERESERVA";

  // Totales por canal (todas las reservas, incluidas canceladas → se excluyen del GMV)
  let freeBookings = 0;
  let managedBookings = 0;
  let freeGmvUsd = 0; // volumen coordinado directo (reservas FREE no canceladas)
  for (const b of bookings) {
    if (isFree(b)) {
      freeBookings++;
      if (b.status !== "CANCELADA") freeGmvUsd += b.priceUsd;
    } else {
      managedBookings++;
    }
  }

  // Serie últimos 7 días (reservas creadas, FREE vs gestionadas)
  const days: { date: string; label: string; count: number; free: number; managed: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const label = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][d.getUTCDay()];
    const delDia = bookings.filter((b) => b.createdAt.toISOString().slice(0, 10) === dateStr);
    const free = delDia.filter(isFree).length;
    days.push({ date: dateStr, label, count: delDia.length, free, managed: delDia.length - free });
  }

  // Top prestadores por GMV de pagos verificados
  const gmvByProvider: Record<string, number> = {};
  for (const p of activePayments) {
    gmvByProvider[p.booking.providerId] = (gmvByProvider[p.booking.providerId] ?? 0) + p.amountUsd;
  }
  const topProviders = providers
    .map((pr) => ({ ...pr, gmv: Math.round((gmvByProvider[pr.id] ?? 0) * 100) / 100 }))
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, 5);

  return NextResponse.json({
    gmv: Math.round(gmv * 100) / 100,
    commissionRevenue: Math.round(commissionRevenue * 100) / 100,
    totalBookings,
    byStatus,
    pendingPayments,
    conversion: Math.round(conversion * 10) / 10,
    activeProviders: providers.filter((p) => p.ratingCount > 0).length,
    days,
    topProviders,
    // Canal FREE vs gestionado (estadísticas de monetización)
    freeBookings,
    managedBookings,
    freeGmvUsd: Math.round(freeGmvUsd * 100) / 100,
  });
}
