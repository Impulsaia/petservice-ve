import { NextResponse, after } from "next/server";
import { createHash } from "crypto";
import { db, flushDb } from "@/lib/db";
import {
  rateLimit, clientIp, sameOriginOrError, readJson, jsonError,
  passwordProblems, hashPassword, createSessionToken, sessionCookie,
} from "@/lib/petservice/auth";

/**
 * POST /api/auth/reset-password — { token, password }
 *
 * Flujo: valida el token (SHA-256, no expirado, no usado), actualiza la
 * contraseña con scrypt (mismo esquema que el registro), marca el reset como
 * usado e inicia sesión automáticamente (cookie de sesión).
 *
 * Rate limit: 10/h por IP (los tokens ya son de un solo uso y expiran en 30 min).
 */
export async function POST(req: Request) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const rl = rateLimit(`resetpw:${clientIp(req)}`, 10, 60 * 60_000);
  if (!rl.ok) {
    return jsonError("Demasiadas solicitudes. Espera unos minutos e intenta de nuevo.", 429, { retryAfterS: rl.retryAfterS });
  }

  const body = await readJson<Record<string, unknown>>(req, 4096);
  if (!body) return jsonError("Solicitud inválida", 400);

  const token = typeof body.token === "string" ? body.token.trim().slice(0, 128) : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!token) return jsonError("Token requerido", 400);
  const pwProblem = passwordProblems(password); // mínimo 8, letra + número
  if (pwProblem) return jsonError(pwProblem, 400);

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const reset = await db.passwordReset.findUnique({ where: { tokenHash } });
  if (!reset) return jsonError("El enlace no es válido o ya fue utilizado", 400);
  if (reset.usedAt) return jsonError("Este enlace ya fue utilizado. Solicita uno nuevo.", 400);
  if (reset.expiresAt < new Date()) return jsonError("El enlace expiró. Solicita uno nuevo.", 400);

  const user = await db.user.findUnique({ where: { id: reset.userId } });
  if (!user || !user.active) return jsonError("Cuenta no disponible", 403);

  const passwordHash = await hashPassword(password);
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash } }),
    db.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
  ]);
  // Seguridad: invalida cualquier otro reset pendiente de esta cuenta
  await db.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } });
  console.log(`[SEGURIDAD] Contraseña restablecida (reset flow) para ${user.email}`);

  const res = NextResponse.json({ ok: true, message: "Contraseña actualizada. ¡Ya puedes entrar con la nueva!" });
  res.headers.append("Set-Cookie", sessionCookie(createSessionToken(user.id)));
  return res;
}
