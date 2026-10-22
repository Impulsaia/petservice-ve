import ZAI from "z-ai-web-dev-sdk";
import { writeFileSync } from "fs";

/**
 * Cliente Z-AI (LLM) con soporte de despliegue en Vercel.
 *
 * El SDK carga la configuración SOLO desde archivos .z-ai-config (cwd, $HOME o
 * /etc). En producción (Vercel) esos archivos no existen — el repo es público y
 * la clave NO se commitea — así que el arranque falla y las rutas de IA caen al
 * fallback ("problemita técnico") SIEMPRE. Es la causa del mensaje intermitente
 * que veía el usuario: en el sandbox preview hay /etc/.z-ai-config (funciona),
 * en Vercel no (falla).
 *
 * Solución: si existen las variables de entorno ZAI_BASE_URL + ZAI_API_KEY
 * (configurables en Vercel → Settings → Environment Variables), se escribe la
 * config en /tmp (únicos directorios escribibles en lambda) y se apunta $HOME
 * ahí una sola vez por instancia, para que el loader nativo del SDK la encuentre.
 * Sin env vars, degrada al comportamiento actual (sandbox: funciona; Vercel:
 * fallback demo).
 *
 * Variables (Vercel):
 *   ZAI_BASE_URL  = https://internal-api.z.ai/v1
 *   ZAI_API_KEY   = <clave>
 *   ZAI_CHAT_ID / ZAI_USER_ID / ZAI_TOKEN = opcionales (headers X-Chat-Id etc.)
 */
let injected = false;

export async function createZai(): Promise<InstanceType<typeof ZAI>> {
  const baseUrl = process.env.ZAI_BASE_URL?.trim();
  const apiKey = process.env.ZAI_API_KEY?.trim();
  if (baseUrl && apiKey && !injected) {
    try {
      const cfg: Record<string, string> = { baseUrl, apiKey };
      for (const k of ["chatId", "userId", "token"] as const) {
        const v = process.env[`ZAI_${k.toUpperCase()}`]?.trim();
        if (v) cfg[k] = v;
      }
      writeFileSync("/tmp/.z-ai-config", JSON.stringify(cfg));
      // El loader del SDK mira path.join(os.homedir(), '.z-ai-config'):
      // redirigimos $HOME a /tmp para que lo encuentre (no rompe nada más).
      process.env.HOME = "/tmp";
      injected = true;
    } catch {
      // Sin permisos de escritura: degradar al loader nativo
    }
  }
  return ZAI.create();
}
