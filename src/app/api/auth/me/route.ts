import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/petservice/auth";

/**
 * GET /api/auth/me — usuario de la sesión actual (+ perfil de prestador si aplica)
 * Nunca devuelve passwordHash.
 */
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ user: null });

  const provider = user.role === "PROVIDER"
    ? await db.provider.findUnique({ where: { userId: user.id } })
    : null;

  return NextResponse.json({
    user,
    provider: provider
      ? { id: provider.id, businessName: provider.businessName, status: provider.status, city: provider.city, zoneName: provider.zoneName }
      : null,
  });
}
