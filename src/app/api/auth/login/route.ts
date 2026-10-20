import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyPassword, createSessionToken, sessionCookie, rateLimit, clientIp,
  sameOriginOrError, readJson, isValidEmail, jsonError, cleanText,
} from "@/lib/petservice/auth";

/**
 * POST /api/auth/login — { email, password }
 * - Rate limit: 8 intentos/15min por IP y 5/15min por email (anti fuerza bruta)
 * - Mensajes genéricos para no filtrar existencia de cuentas (anti enumeración)
 */
export async function POST(req: Request) {
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const ip = clientIp(req);
  const ipLimit = rateLimit(`login:ip:${ip}`, 10, 15 * 60_000);
  if (!ipLimit.ok) return jsonError("Demasiados intentos. Espera unos minutos e intenta de nuevo.", 429, { retryAfterS: ipLimit.retryAfterS });

  const body = await readJson<{ email?: unknown; password?: unknown }>(req);
  if (!body) return jsonError("Solicitud inválida", 400);

  const email = cleanText(body.email, 254).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!isValidEmail(email) || !password) {
    return jsonError("Correo o contraseña incorrectos", 401);
  }

  const emailLimit = rateLimit(`login:email:${email}`, 5, 15 * 60_000);
  if (!emailLimit.ok) return jsonError("Demasiados intentos para esta cuenta. Espera unos minutos.", 429, { retryAfterS: emailLimit.retryAfterS });

  const user = await db.user.findUnique({ where: { email } });
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    return jsonError("Correo o contraseña incorrectos", 401);
  }
  // Cuentas desactivadas por el admin: mismo flujo pero mensaje explícito
  if (!user.active) {
    return jsonError("Cuenta desactivada. Contacta al administrador.", 403);
  }

  const res = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone },
  });
  res.headers.append("Set-Cookie", sessionCookie(createSessionToken(user.id)));
  return res;
}
