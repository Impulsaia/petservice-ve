import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, sameOriginOrError, readJson } from "@/lib/petservice/auth";

/** GET /api/settings — configuración pública (tasa del día, comisión) */
export async function GET() {
  const s = await db.settings.findUnique({ where: { id: "main" } });
  if (!s) return NextResponse.json({ error: "Settings no inicializadas" }, { status: 404 });
  return NextResponse.json({
    settings: { usdToBs: s.usdToBs, commissionPct: s.commissionPct, defaultRadiusKm: s.defaultRadiusKm },
  });
}

/** PUT /api/settings — actualizar configuración (SOLO ADMIN) */
export async function PUT(req: Request) {
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  const body = await readJson<Record<string, unknown>>(req, 2048);
  if (!body) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });

  const usdToBs = Number(body?.usdToBs);
  const commissionPct = Number(body?.commissionPct);
  const defaultRadiusKm = Number(body?.defaultRadiusKm);
  if (!isFinite(usdToBs) || usdToBs <= 0 || usdToBs > 1000000 || !isFinite(commissionPct) || commissionPct < 0 || commissionPct > 50) {
    return NextResponse.json({ error: "Valores inválidos" }, { status: 400 });
  }
  const s = await db.settings.update({
    where: { id: "main" },
    data: {
      usdToBs,
      commissionPct,
      ...(isFinite(defaultRadiusKm) && defaultRadiusKm > 0 && defaultRadiusKm <= 100 ? { defaultRadiusKm } : {}),
    },
  });
  return NextResponse.json({ settings: { usdToBs: s.usdToBs, commissionPct: s.commissionPct, defaultRadiusKm: s.defaultRadiusKm } });
}
