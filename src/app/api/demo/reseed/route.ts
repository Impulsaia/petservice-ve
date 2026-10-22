import { NextResponse, after } from "next/server";
import { seedAll } from "@/lib/petservice/seed";
import { requireRole, sameOriginOrError } from "@/lib/petservice/auth";
import { flushDb } from "@/lib/db";

/**
 * POST /api/demo/reseed — reinicia los datos demo (SOLO ADMIN)
 * Es una operación destructiva: se protege con rol de administrador.
 */
export async function POST(req: Request) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  try {
    await seedAll();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Reseed error:", e);
    return NextResponse.json({ error: "No se pudo reiniciar la demo" }, { status: 500 });
  }
}
