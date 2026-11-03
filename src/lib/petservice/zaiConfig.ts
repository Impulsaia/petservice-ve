/**
 * Config del LLM (Z-AI) inyectada en TIEMPO DE BUILD por el workflow de CI
 * (.github/workflows/deploy.yml → paso "Inyectar config del LLM").
 *
 * En el repo público este archivo viaja con strings VACÍOS (placeholder).
 * En el runner de GitHub Actions, antes de `vercel build`, CI lo sobrescribe
 * con los valores reales tomados de los secretos ZAI_BASE_URL / ZAI_API_KEY /
 * ZAI_TOKEN. Así los valores viajan dentro del bundle serverless (como hace
 * demoDb.ts con la DB) y el runtime de Vercel NO depende de file-tracing,
 * de archivos externos ni de variables de entorno configuradas a mano.
 *
 * Si un día hay que rotar el token: actualizar el secreto ZAI_TOKEN en
 * GitHub → Settings → Secrets → Actions y redeplegar (o re-run del workflow).
 */
export const ZAI_CONFIG: {
  baseUrl: string;
  apiKey: string;
  token: string;
} = {
  baseUrl: "",
  apiKey: "",
  token: "",
};
