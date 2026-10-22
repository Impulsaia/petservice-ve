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
      city: p.city,
      zoneName: p.zoneName,
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
      badges: p.badges,
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
  const status = statusMap[action];
  if (!status) return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });

  const provider = await db.provider.update({ where: { id }, data: { status } });
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
              : `ℹ️ PetService VE: Estado de tu cuenta actualizado a ${status}.`,
      status: "ENVIADO",
    },
  });

  return NextResponse.json({ ok: true, status });
}
