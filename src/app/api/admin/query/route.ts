import { NextResponse, after } from "next/server";
import { requireRole, sameOriginOrError, readJson, cleanText, rateLimit, clientIp } from "@/lib/petservice/auth";
import { runDataQuery } from "@/lib/petservice/dataquery";
import { flushDb } from "@/lib/db";

/**
 * POST /api/admin/query — Consultas de negocio en lenguaje natural (solo ADMIN)
 * "¿cuántas reservas se completaron en San Félix este mes?" → respuesta + tabla
 * Sin SQL crudo: traducción whitelist → agregación en JS.
 */
export async function POST(req: Request) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  const rl = rateLimit(`dq:${clientIp(req)}`, 15, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Demasiadas consultas. Espera un momento 🐾", retryAfterS: rl.retryAfterS }, { status: 429 });

  const body = await readJson<Record<string, unknown>>(req, 4096);
  if (!body) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });

  const question = cleanText(body.question, 300);
  if (question.length < 5) return NextResponse.json({ error: "Escribe tu consulta (mínimo 5 caracteres)" }, { status: 400 });

  try {
    const result = await runDataQuery(question, "admin");
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === "NO_ENTENDI") {
      return NextResponse.json(
        {
          error: "No pude interpretar la consulta 🤔 Prueba con: “reservas completadas en San Félix este mes”, “ingresos por método de pago”, “prestadores por ciudad” o “reseñas por rating”.",
        },
        { status: 422 }
      );
    }
    console.error("Admin query error:", e);
    return NextResponse.json({ error: "Error procesando la consulta" }, { status: 500 });
  }
}
