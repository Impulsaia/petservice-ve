import { NextResponse, after } from "next/server";
import { db, flushDb } from "@/lib/db";
import { requireRole, sameOriginOrError, readJson, jsonError } from "@/lib/petservice/auth";
import { getProviderOf } from "@/lib/petservice/server";
import { parseServiceBody } from "@/lib/petservice/validators";

/**
 * PATCH /api/provider/services/[id] — edita un servicio PROPIO (anti-IDOR).
 * Acepta cualquier subconjunto de campos del servicio.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "PROVIDER");
  if (auth instanceof NextResponse) return auth;

  const provider = await getProviderOf(auth.id);
  if (!provider) return jsonError("Perfil de prestador no encontrado", 404);

  const { id } = await params;
  const service = await db.service.findUnique({ where: { id } });
  // 404 sin filtrar existencia si no es dueño (anti-IDOR)
  if (!service || service.providerId !== provider.id) {
    return jsonError("Servicio no encontrado", 404);
  }

  const body = await readJson<Record<string, unknown>>(req, 16_384);
  if (!body) return jsonError("Solicitud inválida", 400);

  const parsed = parseServiceBody(body, true, { priceUsd: service.priceUsd });
  if (parsed.error || !parsed.data) return jsonError(parsed.error ?? "Datos inválidos", 400);

  const updated = await db.service.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ service: updated });
}

/**
 * DELETE /api/provider/services/[id] — elimina un servicio PROPIO.
 * Si tiene reservas asociadas se rechaza el borrado (integridad) y se sugiere
 * desactivarlo con PATCH { active: false }.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "PROVIDER");
  if (auth instanceof NextResponse) return auth;

  const provider = await getProviderOf(auth.id);
  if (!provider) return jsonError("Perfil de prestador no encontrado", 404);

  const { id } = await params;
  const service = await db.service.findUnique({
    where: { id },
    include: { _count: { select: { bookings: true } } },
  });
  if (!service || service.providerId !== provider.id) {
    return jsonError("Servicio no encontrado", 404);
  }

  if (service._count.bookings > 0) {
    return jsonError(
      `Este servicio tiene ${service._count.bookings} reserva(s) asociada(s) y no puede borrarse. Desactívalo con PATCH { active: false }.`,
      409
    );
  }

  await db.service.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
