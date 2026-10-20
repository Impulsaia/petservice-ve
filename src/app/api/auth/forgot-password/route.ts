import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { rateLimit, clientIp, sameOriginOrError, readJson, isValidEmail, jsonError, cleanText } from "@/lib/petservice/auth";

/**
 * POST /api/auth/forgot-password — { email }
 *
 * SIEMPRE responde 200 con mensaje genérico (anti-enumeración: no se revela
 * si el correo existe o no). Si existe:
 *  - Crea PasswordReset con token aleatorio de 32 bytes (hex); en la DB solo
 *    se guarda el SHA-256 del token. Expira en 30 minutos.
 *  - MODO DEMO (sin SMTP configurado): incluye `demo: true` y `resetUrl` en la
 *    respuesta para poder probar el flujo end-to-end. ⚠️ En producción NUNCA
 *    devolver el token: configurar SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM y
 *    enviar el link por correo (ver docs/despliegue.md).
 *
 * Rate limit: 3 peticiones/hora por IP.
 */
export async function POST(req: Request) {
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

  // Modo demo: sin SMTP se devuelve el link para probar el flujo completo.
  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  if (!smtpConfigured) {
    return NextResponse.json({
      ...generic,
      demo: true,
      resetUrl: `/restablecer?token=${token}`,
      note: "Modo demo: SMTP no configurado, el enlace de reset se devuelve en la respuesta. En producción se enviaría por correo.",
    });
  }

  // TODO producción: enviar email con SMTP (nodemailer) a user.email con el link.
  return NextResponse.json(generic);
}
