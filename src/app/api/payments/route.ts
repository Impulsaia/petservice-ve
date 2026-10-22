import { NextResponse, after } from "next/server";
import { db, flushDb } from "@/lib/db";
import { notify, getSettings } from "@/lib/petservice/server";
import { requireUser, sameOriginOrError, readJson, cleanText } from "@/lib/petservice/auth";

/**
 * POST /api/payments — registra el pago de una reserva propia
 * Body: { bookingId, method, reference? }
 * EFECTIVO → verificación inmediata + reserva CONFIRMADA.
 * Otros métodos → queda PENDIENTE para conciliación del admin.
 * Anti-IDOR: solo el cliente dueño de la reserva puede registrar el pago.
 */
export async function POST(req: Request) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "CLIENT") return NextResponse.json({ error: "Solo los clientes pueden registrar pagos" }, { status: 403 });

  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });

  const bookingId = cleanText(body.bookingId, 40);
  const method = cleanText(body.method, 20);
  const reference = body?.reference ? cleanText(body.reference, 40) : null;

  if (!bookingId || !method) return NextResponse.json({ error: "bookingId y method requeridos" }, { status: 400 });
  if (!["PAGO_MOVIL", "TRANSFERENCIA", "ZELLE", "BINANCE", "EFECTIVO"].includes(method)) {
    return NextResponse.json({ error: "Método de pago inválido" }, { status: 400 });
  }

  const needsRef = ["PAGO_MOVIL", "TRANSFERENCIA", "ZELLE", "BINANCE"].includes(method);
  if (needsRef && !reference) {
    return NextResponse.json({ error: "Debes ingresar la referencia o comprobante del pago" }, { status: 400 });
  }

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      service: { select: { name: true } },
      pet: { select: { name: true } },
      provider: { select: { businessName: true } },
    },
  });
  if (!booking) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  // Anti-IDOR
  if (booking.clientId !== auth.id) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  if (booking.status !== "PENDIENTE_PAGO") {
    return NextResponse.json({ error: "Esta reserva ya no admite pagos" }, { status: 400 });
  }

  const settings = await getSettings();
  const isCash = method === "EFECTIVO";
  const status = isCash ? "VERIFICADO" : "PENDIENTE";

  const payment = await db.payment.upsert({
    where: { bookingId },
    create: { bookingId, method, amountUsd: booking.priceUsd, amountBs: booking.priceBs, reference, status, reconciledBy: isCash ? "AUTO-EFECTIVO" : null },
    update: { method, reference, status, reconciledBy: isCash ? "AUTO-EFECTIVO" : null },
  });

  if (isCash) {
    await db.booking.update({ where: { id: bookingId }, data: { status: "CONFIRMADA" } });
    await notify(
      auth.id,
      "PAGO_VERIFICADO",
      `💵 PetService VE: Reserva ${booking.code} confirmada con pago en efectivo (${booking.service.name} de ${booking.pet.name}). ${booking.provider.businessName} cobrará al finalizar.`
    );
  } else {
    await notify(
      auth.id,
      "PAGO_EN_REVISION",
      `🧾 PetService VE: Recibimos tu pago por ${method === "PAGO_MOVIL" ? "Pago Móvil" : method} para ${booking.code} (Bs. ${booking.priceBs.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}). Te confirmamos en breve tras la verificación.`
    );
  }

  return NextResponse.json({ payment, bookingStatus: isCash ? "CONFIRMADA" : "PENDIENTE_PAGO", rate: settings.usdToBs }, { status: 201 });
}
