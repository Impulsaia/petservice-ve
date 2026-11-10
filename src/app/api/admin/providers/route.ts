import { NextResponse, after } from "next/server";
import { db, flushDb } from "@/lib/db";
import { requireRole } from "@/lib/petservice/auth";

/** GET /api/admin/providers — todos los prestadores con estado de verificación (SOLO ADMIN) */
export async function GET(req: Request) {
  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;
  const providers = await db.provider.findMany({
    include: { user: { select: { name: true, email: true, phone: true } } },
    orderBy: { businessName: "asc" },
  });
  return NextResponse.json({
    providers: providers.map((p) => ({
      id: p.id,
      businessName: p.businessName,
      ownerName: p.user.name,
      email: p.user.email,
      phone: p.user.phone,
      status: p.status,
      // Motivo de la auto-suspensión por queja (visible solo para el admin)
      suspensionNote: p.suspensionNote,
      city: p.city,
      zoneName: p.zoneName,
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
      badges: p.badges,
      // Monetización (Task 42)
      plan: p.plan,
      planExpiresAt: p.planExpiresAt,
      adsBoostUntil: p.adsBoostUntil,
      commissionAcceptedAt: p.commissionAcceptedAt,
      commissionTermsVersion: p.commissionTermsVersion,
      // Nota: los datos del documento NO se exponen aquí; solo se indica que existe
      hasDocument: true,
    })),
  });
}

/** PATCH /api/admin/providers — verificación en capas (auditable, SOLO ADMIN) */
export async function PATCH(req: Request) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const { id, action } = body ?? {};
  if (!id || !action) return NextResponse.json({ error: "id y action requeridos" }, { status: 400 });

  const statusMap: Record<string, string> = {
    verify: "VERIFIED",
    reject: "REJECTED",
    suspend: "SUSPENDED",
    reactivate: "VERIFIED",
    markPending: "PENDING",
  };

  // ── Monetización (Task 42): plan y destacado ──
  if (action === "setPlan" || action === "setAdsBoost" || action === "clearAdsBoost") {
    const provider = await db.provider.findUnique({ where: { id } });
    if (!provider) return NextResponse.json({ error: "Prestador no encontrado" }, { status: 404 });

    let data: Record<string, string | Date | null> = {};
    let notifBody = "";

    if (action === "setPlan") {
      const plan = typeof body.plan === "string" ? body.plan.toUpperCase() : "FREE";
      if (!["FREE", "SUBSCRIPTION", "COMMISSION"].includes(plan)) {
        return NextResponse.json({ error: "plan debe ser FREE | SUBSCRIPTION | COMMISSION" }, { status: 400 });
      }
      // planExpiresAt: ISO string opcional (solo relevante en SUBSCRIPTION); null = sin vencimiento
      let expires: Date | null = null;
      if (typeof body.planExpiresAt === "string" && body.planExpiresAt.trim()) {
        const d = new Date(body.planExpiresAt);
        if (!isFinite(d.getTime())) return NextResponse.json({ error: "planExpiresAt inválido (usa ISO yyyy-mm-dd)" }, { status: 400 });
        expires = d;
      }
      data = { plan, planExpiresAt: plan === "SUBSCRIPTION" ? expires : null };
      notifBody =
        plan === "FREE"
          ? `ℹ️ PetService VE: tu plan volvió a GRATIS. El CRM/calendario quedará bloqueado salvo que actives un plan. Tus datos están a salvo.`
          : plan === "SUBSCRIPTION"
            ? `💎 PetService VE: ¡Suscripción ACTIVADA${expires ? ` hasta ${expires.toLocaleDateString("es-VE")}` : ""}! Ya puedes usar tu CRM de clientes y calendario sin comisiones por transacción. 🎉`
            : `🤝 PetService VE: plan por COMISIÓN activado por el admin. Tu CRM y calendario están desbloqueados; el resumen mensual llega por WhatsApp.`;
    } else if (action === "setAdsBoost") {
      const days = Number(body.days);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        return NextResponse.json({ error: "days debe ser un entero entre 1 y 365" }, { status: 400 });
      }
      // Si ya tiene un boost activo, se extiende desde su fecha actual (no se pierde lo pagado)
      const base = provider.adsBoostUntil && provider.adsBoostUntil.getTime() > Date.now() ? provider.adsBoostUntil : new Date();
      const until = new Date(base.getTime() + days * 24 * 3600_000);
      data = { adsBoostUntil: until };
      notifBody = `📢 PetService VE: ¡Destacado ACTIVADO hasta ${until.toLocaleDateString("es-VE")}! Aparecerás PRIMERO en las búsquedas de tu zona. 🚀`;
    } else {
      data = { adsBoostUntil: null };
      notifBody = `ℹ️ PetService VE: el destacado de tu ficha fue desactivado. Puedes reactivarlo cuando quieras desde soporte.`;
    }

    const updated = await db.provider.update({ where: { id }, data });
    await db.notification.create({
      data: { userId: updated.userId, channel: "WHATSAPP", template: `MONETIZACION_${action.toUpperCase()}`, body: notifBody, status: "ENVIADO" },
    });
    return NextResponse.json({ ok: true, plan: updated.plan, planExpiresAt: updated.planExpiresAt, adsBoostUntil: updated.adsBoostUntil });
  }

  const status = statusMap[action];
  if (!status) return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });

  // Reactivar = cliente quedó satisfecho: se limpia la nota de la queja automática
  const data: Record<string, string | null> = { status };
  if (action === "reactivate") data.suspensionNote = null;

  const provider = await db.provider.update({ where: { id }, data });
  await db.notification.create({
    data: {
      userId: provider.userId,
      channel: "WHATSAPP",
      template: "VERIFICACION_PRESTADOR",
      body:
        action === "verify"
          ? `✅ PetService VE: ¡Felicidades ${provider.businessName}! Tu cuenta fue VERIFICADA. Ya apareces en la búsqueda pública. 🎉`
          : action === "reject"
            ? `⚠️ PetService VE: Tu verificación fue rechazada. Revisa tus documentos y vuelve a enviarlos.`
            : action === "suspend"
              ? `⛔ PetService VE: Tu cuenta fue suspendida temporalmente. Escribe a soporte para más información.`
              : action === "reactivate"
                ? `✅ PetService VE: ¡Tu cuenta fue REACTIVADA, ${provider.businessName}! Ya apareces de nuevo en las búsquedas. Gracias por resolver la situación con tu cliente. 🐾`
                : `ℹ️ PetService VE: Estado de tu cuenta actualizado a ${status}.`,
      status: "ENVIADO",
    },
  });

  return NextResponse.json({ ok: true, status });
}
