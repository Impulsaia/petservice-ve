import ZAI from "z-ai-web-dev-sdk";
import { ZAI_CONFIG } from "./zaiConfig";

/**
 * Cliente Z-AI (LLM) que funciona en sandbox Y en Vercel.
 *
 * Causa histórica del "problemita técnico" en producción: el SDK carga su
 * config SOLO desde archivos .z-ai-config (cwd, $HOME o /etc). En el sandbox
 * existe /etc/.z-ai-config (funciona), pero en las lambdas de Vercel no existe
 * ningún archivo de config → ZAI.create() lanzaba siempre → la ruta de IA caía
 * al fallback "problemita técnico" TODAS las veces.
 *
 * Solución (en orden de prioridad):
 * 1. Variables de entorno ZAI_BASE_URL / ZAI_API_KEY / ZAI_TOKEN si existen.
 * 2. Config inyectada en el bundle por CI (zaiConfig.ts generado en deploy.yml
 *    desde los secretos ZAI_* de GitHub) — mismo patrón que demoDb.ts.
 * 3. ZAI.create() nativo (sandbox: /etc/.z-ai-config).
 *
 * La API exige el header X-Token (JWT) — probado: sin él responde
 * "missing X-Token header". chatId/userId son opcionales y NO se envían.
 */
export async function createZai(): Promise<InstanceType<typeof ZAI>> {
  const baseUrl = process.env.ZAI_BASE_URL?.trim() || ZAI_CONFIG.baseUrl.trim();
  const apiKey = process.env.ZAI_API_KEY?.trim() || ZAI_CONFIG.apiKey.trim();
  const token = process.env.ZAI_TOKEN?.trim() || ZAI_CONFIG.token.trim();

  if (baseUrl && apiKey) {
    // Construcción directa: salta el loader de archivos del SDK por completo.
    return new ZAI({ baseUrl, apiKey, ...(token ? { token } : {}) });
  }

  // Fallback: loader nativo (busca .z-ai-config en cwd, $HOME y /etc).
  return ZAI.create();
}
