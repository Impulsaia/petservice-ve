import { NextResponse } from "next/server";
import { requireRole, sameOriginOrError, readJson, cleanText, rateLimit, clientIp } from "@/lib/petservice/auth";
import { db } from "@/lib/db";
import { runDataQuery } from "@/lib/petservice/dataquery";

/**
 * POST /api/provider/query — Consultas del propio negocio (solo PROVIDER)
 * El alcance se limita en el servidor al prestador de la sesión: nunca ve
 * datos de otros prestadores aunque la pregunta sea global.
 */
export async function POST(req: Request) {
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "PROVIDER");
  if (auth instanceof NextResponse) return auth;

  const provider = await db.provider.findUnique({ where: { userId: auth.id }, select: { id: true } });
  if (!provider) return NextResponse.json({ error: "Perfil de prestador no encontrado" }, { status: 404 });

  const rl = rateLimit(`dq:${clientIp(req)}`, 15, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Demasiadas consultas. Espera un momento 🐾", retryAfterS: rl.retryAfterS }, { status: 429 });

  const body = await readJson<Record<string, unknown>>(req, 4096);
  if (!body) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });

  const question = cleanText(body.question, 300);
  if (question.length < 5) return NextResponse.json({ error: "Escribe tu consulta (mínimo 5 caracteres)" }, { status: 400 });

  try {
    const result = await runDataQuery(question, "provider", provider.id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === "NO_ENTENDI") {
      return NextResponse.json(
        {
          error: "No pude interpretar la consulta 🤔 Prueba con: “mis ingresos este mes”, “reservas canceladas”, “mis reseñas por rating” o “mis pagos por método”.",
        },
        { status: 422 }
      );
    }
    console.error("Provider query error:", e);
    return NextResponse.json({ error: "Error procesando la consulta" }, { status: 500 });
  }
}
