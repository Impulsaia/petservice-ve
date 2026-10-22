import { ensureDbReady } from "@/lib/db";
import { NextResponse } from "next/server";
import { syncRateIfNeeded, rateView } from "@/lib/petservice/rate";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/rate — endpoint de cron (Vercel Cron: 1 vez/día).
 * Refresca la tasa BCV aunque no haya tráfico.
 * Si CRON_SECRET está definido exige `Authorization: Bearer <secret>`.
 */
export async function GET(req: Request) {
  await ensureDbReady();
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }
  const s = await syncRateIfNeeded(true);
  if (!s) return NextResponse.json({ error: "Settings no inicializadas" }, { status: 404 });
  return NextResponse.json({ ok: true, rate: rateView(s) });
}
