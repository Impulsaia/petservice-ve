import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, cleanText } from "@/lib/petservice/auth";

/**
 * GET /api/admin/users — listado de usuarios con filtros. Solo ADMIN.
 * Query: ?role=CLIENT|PROVIDER|ADMIN&q=texto&sort=recent|name|role
 * Nunca expone passwordHash. Incluye estado de la cuenta (active) y, a los
 * prestadores, el estado de verificación de su negocio.
 */
export async function GET(req: Request) {
  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const role = cleanText(searchParams.get("role"), 12).toUpperCase();
  const q = cleanText(searchParams.get("q"), 60);
  const sort = cleanText(searchParams.get("sort"), 12) || "recent";

  const where: Record<string, unknown> = {};
  if (["CLIENT", "PROVIDER", "ADMIN"].includes(role)) where.role = role;
  if (q) {
    where.OR = [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }];
  }

  const orderBy =
    sort === "name" ? { name: "asc" as const }
    : sort === "role" ? { role: "asc" as const }
    : { createdAt: "desc" as const };

  const users = await db.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      active: true,
      createdAt: true,
      googleId: true, // solo presencia (link de Google), no es secreto
      avatarUrl: true,
      provider: { select: { id: true, businessName: true, status: true, city: true } },
      _count: { select: { clientBookings: true, pets: true } },
    },
    orderBy,
    take: 300,
  });

  return NextResponse.json({ users, total: users.length });
}
