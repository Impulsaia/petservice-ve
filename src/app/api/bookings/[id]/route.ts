import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notify, getSettings } from "@/lib/petservice/server";
import { requireUser, sameOriginOrError, readJson, cleanText } from "@/lib/petservice/auth";

/**
 * PATCH /api/bookings/[id] — transiciones de estado con control de roles
 * - cancel    → cliente dueño o prestador de la reserva
 * - start     → solo el prestador dueño
 * - complete  → solo el prestador dueño
 * Anti-IDOR: se verifica la propiedad antes de cada mutación.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await readJson<Record<string, unknown>>(req, 4096);
  if (!body) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  const action = cleanText(body.action, 20);

  const booking = await db.booking.findUnique({
    where: { id },
    include: {
      service: { select: { name: true } },
      pet: { select: { name: true } },
      provider: { select: { businessName: true, userId: true, id: true } },
      client: { select: { id: true, name: true } },
      payment: true,
    },
  });
  if (!booking) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });

  // Ownership: cliente dueño o prestador dueño (404 al no ser dueño: no filtra existencia)
  const isOwnerClient = booking.clientId === auth.id;
  const isOwnerProvider = booking.provider.userId === auth.id;
  if (!isOwnerClient && !isOwnerProvider) {
    return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  }

  const label = `${booking.service.name} de ${booking.pet.name}`;

  if (action === "cancel") {
    if (["COMPLETADA", "CANCELADA"].includes(booking.status)) {
      return NextResponse.json({ error: "No se puede cancelar una reserva completada o ya cancelada" }, { status: 400 });
    }
    await db.booking.update({ where: { id }, data: { status: "CANCELADA" } });
    await notify(
      booking.clientId,
      "RESERVA_CANCELADA",
      `❌ PetService VE: Tu reserva ${booking.code} (${label}) fue cancelada. Política: con más de 24h de anticipación = reembolso total; menos de 24h = 50%.`
    );
    return NextResponse.json({ ok: true, status: "CANCELADA" });
  }

  if (action === "start") {
    if (!isOwnerProvider) return NextResponse.json({ error: "Solo el prestador puede iniciar el servicio" }, { status: 403 });
    if (booking.status !== "CONFIRMADA") {
      return NextResponse.json({ error: "Solo se pueden iniciar reservas confirmadas" }, { status: 400 });
    }
    await db.booking.update({ where: { id }, data: { status: "EN_CURSO" } });
    await notify(
      booking.clientId,
      "ESTADO_PEDIDO",
      `🏃 PetService VE: ${booking.provider.businessName} inició el servicio (${label}). ¡Te avisamos al finalizar!`
    );
    return NextResponse.json({ ok: true, status: "EN_CURSO" });
  }

  if (action === "complete") {
    if (!isOwnerProvider) return NextResponse.json({ error: "Solo el prestador puede completar el servicio" }, { status: 403 });
    if (booking.status !== "EN_CURSO" && booking.status !== "CONFIRMADA") {
      return NextResponse.json({ error: "La reserva no está en curso" }, { status: 400 });
    }
    await db.booking.update({
      where: { id },
      data: {
        status: "COMPLETADA",
        evidenceNote: body?.evidence ? cleanText(body.evidence, 300) : booking.evidenceNote,
      },
    });
    // Efectivo: el prestador confirma la recepción → pago verificado automáticamente
    if (booking.payment && booking.payment.method === "EFECTIVO" && booking.payment.status === "PENDIENTE") {
      await db.payment.update({ where: { id: booking.payment.id }, data: { status: "VERIFICADO", reconciledBy: "AUTO-EFECTIVO" } });
    }
    await notify(
      booking.clientId,
      "ESTADO_PEDIDO",
      `✅ PetService VE: ¡${label} completado! Gracias por confiar en ${booking.provider.businessName}. Deja tu reseña ⭐ y ayuda a la comunidad.`
    );
    const settings = await getSettings();
    return NextResponse.json({ ok: true, status: "COMPLETADA", commissionPct: settings.commissionPct });
  }

  return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
}
