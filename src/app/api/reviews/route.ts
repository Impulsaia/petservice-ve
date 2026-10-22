import { NextResponse, after } from "next/server";
import { db, flushDb } from "@/lib/db";
import { REVIEW_TAGS } from "@/lib/petservice/constants";
import { requireUser, sameOriginOrError, readJson, cleanText } from "@/lib/petservice/auth";

/**
 * POST /api/reviews — crea reseña tras servicio completado (solo cliente dueño)
 * Body: { bookingId, rating, comment, tags: string[] }
 * Recalcula el promedio del prestador.
 */
export async function POST(req: Request) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "CLIENT") return NextResponse.json({ error: "Solo los clientes pueden reseñar" }, { status: 403 });

  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });

  const bookingId = cleanText(body.bookingId, 40);
  const rating = Number(body?.rating);
  const comment = cleanText(body.comment, 400);
  const tags = Array.isArray(body?.tags) ? body.tags.map(String).filter((t) => REVIEW_TAGS.some((rt) => rt.key === t)) : [];

  if (!bookingId || !isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Calificación inválida (1–5)" }, { status: 400 });
  }
  if (comment.length < 5) {
    return NextResponse.json({ error: "Cuéntanos un poco más (mínimo 5 caracteres)" }, { status: 400 });
  }

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      provider: { select: { id: true, businessName: true } },
      service: { select: { name: true } },
      review: true,
    },
  });
  if (!booking) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  // Anti-IDOR: solo el cliente dueño puede reseñar (404 para no filtrar)
  if (booking.clientId !== auth.id) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  if (booking.status !== "COMPLETADA") {
    return NextResponse.json({ error: "Solo puedes reseñar servicios completados" }, { status: 400 });
  }
  if (booking.review) return NextResponse.json({ error: "Ya dejaste una reseña para este servicio" }, { status: 400 });

  const review = await db.review.create({
    data: {
      bookingId,
      providerId: booking.providerId,
      authorName: auth.name,
      rating: Math.round(rating),
      comment,
      tags: tags.join(","),
    },
  });

  // Recalcular rating del prestador
  const agg = await db.review.aggregate({
    where: { providerId: booking.providerId, hidden: false },
    _avg: { rating: true },
    _count: { rating: true },
  });
  await db.provider.update({
    where: { id: booking.providerId },
    data: {
      ratingAvg: Math.round((agg._avg.rating ?? 0) * 10) / 10,
      ratingCount: agg._count.rating,
    },
  });

  await db.notification.create({
    data: {
      userId: auth.id,
      channel: "INAPP",
      template: "RESEÑA_PUBLICADA",
      body: `⭐ ¡Gracias por calificar a ${booking.provider.businessName}! Tu reseña ayuda a otros dueños de mascotas.`,
      status: "ENVIADO",
    },
  });

  // ── Queja automática (≤ 2★): auto-suspensión del prestador en búsquedas ──
  // Mecanismo simple y automático: solo clientes con servicio COMPLETADO y
  // pagado pueden reseñar (1 reseña por reserva), así que una queja ≤ 2★ es
  // verificable. El prestador sale de las búsquedas hasta que el admin aclare
  // con el cliente y lo reactive (cliente satisfecho).
  let providerSuspended = false;
  if (rating <= 2) {
    const hoy = new Date().toLocaleDateString("es-VE", { day: "numeric", month: "short", year: "numeric" });
    const note = `⛔ Queja automática: reseña de ${rating}★ de ${auth.name} (${hoy}) por "${
      booking.service?.name ?? "servicio"
    }". Suspensión de búsquedas hasta aclarar con el cliente.`.slice(0, 280);
    const updated = await db.provider.update({
      where: { id: booking.providerId },
      data: { status: "SUSPENDED", suspensionNote: note },
      select: { userId: true, businessName: true },
    });
    providerSuspended = true;

    // Avisar al prestador (WhatsApp simulado + in-app)
    await db.notification.create({
      data: {
        userId: updated.userId,
        channel: "WHATSAPP",
        template: "CUENTA_SUSPENDIDA",
        body: `⛔ PetService VE: recibimos una queja (${rating}★) de un cliente sobre tu servicio. Mientras la aclaramos contigo, tu ficha quedó fuera de las búsquedas. Escríbenos al soporte para resolverlo cuanto antes.`,
        status: "ENVIADO",
      },
    });
    // Avisar al admin (bandeja in-app)
    const admin = await db.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (admin) {
      await db.notification.create({
        data: {
          userId: admin.id,
          channel: "INAPP",
          template: "QUEJA_PRESTADOR",
          body: `🚨 Queja (${rating}★) de ${auth.name} contra ${updated.businessName}: fue AUTO-SUSPENDIDO de las búsquedas. Revisa la reseña y reactiva cuando el cliente quede satisfecho.`,
          status: "ENVIADO",
        },
      });
    }
  }

  return NextResponse.json({ review, providerSuspended }, { status: 201 });
}

/**
 * PATCH /api/reviews — respuesta del prestador dueño u ocultar (solo admin)
 * Body: { id, action: "respond"|"hide"|"show", response? }
 */
export async function PATCH(req: Request) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const body = await readJson<Record<string, unknown>>(req, 4096);
  if (!body) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  const id = cleanText(body.id, 40);
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const review = await db.review.findUnique({ where: { id } });
  if (!review) return NextResponse.json({ error: "Reseña no encontrada" }, { status: 404 });

  if (body.action === "respond" && body.response) {
    // Anti-IDOR: solo el prestador dueño de la reseña puede responder
    if (auth.role === "PROVIDER") {
      const provider = await db.provider.findUnique({ where: { userId: auth.id } });
      if (!provider || provider.id !== review.providerId) {
        return NextResponse.json({ error: "Reseña no encontrada" }, { status: 404 });
      }
    } else {
      return NextResponse.json({ error: "Solo los prestadores pueden responder reseñas" }, { status: 403 });
    }
    const updated = await db.review.update({
      where: { id },
      data: { response: cleanText(body.response, 300) },
    });
    return NextResponse.json({ review: updated });
  }

  if (body.action === "hide" || body.action === "show") {
    // Moderación exclusiva del admin
    if (auth.role !== "ADMIN") return NextResponse.json({ error: "Solo el administrador puede moderar reseñas" }, { status: 403 });
    const updated = await db.review.update({
      where: { id },
      data: { hidden: body.action === "hide" },
    });
    const agg = await db.review.aggregate({
      where: { providerId: review.providerId, hidden: false },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await db.provider.update({
      where: { id: review.providerId },
      data: {
        ratingAvg: Math.round((agg._avg.rating ?? 0) * 10) / 10,
        ratingCount: agg._count.rating,
      },
    });
    return NextResponse.json({ review: updated });
  }

  return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
}
