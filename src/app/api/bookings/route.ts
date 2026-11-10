import { NextResponse, after } from "next/server";
import { db, flushDb } from "@/lib/db";
import { getSettings, createBookingWithCode, notify, money, upsertCrmFromBooking } from "@/lib/petservice/server";
import { requireUser, sameOriginOrError, readJson, cleanText, jsonError } from "@/lib/petservice/auth";
import { usesPlatformPayments } from "@/lib/petservice/monetization";
import { PAYMENT_METHODS } from "@/lib/petservice/constants";

/**
 * GET /api/bookings — reservas del usuario autenticado.
 * - CLIENT → sus reservas como cliente
 * - PROVIDER → reservas de su negocio (solo lo que él gestiona)
 * La identidad SIEMPRE viene de la cookie de sesión (anti-IDOR).
 */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.role === "PROVIDER") {
    const provider = await db.provider.findUnique({ where: { userId: auth.id } });
    if (!provider) return NextResponse.json({ error: "Perfil de prestador no encontrado" }, { status: 404 });

    const bookings = await db.booking.findMany({
      where: { providerId: provider.id },
      include: {
        client: { select: { name: true, phone: true } },
        service: { select: { name: true, category: true, durationMin: true } },
        pet: { select: { name: true, species: true, breed: true, size: true, notes: true, medicalNotes: true, photoUrl: true } },
        payment: true,
        review: true,
      },
      orderBy: { scheduledAt: "desc" },
    });
    return NextResponse.json({ bookings, provider });
  }

  if (auth.role === "ADMIN") {
    return NextResponse.json({ error: "El administrador no tiene reservas propias. Usa el panel admin." }, { status: 400 });
  }

  const bookings = await db.booking.findMany({
    where: { clientId: auth.id },
    include: {
      provider: { select: { id: true, businessName: true, zoneName: true, city: true, badges: true, ratingAvg: true, avatarUrl: true, suspensionNote: true, plan: true, planExpiresAt: true, adsBoostUntil: true, commissionAcceptedAt: true, commissionTermsVersion: true, user: { select: { phone: true } } } },
      service: { select: { name: true, category: true, durationMin: true } },
      pet: { select: { name: true, species: true, breed: true, size: true } },
      payment: true,
      review: { select: { id: true, rating: true } },
    },
    orderBy: { scheduledAt: "desc" },
  });
  return NextResponse.json({ bookings });
}

/**
 * POST /api/bookings — crea una reserva para el cliente autenticado
 * Body: { providerId, serviceId, petId, address, date, time, extras: string[] }
 * Validaciones: mascota propiedad del cliente (anti-IDOR), servicio activo,
 * compatibilidad especie/tamaño, coberturas y longitud de campos.
 */
export async function POST(req: Request) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "CLIENT") return NextResponse.json({ error: "Solo los clientes pueden crear reservas" }, { status: 403 });

  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });

  const providerId = cleanText(body.providerId, 40);
  const serviceId = cleanText(body.serviceId, 40);
  const petId = cleanText(body.petId, 40);
  const address = cleanText(body.address, 300);
  const date = cleanText(body.date, 10);
  const time = cleanText(body.time, 5);
  const extras: string[] = Array.isArray(body.extras) ? body.extras.map(String).slice(0, 10) : [];
  // Prereserva directa (prestadores FREE/sin convenio): tipo de pago informativo
  const requestedMethod = body?.paymentMethod ? cleanText(body.paymentMethod, 20).toUpperCase() : null;

  if (!providerId || !serviceId || !petId || !address || !date || !time) {
    return NextResponse.json({ error: "Faltan datos de la reserva" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: "Fecha u hora inválida" }, { status: 400 });
  }

  const pet = await db.pet.findUnique({ where: { id: petId } });
  if (!pet) return NextResponse.json({ error: "Mascota no encontrada" }, { status: 404 });
  // Anti-IDOR: la mascota debe pertenecer al cliente autenticado
  if (pet.ownerId !== auth.id) return NextResponse.json({ error: "No puedes reservar para una mascota ajena" }, { status: 403 });

  const service = await db.service.findUnique({ where: { id: serviceId } });
  if (!service || !service.active) return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 });
  if (service.providerId !== providerId) return NextResponse.json({ error: "El servicio no pertenece a ese prestador" }, { status: 400 });

  const provider = await db.provider.findUnique({ where: { id: providerId } });
  if (!provider) return NextResponse.json({ error: "Prestador no encontrado" }, { status: 404 });
  if (provider.status !== "VERIFIED") return NextResponse.json({ error: "Este prestador aún no está verificado" }, { status: 400 });

  // ── Flujo de cobro ────────────────────────────────────────────────────────
  // • Gestionado (convenio de comisión o suscripción): el pago entra por las
  //   cuentas de PetService VE y el admin lo concilia (status PENDIENTE_PAGO).
  // • FREE / sin convenio: PRERESERVA DIRECTA — el cliente solo indica el TIPO
  //   de pago (sin datos de depósito de la plataforma), la reserva queda
  //   CONFIRMADA de una vez y el dinero se acuerda directo por WhatsApp.
  //   El admin de PetService VE NO interviene porque no hay dinero suyo.
  const platformManaged = usesPlatformPayments(provider);
  const directPrereserva = !platformManaged;
  let payMethod = "EFECTIVO";
  if (directPrereserva) {
    if (requestedMethod) {
      if (!PAYMENT_METHODS.some((m) => m.key === requestedMethod)) {
        return jsonError("Método de pago inválido", 400);
      }
      payMethod = requestedMethod;
    }
  }

  // Validación de compatibilidad mascota ↔ servicio
  if (!service.petTypes.split(",").includes(pet.species)) {
    return NextResponse.json({ error: `Este servicio no acepta ${pet.species.toLowerCase()}s` }, { status: 400 });
  }
  if (!service.petSizes.split(",").includes(pet.size)) {
    return NextResponse.json({ error: `Este servicio no está disponible para mascotas tamaño ${pet.size}` }, { status: 400 });
  }

  // Precio con extras (solo los extras reales del servicio, nunca del cliente)
  const extrasData = JSON.parse(service.extrasJson || "[]") as { name: string; usd: number }[];
  const extrasSelected = extrasData.filter((e) => extras.includes(e.name));
  const priceUsd = service.priceUsd + extrasSelected.reduce((a, e) => a + e.usd, 0);

  const settings = await getSettings();
  const { priceUsd: usd, priceBs } = money(priceUsd, settings.usdToBs);
  const commissionUsd = Math.round(usd * (settings.commissionPct / 100) * 100) / 100;

  const booking = await createBookingWithCode({
      clientId: auth.id,
      providerId,
      serviceId,
      petId,
      address,
      scheduledAt: new Date(`${date}T${time}:00.000Z`),
      status: directPrereserva ? "CONFIRMADA" : "PENDIENTE_PAGO",
      priceUsd: usd,
      priceBs,
      commissionUsd: directPrereserva ? 0 : commissionUsd,
      extrasJson: JSON.stringify(extrasSelected),
      notes: body?.notes ? cleanText(body.notes, 300) : null,
  });

  // Prereserva directa: registra el TIPO de pago acordado como ya tratado entre
  // las partes (VERIFICADO + AUTO-PRERESERVA: jamás entra a la cola del admin).
  if (directPrereserva) {
    await db.payment.upsert({
      where: { bookingId: booking.id },
      create: {
        bookingId: booking.id,
        method: payMethod,
        amountUsd: usd,
        amountBs: priceBs,
        reference: null,
        status: "VERIFICADO",
        reconciledBy: "AUTO-PRERESERVA",
      },
      update: { method: payMethod, reference: null, status: "VERIFICADO", reconciledBy: "AUTO-PRERESERVA" },
    });
  }

  // Auto-hook CRM: la reserva registra/actualiza al contacto del prestador
  // (source RESERVA, totalVisits+1, gasto acumulado, status ACTIVO/VIP)
  await upsertCrmFromBooking({
    providerId,
    userId: auth.id,
    name: auth.name,
    phone: auth.phone,
    email: auth.email,
    petName: pet.name,
    petType: pet.species,
    priceUsd: usd,
  });

  // Notificaciones WhatsApp simuladas: confirmación de solicitud + recordatorio programado
  // Fecha legible (mié 21 oct) — mediodía UTC evita corrimientos de zona
  const fechaLinda = new Date(`${date}T12:00:00.000Z`).toLocaleDateString("es-VE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const methodLabel = PAYMENT_METHODS.find((m) => m.key === payMethod)?.label ?? payMethod;

  if (directPrereserva) {
    await notify(
      auth.id,
      "CONFIRMACION_RESERVA",
      `🐾 PetService VE: ¡Hola ${auth.name.split(" ")[0]}! Tu prereserva ${booking.code} (${service.name} para ${pet.name}) quedó registrada con ${provider.businessName} para el ${fechaLinda} a las ${time}. Pago acordado: ${methodLabel} — directo con el prestador, sin intervención de PetService VE. 🤝`
    );
    await notify(
      provider.userId,
      "NUEVA_PRERESERVA",
      `🔔 PetService VE: ¡Nueva prereserva directa! ${auth.name} agendó ${service.name} de ${pet.name} (${booking.code}) para el ${fechaLinda} a las ${time}. 📍 ${address}. Pago acordado: ${methodLabel} — directo con el cliente, sin comisión. Escríbele por WhatsApp para coordinar los detalles. 🐾`,
      "ENVIADO"
    );
  } else {
    await notify(
      auth.id,
      "CONFIRMACION_RESERVA",
      `🐾 PetService VE: ¡Hola ${auth.name.split(" ")[0]}! Registramos tu solicitud ${booking.code} (${service.name} para ${pet.name}). ${provider.businessName} te espera el ${fechaLinda} a las ${time}. Completa el pago para confirmar.`
    );
  }
  await notify(
    auth.id,
    "RECORDATORIO_24H",
    `⏰ PetService VE: Recordatorio — mañana a las ${time} llega ${provider.businessName} para ${service.name} de ${pet.name} (${booking.code}). Confirma respondiendo SI.`,
    "PROGRAMADO"
  );

  // Teléfono del negocio: se entrega SOLO al cliente autenticado que acaba de
  // crear la reserva (canal WhatsApp directo prestador↔cliente con relación real).
  const providerUser = await db.user.findUnique({ where: { id: provider.userId }, select: { phone: true } });

  return NextResponse.json(
    { booking, providerPhone: providerUser?.phone ?? null, direct: directPrereserva, paymentMethod: directPrereserva ? payMethod : null },
    { status: 201 }
  );
}
