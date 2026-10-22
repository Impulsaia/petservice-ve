import { NextResponse, after } from "next/server";
import { db, flushDb } from "@/lib/db";
import { requireRole, sameOriginOrError } from "@/lib/petservice/auth";
import { syncRateIfNeeded, rateView, fetchBcvRate } from "@/lib/petservice/rate";

export const dynamic = "force-dynamic";

/** GET /api/rate/bcv — tasa actual guardada (sin consultar externo) */
export async function GET() {
  const s = await db.settings.findUnique({ where: { id: "main" } });
  if (!s) return NextResponse.json({ error: "Settings no inicializadas" }, { status: 404 });
  return NextResponse.json({ rate: rateView(s) });
}

/**
 * POST /api/rate/bcv — fuerza sincronización AHORA con la cadena de fuentes
 * (dolarapi → pydolarve → bcv.org.ve). SOLO ADMIN.
 */
export async function POST(req: Request) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  const before = await db.settings.findUnique({ where: { id: "main" } });
  const s = await syncRateIfNeeded(true);

  if (!s) return NextResponse.json({ error: "Settings no inicializadas" }, { status: 404 });

  if (before && s.usdToBsUpdatedAt === before.usdToBsUpdatedAt && s.usdToBs === before.usdToBs && s.usdToBsSource === before.usdToBsSource) {
    // No cambió nada → probar en vivo para distinguir "fallo externo" de "sin cambios"
    const live = await fetchBcvRate();
    if (!live) {
      return NextResponse.json(
        { error: "No se pudo contactar ninguna fuente externa (dolarapi, pydolarve, bcv.org.ve). Se conserva el último valor.", rate: rateView(s), synced: false },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ rate: rateView(s), synced: true });
}
