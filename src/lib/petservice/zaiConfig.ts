/**
 * Config del LLM (Z-AI) inyectada en TIEMPO DE BUILD por el workflow de CI
 * (.github/workflows/deploy.yml → paso "Inyectar config del LLM").
 *
 * En el repo público este archivo viaja con strings VACÍOS (placeholder).
 * En el runner de GitHub Actions, antes de `vercel build`, CI lo sobrescribe
 * con los valores reales tomados de los secretos ZAI_BASE_URL / ZAI_API_KEY /
 * ZAI_TOKEN / ZAI_PUBLIC_KEY. Así los valores viajan dentro del bundle
 * serverless (como hace demoDb.ts con la DB) y el runtime de Vercel NO depende
 * de file-tracing, de archivos externos ni de variables de entorno a mano.
 *
 * ── Por qué hay DOS credenciales ──────────────────────────────────────────
 * 1. token (JWT interno): sirve SOLO dentro de la red Z-AI/Aliyun — el host
 *    internal-api.z.ai resuelve a IPs privadas (172.25.x.x) inalcanzables
 *    desde AWS/Vercel ("TypeError: fetch failed"). Funciona en el sandbox.
 * 2. publicKey (clave sk- de la plataforma pública https://api.z.ai):
 *    alcanzable desde cualquier red — ES la que debe estar activa en
 *    producción. Si está vacía, la IA funciona en modo básico determinista
 *    (FAQ) sin LLM.
 *
 * Si hay que rotar la clave pública: actualizar el secreto ZAI_PUBLIC_KEY en
 * GitHub → Settings → Secrets → Actions y re-run del workflow de deploy.
 */
export const ZAI_CONFIG: {
  baseUrl: string;
  apiKey: string;
  token: string;
  publicKey: string;
  publicModel: string;
} = {
  baseUrl: "",
  apiKey: "",
  token: "",
  publicKey: "",
  publicModel: "",
};
