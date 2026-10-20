/**
 * Envío de correos transaccionales (recuperación de contraseña).
 *
 * Modo DEMO (por defecto): no se envía nada — la API devuelve el enlace en la
 * respuesta para probar el flujo end-to-end (ver /api/auth/forgot-password).
 *
 * Modo PRODUCCIÓN: define RESEND_API_KEY (y opcionalmente EMAIL_FROM) en las
 * variables de entorno y los enlaces llegan por correo real vía Resend
 * (https://resend.com — plan gratuito suficiente para arrancar).
 */

export interface MailResult {
  sent: boolean;
  provider: "resend" | "none";
  error?: string;
}

export function mailerConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

const FROM_DEFAULT = "PetService VE <onboarding@resend.dev>";

/** Envía el correo de recuperación. Devuelve sent=false si no hay proveedor o falla. */
export async function sendRecoveryEmail(to: string, resetUrl: string, userName?: string): Promise<MailResult> {
  if (!mailerConfigured()) return { sent: false, provider: "none" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || FROM_DEFAULT,
        to: [to],
        subject: "Recupera tu contraseña · PetService VE 🐾",
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px">
            <h2 style="color:#0f766e;margin:0 0 8px">🐾 PetService VE</h2>
            <p style="color:#374151">Hola${userName ? ` ${userName}` : ""}, recibimos una solicitud para restablecer tu contraseña.</p>
            <p style="margin:20px 0">
              <a href="${resetUrl}" style="background:#0f766e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:bold;display:inline-block">
                Crear una contraseña nueva
              </a>
            </p>
            <p style="color:#6b7280;font-size:13px">Este enlace vence en <strong>30 minutos</strong>. Si no fuiste tú, ignora este correo y tu clave sigue igual.</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0" />
            <p style="color:#9ca3af;font-size:12px">Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>${resetUrl}</p>
          </div>`,
        text: `Recupera tu contraseña de PetService VE: ${resetUrl} (vence en 30 minutos). Si no fuiste tú, ignora este correo.`,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[MAILER] Resend rechazó el envío:", res.status, body.slice(0, 300));
      return { sent: false, provider: "resend", error: `HTTP ${res.status}` };
    }
    console.log(`[MAILER] Correo de recuperación enviado a ${to}`);
    return { sent: true, provider: "resend" };
  } catch (err) {
    console.error("[MAILER] Error enviando correo:", err instanceof Error ? err.message : err);
    return { sent: false, provider: "resend", error: err instanceof Error ? err.message : "error" };
  }
}
