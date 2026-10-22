import { NextResponse, after } from "next/server";
import { db, flushDb } from "@/lib/db";
import { notify } from "@/lib/petservice/server";
import { requireRole, sameOriginOrError, readJson, cleanText } from "@/lib/petservice/auth";

/**
 * POST /api/payments/[id]/reconcile — conciliación manual (SOLO ADMIN)
 * Body: { action: "verify" | "reject" }
 * verify → pago VERIFICADO + reserva CONFIRMADA (libera el flujo de escrow lógico)
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await readJson<Record<string, unknown>>(req, 4096);
  const action = cleanText(body?.action, 20);

  const payment = await db.payment.findUnique({
    where: { id },
    include: {
      booking: {
        include: {
          service: { select: { name: true } },
          pet: { select: { name: true } },
          client: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!payment) return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });

  if (action === "verify") {
    if (payment.status === "VERIFICADO") return NextResponse.json({ error: "Pago ya verificado" }, { status: 400 });
    await db.payment.update({ where: { id }, data: { status: "VERIFICADO", reconciledBy: auth.email } });
    if (payment.booking.status === "PENDIENTE_PAGO") {
      await db.booking.update({ where: { id: payment.bookingId }, data: { status: "CONFIRMADA" } });
    }
    await notify(
      payment.booking.clientId,
      "PAGO_VERIFICADO",
      `✅ PetService VE: ¡Pago verificado! Tu reserva ${payment.booking.code} (${payment.booking.service.name} de ${payment.booking.pet.name}) está CONFIRMADA. Monto: Bs. ${payment.amountBs.toFixed(2)} / $${payment.amountUsd.toFixed(2)}.`
    );
    return NextResponse.json({ ok: true, status: "VERIFICADO" });
  }

  if (action === "reject") {
    await db.payment.update({ where: { id }, data: { status: "RECHAZADO", reconciledBy: auth.email } });
    await notify(
      payment.booking.clientId,
      "PAGO_RECHAZADO",
      `⚠️ PetService VE: No pudimos verificar el pago de ${payment.booking.code}. Revisa la referencia e intenta de nuevo o escribe a soporte.`
    );
    return NextResponse.json({ ok: true, status: "RECHAZADO" });
  }

  return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
}
