import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, sameOriginOrError, readJson, jsonError, cleanText } from "@/lib/petservice/auth";

const ROLES = ["CLIENT", "PROVIDER", "ADMIN"];

/**
 * PATCH /api/admin/users/[id] — activa/desactiva una cuenta o cambia su rol.
 * Body: { active?: boolean, role?: "CLIENT"|"PROVIDER"|"ADMIN" }
 *
 * Reglas de seguridad:
 *  - Un admin no puede desactivarse a sí mismo (perdería el acceso al panel).
 *  - Un admin no puede degradar su propio rol.
 *  - Al desactivar, la sesión existente deja de valer (getSessionUser valida active).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const user = await db.user.findUnique({ where: { id } });
  if (!user) return jsonError("Usuario no encontrado", 404);

  const body = await readJson<Record<string, unknown>>(req, 4096);
  if (!body) return jsonError("Solicitud inválida", 400);

  const data: Record<string, unknown> = {};
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return jsonError("active debe ser boolean", 400);
    if (!body.active && user.id === auth.id) {
      return jsonError("No puedes desactivar tu propia cuenta de administrador", 400);
    }
    data.active = body.active;
  }
  if (body.role !== undefined) {
    const role = cleanText(body.role, 12).toUpperCase();
    if (!ROLES.includes(role)) return jsonError(`Role debe ser: ${ROLES.join(", ")}`, 400);
    if (user.id === auth.id && role !== "ADMIN") {
      return jsonError("No puedes quitarte el rol de administrador a ti mismo", 400);
    }
    data.role = role;
  }

  if (Object.keys(data).length === 0) return jsonError("Nada que actualizar (usa active y/o role)", 400);

  const updated = await db.user.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  console.log(`[ADMIN] Usuario ${updated.email} actualizado: ${JSON.stringify(data)} (por ${auth.email})`);

  // Los prestadores desactivados también salen del marketplace (estado SUSPENDED)
  if (data.active === false && user.role === "PROVIDER") {
    await db.provider.updateMany({ where: { userId: id, status: "VERIFIED" }, data: { status: "SUSPENDED" } });
  }

  return NextResponse.json({ user: updated });
}
