import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { requireRole, sameOriginOrError, jsonError, hashPassword } from "@/lib/petservice/auth";

/**
 * POST /api/admin/users/[id]/reset-password — genera una contraseña temporal
 * SEGURA para el usuario, la retorna UNA sola vez (el admin se la pasa al
 * usuario por otro canal) e invalida los resets pendientes por correo.
 *
 * La contraseña temporal: 12 chars (mayúsculas, minúsculas, dígitos) — cumple
 * la política (letra + número, ≥8). Se guarda con scrypt igual que el registro.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const user = await db.user.findUnique({ where: { id } });
  if (!user) return jsonError("Usuario no encontrado", 404);

  // Alfabeto sin caracteres ambiguos (0/O, 1/l/I) para dictado por teléfono
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let temp = "";
  for (const b of bytes) temp += alphabet[b % alphabet.length];
  // Garantiza letra + número por política de contraseña
  if (!/[0-9]/.test(temp)) temp = temp.slice(0, 11) + "7";

  const passwordHash = await hashPassword(temp);
  await db.$transaction([
    db.user.update({ where: { id }, data: { passwordHash } }),
    // Seguridad: invalida los links de recuperación pendientes de esta cuenta
    db.passwordReset.deleteMany({ where: { userId: id, usedAt: null } }),
  ]);

  console.log(`[ADMIN] Reset de contraseña temporal para ${user.email} (por ${auth.email})`);
  // Se devuelve UNA vez; jamás se vuelve a mostrar ni se guarda en claro
  return NextResponse.json({
    ok: true,
    email: user.email,
    tempPassword: temp,
    note: "Comparte esta contraseña temporal por un canal seguro. El usuario debería cambiarla al entrar.",
  });
}
