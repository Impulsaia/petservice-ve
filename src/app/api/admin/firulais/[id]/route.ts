import { NextResponse, after } from "next/server";
import { db, flushDb } from "@/lib/db";
import { requireRole, sameOriginOrError, readJson, jsonError, cleanText } from "@/lib/petservice/auth";
import { normalizeKeywords } from "@/lib/petservice/firulais";

/**
 * PATCH /api/admin/firulais/[id] — edita una entrada (question/answer/keywords/active).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const entry = await db.firulaisEntry.findUnique({ where: { id } });
  if (!entry) return jsonError("Entrada no encontrada", 404);

  const body = await readJson<Record<string, unknown>>(req, 16_384);
  if (!body) return jsonError("Solicitud inválida", 400);

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (body.question !== undefined) {
    const question = cleanText(body.question, 200);
    if (question.length < 4) return jsonError("La pregunta debe tener al menos 4 caracteres", 400);
    data.question = question;
  }
  if (body.answer !== undefined) {
    const answer = cleanText(body.answer, 1500);
    if (answer.length < 4) return jsonError("La respuesta debe tener al menos 4 caracteres", 400);
    data.answer = answer;
  }
  if (body.keywords !== undefined) {
    data.keywords = body.keywords ? normalizeKeywords(cleanText(body.keywords, 500)) : "";
  }
  if (body.active !== undefined) data.active = Boolean(body.active);

  const updated = await db.firulaisEntry.update({ where: { id }, data });
  return NextResponse.json({ entry: updated });
}

/** DELETE /api/admin/firulais/[id] — elimina una entrada y sus referencias en logs */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const entry = await db.firulaisEntry.findUnique({ where: { id } });
  if (!entry) return jsonError("Entrada no encontrada", 404);

  await db.firulaisEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
