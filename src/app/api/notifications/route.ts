import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, sameOriginOrError, readJson, cleanText } from "@/lib/petservice/auth";

/**
 * GET /api/notifications — notificaciones del usuario autenticado.
 * La identidad viene de la sesión; el parámetro userId fue eliminado (anti-IDOR).
 */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const notifications = await db.notification.findMany({
    where: { userId: auth.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ notifications });
}

/** POST /api/notifications — marca las notificaciones propias como leídas */
export async function POST(req: Request) {
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const body = await readJson<Record<string, unknown>>(req, 2048);
  if (body?.action === "markAllRead") {
    await db.notification.updateMany({
      where: { userId: auth.id, readAt: null },
      data: { readAt: new Date(), status: "LEIDO" },
    });
  }
  return NextResponse.json({ ok: true });
}
