import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, sameOriginOrError, readJson, jsonError, cleanText } from "@/lib/petservice/auth";
import { normalizeKeywords } from "@/lib/petservice/firulais";

/**
 * GET /api/admin/firulais — entradas de la base de conocimiento de Firulais 🐕.
 * ?q= filtra por pregunta/respuesta; ordenadas por hits (desc) y createdAt.
 */
export async function GET(req: Request) {
  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const q = cleanText(searchParams.get("q"), 60);

  const entries = await db.firulaisEntry.findMany({
    where: q ? { OR: [{ question: { contains: q } }, { answer: { contains: q } }, { keywords: { contains: q } }] } : {},
    orderBy: [{ active: "desc" }, { hits: "desc" }, { createdAt: "desc" }],
    take: 300,
  });
  const unmatched = await db.firulaisLog.count({ where: { matched: false } });
  return NextResponse.json({ entries, total: entries.length, unmatchedLogs: unmatched });
}

/**
 * POST /api/admin/firulais — crea una entrada.
 * Body: { question, answer, keywords?, active? }
 * Las keywords se normalizan (minúsculas, sin acentos) para el matching.
 */
export async function POST(req: Request) {
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  const body = await readJson<Record<string, unknown>>(req, 16_384);
  if (!body) return jsonError("Solicitud inválida", 400);

  const question = cleanText(body.question, 200);
  const answer = cleanText(body.answer, 1500);
  if (question.length < 4) return jsonError("La pregunta debe tener al menos 4 caracteres", 400);
  if (answer.length < 4) return jsonError("La respuesta debe tener al menos 4 caracteres", 400);
  const keywords = body.keywords ? normalizeKeywords(cleanText(body.keywords, 500)) : "";

  const dup = await db.firulaisEntry.findFirst({ where: { question } });
  if (dup) return jsonError("Ya existe una entrada con esa pregunta", 409);

  const entry = await db.firulaisEntry.create({
    data: { question, answer, keywords, active: body.active === undefined ? true : Boolean(body.active) },
  });
  return NextResponse.json({ entry }, { status: 201 });
}
