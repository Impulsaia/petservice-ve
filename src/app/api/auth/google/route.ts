import { ensureDbReady } from "@/lib/db";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

/**
 * GET /api/auth/google — inicia el flujo OAuth 2.0 de Google.
 *
 * Sin GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET configurados → redirect a
 * '/?loginError=google_no_configurado' (la UI muestra el aviso).
 *
 * Con credenciales → redirect a accounts.google.com con:
 *  - state aleatorio guardado en cookie HttpOnly (protección CSRF del callback)
 *  - scope: openid email profile
 *  - redirect_uri: <origin>/api/auth/google/callback
 *
 * El state viaja en la cookie `psve_oauth_state` (10 min de vida) y el
 * callback la compara con el parámetro `state` de Google antes de usar el code.
 */

export const OAUTH_STATE_COOKIE = "psve_oauth_state";

export async function GET(req: Request) {
  await ensureDbReady();
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log("[OAuth Google] No configurado: falta GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET");
    return NextResponse.redirect(new URL("/?loginError=google_no_configurado", req.url));
  }

  // State aleatorio anti-CSRF: cookie HttpOnly + comparación en el callback
  const state = randomBytes(16).toString("hex");
  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/auth/google/callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(authUrl.toString());
  // Secure porque el preview/despliegue corre en https (igual que la cookie de sesión)
  res.headers.append(
    "Set-Cookie",
    `${OAUTH_STATE_COOKIE}=${state}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Secure; Max-Age=600`
  );
  return res;
}
