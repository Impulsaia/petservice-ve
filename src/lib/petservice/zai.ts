import ZAI from "z-ai-web-dev-sdk";
import { ZAI_CONFIG } from "./zaiConfig";

/**
 * Cliente Z-AI (LLM) que funciona en sandbox Y en Vercel.
 *
 * ── Historia del "problemita técnico" ─────────────────────────────────────
 * 1. El SDK Z-AI lee credenciales SOLO de archivos .z-ai-config (cwd, $HOME,
 *    /etc). En el sandbox existe /etc/.z-ai-config; en las lambdas de Vercel
 *    no existe ninguno → ZAI.create() lanzaba siempre.
 * 2. Fix (este módulo): inyectar la config DENTRO del bundle en CI
 *    (zaiConfig.ts generado desde secretos) — mismo patrón que demoDb.ts.
 * 3. PERO: el host internal-api.z.ai resuelve a IPs PRIVADAS de la red
 *    Aliyun (172.25.x.x). Desde AWS/Vercel la conexión falla con
 *    "TypeError: fetch failed" aunque la config viaje en el bundle. La API
 *    interna SOLO es alcanzable desde la red Z-AI (este sandbox).
 * 4. Solución final: soportar la plataforma PÚBLICA https://api.z.ai con una
 *    clave sk- (ZAI_PUBLIC_KEY). Ese endpoint es global y sí es alcanzable
 *    desde Vercel. Mientras la clave pública no esté configurada, las rutas
 *    de IA operan en MODO BÁSICO (FAQ determinista + respuestas guiadas)
 *    sin mostrar errores al usuario.
 *
 * Prioridad: publicKey (funciona en todas partes) > token interno (sandbox).
 * La API interna exige header X-Token (probado con curl: sin él responde
 * "missing X-Token header").
 */

export interface ZaiChatArgs {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  thinking?: { type: "enabled" | "disabled" };
  stream?: boolean;
}

export interface ZaiChatResult {
  choices?: { message?: { content?: string | null } }[];
}

/** Adaptador mínimo del endpoint PÚBLICO api.z.ai (OpenAI-compatible) */
class PublicZai {
  constructor(
    private readonly key: string,
    private readonly model: string
  ) {}

  chat = {
    completions: {
      create: async (args: ZaiChatArgs): Promise<ZaiChatResult> => {
        const res = await fetch("https://api.z.ai/api/paas/v4/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.key}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: args.messages,
            stream: false,
            thinking: args.thinking ?? { type: "disabled" },
          }),
          signal: AbortSignal.timeout(45_000),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`api.z.ai ${res.status}: ${body.slice(0, 160)}`);
        }
        return (await res.json()) as ZaiChatResult;
      },
    },
  };
}

export async function createZai(): Promise<
  InstanceType<typeof ZAI> | PublicZai
> {
  const publicKey =
    process.env.ZAI_PUBLIC_KEY?.trim() || ZAI_CONFIG.publicKey.trim();

  if (publicKey) {
    const publicModel =
      process.env.ZAI_PUBLIC_MODEL?.trim() ||
      ZAI_CONFIG.publicModel.trim() ||
      "glm-4.6";
    return new PublicZai(publicKey, publicModel);
  }

  // Credenciales internas (SOLO alcanzan desde la red Z-AI / sandbox)
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
