import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSessionToken, sessionCookie } from "@/lib/petservice/auth";

/**
 * GET /api/auth/google/callback — completa el flujo OAuth 2.0 de Google.
 *
 * 1. Valida el `state` contra la cookie HttpOnly (anti-CSRF)
 * 2. Intercambia `code` por tokens en oauth2.googleapis.com/token
 * 3. Obtiene el perfil (userinfo) de Google
 * 4. Upsert del User:
 *    - Si el email ya existe → linkea googleId/avatarUrl y MANTIENE su rol
 *    - Si no existe → crea CLIENT activo (sin passwordHash: solo OAuth)
 * 5. Crea sesión HMAC (mismo mecanismo de auth.ts) y redirect a '/'
 *
 * Errores → redirect a '/?loginError=…' (la UI muestra el mensaje).
 */

const OAUTH_STATE_COOKIE = "psve_oauth_state";

function fail(req: Request, code: string, log?: string) {
  if (log) console.warn(`[OAuth Google] ${log}`);
  return NextResponse.redirect(new URL(`/?loginError=${code}`, req.url));
}

export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail(req, "google_no_configurado", "Faltan credenciales en el callback");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const googleError = url.searchParams.get("error");
  if (googleError) return fail(req, "google_cancelado", `Google devolvió error: ${googleError}`);
  if (!code || !state) return fail(req, "google_incompleto", "Faltan code/state en el callback");

  // 1) Anti-CSRF: el state de la cookie debe coincidir con el de Google
  const cookieState = (req.headers.get("cookie") ?? "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${OAUTH_STATE_COOKIE}=`))
    ?.slice(OAUTH_STATE_COOKIE.length + 1);
  if (!cookieState || cookieState !== state) {
    return fail(req, "google_state_invalido", "State inválido (posible CSRF)");
  }

  // 2) Intercambio code → tokens
  const origin = url.origin;
  let accessToken = "";
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      return fail(req, "google_token_error", `Token exchange falló: ${tokenRes.status}`);
    }
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    accessToken = tokenJson.access_token ?? "";
    if (!accessToken) return fail(req, "google_token_error", "Respuesta de token sin access_token");
  } catch (e) {
    return fail(req, "google_token_error", `Excepción en token exchange: ${String(e)}`);
  }

  // 3) Perfil de Google
  let profile: { sub?: string; email?: string; name?: string; picture?: string };
  try {
    const uiRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!uiRes.ok) return fail(req, "google_perfil_error", `Userinfo falló: ${uiRes.status}`);
    profile = (await uiRes.json()) as typeof profile;
  } catch (e) {
    return fail(req, "google_perfil_error", `Excepción en userinfo: ${String(e)}`);
  }

  const googleId = profile.sub ?? "";
  const email = (profile.email ?? "").toLowerCase();
  if (!googleId || !email) return fail(req, "google_perfil_error", "Perfil de Google sin sub/email");

  // 4) Upsert del usuario por email (mantiene rol y datos si ya existía)
  const existing = await db.user.findUnique({ where: { email } });
  let user;
  if (existing) {
    if (!existing.active) return fail(req, "cuenta_desactivada", `Login OAuth de cuenta desactivada: ${email}`);
    user = await db.user.update({
      where: { id: existing.id },
      data: {
        googleId,
        avatarUrl: profile.picture ?? existing.avatarUrl,
        // Sin contraseña local: queda habilitado solo-OAuth a menos que ya tuviera una
      },
    });
    console.log(`[OAuth Google] Cuenta existente linkeada: ${email} (rol ${user.role})`);
  } else {
    user = await db.user.create({
      data: {
        email,
        name: profile.name ?? email.split("@")[0],
        role: "CLIENT",
        googleId,
        avatarUrl: profile.picture ?? null,
        // passwordHash queda "" (vacío = solo OAuth)
      },
    });
    await db.notification.create({
      data: {
        userId: user.id,
        channel: "INAPP",
        template: "BIENVENIDA",
        body: `🐾 ¡Bienvenido a PetService VE, ${user.name.split(" ")[0]}! Explora prestadores verificados cerca de ti.`,
        status: "ENVIADO",
      },
    });
    console.log(`[OAuth Google] Nueva cuenta CLIENT creada vía Google: ${email}`);
  }

  // 5) Sesión HMAC (mismo mecanismo que el login local) + redirect al inicio
  const res = NextResponse.redirect(new URL("/", req.url));
  res.headers.append("Set-Cookie", sessionCookie(createSessionToken(user.id)));
  res.headers.append("Set-Cookie", `${OAUTH_STATE_COOKIE}=; Path=/api/auth/google; HttpOnly; Max-Age=0`);
  return res;
}
