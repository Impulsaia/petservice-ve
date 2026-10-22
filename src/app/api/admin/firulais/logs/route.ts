import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/petservice/auth";

/**
 * GET /api/admin/firulais/logs?onlyUnmatched=1 — últimas 100 preguntas
 * registradas por /api/ai/chat. Solo ADMIN.
 * onlyUnmatched=1 → solo las que Firulais NO pudo responder (candidatas a
 * nuevas entradas de la base de conocimiento).
 */
export async function GET(req: Request) {
  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const onlyUnmatched = searchParams.get("onlyUnmatched") === "1";

  const logs = await db.firulaisLog.findMany({
    where: onlyUnmatched ? { matched: false } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const stats = {
    total: await db.firulaisLog.count(),
    unmatched: await db.firulaisLog.count({ where: { matched: false } }),
  };
  return NextResponse.json({ logs, stats });
}
