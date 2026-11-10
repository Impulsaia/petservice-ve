import { NextResponse, after } from "next/server";
import { db, flushDb } from "@/lib/db";
import { requireRole, sameOriginOrError, readJson, jsonError } from "@/lib/petservice/auth";
import { getProviderOf } from "@/lib/petservice/server";
import { adsActive, COMMISSION_TERMS_VERSION, crmUnlocked } from "@/lib/petservice/monetization";

/**
 * Monetización del prestador autenticado (Task 42).
 *
 * GET  /api/provider/monetization — estado del plan para la UI del panel:
 *      { monetization: { plan, planExpiresAt, adsBoostUntil, commissionAcceptedAt,
 *                        commissionTermsVersion, crmUnlocked, adsActive } }
 *
 * POST /api/provider/monetization — self-serve:
 *      Body: { action: "accept-commission" }
 *      Acepta el convenio de comisiones (texto versionado) y desbloquea
 *      CRM/Calendario al instante. Registra fecha + versión del texto.
 */
export async function GET(req: Request) {
  const auth = await requireRole(req, "PROVIDER");
  if (auth instanceof NextResponse) return auth;

  const provider = await getProviderOf(auth.id);
  if (!provider) return jsonError("Perfil de prestador no encontrado", 404);

  return NextResponse.json({
    monetization: {
      plan: provider.plan,
      planExpiresAt: provider.planExpiresAt,
      adsBoostUntil: provider.adsBoostUntil,
      commissionAcceptedAt: provider.commissionAcceptedAt,
      commissionTermsVersion: provider.commissionTermsVersion,
      crmUnlocked: crmUnlocked(provider),
      adsActive: adsActive(provider),
      termsVersion: COMMISSION_TERMS_VERSION,
    },
  });
}

export async function POST(req: Request) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "PROVIDER");
  if (auth instanceof NextResponse) return auth;

  const provider = await getProviderOf(auth.id);
  if (!provider) return jsonError("Perfil de prestador no encontrado", 404);

  const body = await readJson<Record<string, unknown>>(req, 2048);
  if (!body) return jsonError("Solicitud inválida", 400);

  const action = typeof body.action === "string" ? body.action : "";
  if (action !== "accept-commission") {
    return jsonError("Acción no reconocida (esperado: accept-commission)", 400);
  }

  // Idempotente: si ya aceptó esta versión, no duplica registro ni notificación
  if (provider.plan === "COMMISSION" && provider.commissionAcceptedAt && provider.commissionTermsVersion === COMMISSION_TERMS_VERSION) {
    return NextResponse.json({
      monetization: {
        plan: provider.plan,
        planExpiresAt: provider.planExpiresAt,
        adsBoostUntil: provider.adsBoostUntil,
        commissionAcceptedAt: provider.commissionAcceptedAt,
        commissionTermsVersion: provider.commissionTermsVersion,
        crmUnlocked: true,
        adsActive: adsActive(provider),
        termsVersion: COMMISSION_TERMS_VERSION,
      },
      alreadyAccepted: true,
    });
  }

  const updated = await db.provider.update({
    where: { id: provider.id },
    data: {
      plan: "COMMISSION",
      commissionAcceptedAt: new Date(),
      commissionTermsVersion: COMMISSION_TERMS_VERSION,
    },
  });

  await db.notification.create({
    data: {
      userId: updated.userId,
      channel: "WHATSAPP",
      template: "CONVENIO_COMISION_ACEPTADO",
      body: `🤝 PetService VE: ${updated.businessName} aceptó el convenio de comisiones (${COMMISSION_TERMS_VERSION}). Su CRM y calendario ya están desbloqueados. El resumen mensual llega por WhatsApp.`,
      status: "ENVIADO",
    },
  });

  return NextResponse.json({
    monetization: {
      plan: updated.plan,
      planExpiresAt: updated.planExpiresAt,
      adsBoostUntil: updated.adsBoostUntil,
      commissionAcceptedAt: updated.commissionAcceptedAt,
      commissionTermsVersion: updated.commissionTermsVersion,
      crmUnlocked: crmUnlocked(updated),
      adsActive: adsActive(updated),
      termsVersion: COMMISSION_TERMS_VERSION,
    },
    alreadyAccepted: false,
  });
}
