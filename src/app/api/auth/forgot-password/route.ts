import { NextResponse, after } from "next/server";
import { createHash, randomBytes } from "crypto";
import { db, flushDb } from "@/lib/db";
import { rateLimit, clientIp, sameOriginOrError, readJson, isValidEmail, jsonError, cleanText } from "@/lib/petservice/auth";
import { sendRecoveryEmail } from "@/lib/petservice/mailer";

/**
 * POST /api/auth/forgot-password — { email }
 *
 * SIEMPRE responde 200 con mensaje genérico (anti-enumeración: no se revela
 * si el correo existe o no). Si existe:
 *  - Crea PasswordReset con token aleatorio de 32 bytes (hex); en la DB solo
 *    se guarda el SHA-256 del token. Expira en 30 minutos.
 *  - Con RESEND_API_KEY configurada: envía el enlace POR CORREO real (Resend).
 *  - MODO DEMO (sin mailer): incluye `demo: true` y `resetUrl` en la respuesta
 *    para probar el flujo end-to-end. ⚠️ Nunca devolver el token en producción.
 *
 * Rate limit: 3 peticiones/hora por IP.
 */
export async function POST(req: Request) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const rl = rateLimit(`forgotpw:${clientIp(req)}`, 3, 60 * 60_000);
  if (!rl.ok) {
    return jsonError("Demasiadas solicitudes. Espera unos minutos e intenta de nuevo.", 429, { retryAfterS: rl.retryAfterS });
  }

  const body = await readJson<Record<string, unknown>>(req, 4096);
  if (!body) return jsonError("Solicitud inválida", 400);

  const email = cleanText(body.email, 254).toLowerCase();
  if (!isValidEmail(email)) return jsonError("Correo electrónico inválido", 400);

  const generic = { ok: true, message: "Si ese correo está registrado, recibirás un enlace para restablecer tu contraseña." };

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active) return NextResponse.json(generic); // mismo mensaje: no filtra existencia

  // Token crudo (solo viaja en el link) + hash SHA-256 almacenado
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await db.passwordReset.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60_000) },
  });
  console.log(`[SEGURIDAD] PasswordReset creado para ${email} (expira en 30 min)`);

  // 1) Producción: con RESEND_API_KEY configurada el enlace llega POR CORREO real.
  const origin = new URL(req.url).origin;
  const resetUrl = `${origin}/restablecer?token=${token}`;
  const mail = await sendRecoveryEmail(user.email, resetUrl, user.name);
  if (mail.sent) {
    return NextResponse.json(generic);
  }

  // 2) Modo demo (sin mailer): se devuelve el link para probar el flujo completo.
  return NextResponse.json({
    ...generic,
    demo: true,
    resetUrl: `/restablecer?token=${token}`,
    note: "Modo demo: no hay proveedor de correo (RESEND_API_KEY). El enlace de reset se devuelve en la respuesta.",
  });
}
