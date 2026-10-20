import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, sameOriginOrError, readJson } from "@/lib/petservice/auth";
import { syncRateIfNeeded, rateView } from "@/lib/petservice/rate";

/** GET /api/settings — configuración pública (tasa BCV auto-actualizada, comisión) */
export async function GET() {
  const s = await syncRateIfNeeded(); // refresca desde BCV si autoRate y >1h (throttle 10 min)
  if (!s) return NextResponse.json({ error: "Settings no inicializadas" }, { status: 404 });
  return NextResponse.json({
    settings: { ...rateView(s), commissionPct: s.commissionPct, defaultRadiusKm: s.defaultRadiusKm },
  });
}

/** PUT /api/settings — actualizar configuración (SOLO ADMIN) */
export async function PUT(req: Request) {
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  const body = await readJson<Record<string, unknown>>(req, 4096);
  if (!body) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });

  const usdToBs = Number(body?.usdToBs);
  const commissionPct = Number(body?.commissionPct);
  const defaultRadiusKm = Number(body?.defaultRadiusKm);
  if (!isFinite(usdToBs) || usdToBs <= 0 || usdToBs > 1000000 || !isFinite(commissionPct) || commissionPct < 0 || commissionPct > 50) {
    return NextResponse.json({ error: "Valores inválidos" }, { status: 400 });
  }

  const current = await db.settings.findUnique({ where: { id: "main" } });
  // Edición manual de la tasa → queda marcada como "manual" SOLO si el valor cambió
  // (así guardar la comisión no congela por error la sincronización BCV)
  const rateChanged = !current || current.usdToBs !== usdToBs;
  const data: Record<string, unknown> = {
    usdToBs,
    commissionPct,
    ...(rateChanged ? { usdToBsSource: "manual", usdToBsUpdatedAt: new Date() } : {}),
    ...(isFinite(defaultRadiusKm) && defaultRadiusKm > 0 && defaultRadiusKm <= 100 ? { defaultRadiusKm } : {}),
  };
  // Toggle de actualización automática BCV
  if (typeof body.autoRate === "boolean") data.autoRate = body.autoRate;

  const s = await db.settings.update({ where: { id: "main" }, data });
  return NextResponse.json({
    settings: { ...rateView(s), commissionPct: s.commissionPct, defaultRadiusKm: s.defaultRadiusKm },
  });
}
