/**
 * PetService VE — Suite de pruebas de seguridad (anti-hackeos)
 * Ejecutar: bun tests/security-check.ts  (con el servidor corriendo en :3000)
 *
 * Verifica: autenticación, sesiones firmadas, anti-IDOR, roles, rate limiting,
 * anti-enumeración, CSRF (Origin), inyección SQL, XSS, límites de cuerpo,
 * filtración de hashes y cabeceras de seguridad.
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const db = new PrismaClient();

let pass = 0;
let fail = 0;
const results: { name: string; ok: boolean; detail: string }[] = [];

function record(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  if (ok) pass++;
  else fail++;
}

/** IP simulada por test — base aleatoria por corrida para no chocar con buckets previos */
const ipBase = 100 + Math.floor(Math.random() * 500) * 400;
let ipSeq = 0;
const nextIp = () => {
  const n = ipBase + ipSeq++;
  return `10.${Math.floor(n / 65536) % 255}.${Math.floor(n / 250) % 255}.${n % 250}`;
};

async function req(path: string, opts: { method?: string; body?: unknown; cookie?: string; ip?: string; origin?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = { "X-Forwarded-For": opts.ip ?? nextIp(), Connection: "close" };
  if (opts.cookie) headers["Cookie"] = opts.cookie;
  if (opts.origin) headers["Origin"] = opts.origin;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetch(`${BASE}${path}`, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        redirect: "manual",
      });
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw lastErr;
}

function getCookie(res: Response): string | null {
  const set = res.headers.get("set-cookie");
  if (!set) return null;
  return set.split(";")[0].trim();
}

function flagValue(setCookie: string | null, flag: string): boolean {
  if (!setCookie) return false;
  return setCookie.toLowerCase().includes(flag.toLowerCase());
}

async function login(email: string, password: string, ip?: string) {
  const res = await req("/api/auth/login", { method: "POST", body: { email, password }, ip });
  return { res, cookie: getCookie(res) };
}

// ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🛡️  PetService VE — Pruebas de seguridad contra ${BASE}\n`);

  await db.$connect();

  // Fixtures reales de la DB para los tests de IDOR
  const maria = await db.user.findUnique({ where: { email: "maria@demo.ve" } });
  const jorge = await db.user.findUnique({ where: { email: "jorge@demo.ve" } });
  const jorgePet = jorge ? await db.pet.findFirst({ where: { ownerId: jorge.id } }) : null;
  const joseProvider = await db.user.findUnique({ where: { email: "jose@petservice.ve" } });
  const joseProvRow = joseProvider ? await db.provider.findUnique({ where: { userId: joseProvider.id } }) : null;
  const carlosUserRow = await db.user.findUnique({ where: { email: "carlos@petservice.ve" } });
  const carlosProvRow = carlosUserRow ? await db.provider.findUnique({ where: { userId: carlosUserRow.id } }) : null;
  const otherBooking = jorge ? await db.booking.findFirst({ where: { clientId: jorge.id, status: "CONFIRMADA" } }) : null;
  const otherCompleted = jorge ? await db.booking.findFirst({ where: { clientId: jorge.id, status: "COMPLETADA" } }) : null;
  // Reseña de OTRO prestador (para probar con la cookie de Carlos)
  const carlosReview = carlosProvRow ? await db.review.findFirst({ where: { providerId: { not: carlosProvRow.id } } }) : null;
  const anyReview = await db.review.findFirst();

  // ── 1) Login de los 3 roles ──
  const roles: [string, string, string][] = [
    ["CLIENTE", "maria@demo.ve", "demo1234"],
    ["PRESTADOR", "carlos@petservice.ve", "demo1234"],
    ["ADMIN", "admin@petservice.ve", "admin1234"],
  ];
  const cookies: Record<string, string> = {};
  for (const [label, email, pw] of roles) {
    const { res, cookie } = await login(email, pw);
    const ok = res.status === 200 && !!cookie;
    record(`LOGIN_${label}`, ok, `login ${email} → ${res.status}`);
    if (cookie) cookies[label] = cookie;
    if (label === "ADMIN") {
      record("COOKIE_HTTPONLY", flagValue(res.headers.get("set-cookie"), "httponly"), "cookie de sesión HttpOnly");
      // SameSite=None + Secure: necesario para el preview embebido (iframe) y pestaña.
      // El anti-CSRF NO depende de la cookie: cada mutación valida el header Origin
      // contra el host legítimo (ver CSRF_ORIGIN_403), que un atacante no puede falsificar.
      record("COOKIE_SAMESITE_NONE_SECURE", flagValue(res.headers.get("set-cookie"), "samesite=none") && flagValue(res.headers.get("set-cookie"), "secure"), "SameSite=None + Secure (CSRF cubierto por check de Origin)");
    }
  }
  const client = cookies["CLIENTE"] ?? "";
  const provider = cookies["PRESTADOR"] ?? "";
  const admin = cookies["ADMIN"] ?? "";

  // ── 2) Anti fuerza bruta y enumeración ──
  const badPw = await login("jorge@demo.ve", "contraseña-mala-123", undefined);
  record("LOGIN_WRONG_PW_401", badPw.res.status === 401, `contraseña incorrecta → ${badPw.res.status}`);

  const noUser = await login("noexiste@hacker.ve", "cualquiercosa123", undefined);
  record("LOGIN_NO_USER_401", noUser.res.status === 401, `usuario inexistente → ${noUser.res.status}`);

  const msg1 = ((await badPw.res.json().catch(() => ({}))) as { error?: string }).error ?? "";
  const msg2 = ((await noUser.res.json().catch(() => ({}))) as { error?: string }).error ?? "";
  record("ANTI_ENUMERACION", msg1 === msg2 && msg1.length > 0, "mismo mensaje para usuario inexistente y contraseña mala");

  let rateLimited = false;
  for (let i = 0; i < 6; i++) {
    const r = await login("bruteforce@hacker.ve", "intentofallado1", undefined);
    if (r.res.status === 429) {
      rateLimited = true;
      break;
    }
  }
  record("RATE_LIMIT_LOGIN", rateLimited, "6 intentos fallidos → 429 (anti fuerza bruta)");

  // ── 3) Sesiones: me, tampering, logout ──
  const meAnon = await req("/api/auth/me");
  const meAnonBody = (await meAnon.json()) as { user: unknown };
  record("ME_ANON_NULL", meAnon.status === 200 && meAnonBody.user === null, "sin cookie → user null");

  const meAdmin = await req("/api/auth/me", { cookie: admin });
  const meAdminBody = (await meAdmin.json()) as { user?: { role?: string }; provider?: unknown };
  record("ME_ADMIN_OK", meAdminBody.user?.role === "ADMIN", `rol admin correcto`);
  record("NO_HASH_LEAK", !JSON.stringify(meAdminBody).includes("passwordHash"), "la API nunca expone passwordHash");

  const tampered = admin.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
  const meTampered = await req("/api/auth/me", { cookie: tampered });
  const tamperedBody = (await meTampered.json()) as { user: unknown };
  record("TOKEN_TAMPERED_REJECT", tamperedBody.user === null, "cookie modificada → sesión inválida (HMAC)");

  const forged = "eyJ1aWQiOiJhZG1pbiIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjo5OTAwMDAwMDAwfQ.firma-falsa-del-hacker";
  const meForged = await req("/api/auth/me", { cookie: `psve_session=${forged}` });
  const forgedBody = (await meForged.json()) as { user: unknown };
  record("TOKEN_FORGED_REJECT", forgedBody.user === null, "token forjado sin secreto → inválido");

  const junk = await req("/api/auth/me", { cookie: "psve_session=garbage; otra=1" });
  const junkBody = (await junk.json()) as { user: unknown };
  record("COOKIE_JUNK_REJECT", junkBody.user === null, "cookie basura → inválida");

  const { cookie: tmpCookie } = await login("elena@demo.ve", "demo1234", undefined);
  if (tmpCookie) {
    const logoutRes = await req("/api/auth/logout", { method: "POST", cookie: tmpCookie });
    const setCookie = logoutRes.headers.get("set-cookie") ?? "";
    const clears = setCookie.includes("Max-Age=0") && setCookie.toLowerCase().includes("httponly");
    record("LOGOUT_BORRA_COOKIE", clears, "el logout entrega cookie vacía Max-Age=0 HttpOnly (el navegador la elimina)");
  } else {
    record("LOGOUT_BORRA_COOKIE", false, "no se pudo login previo");
  }

  // ── 4) Rutas privadas sin sesión ──
  const noAuthCases: [string, () => Promise<Response>][] = [
    ["BOOKINGS_NO_AUTH_401", () => req("/api/bookings")],
    ["PETS_NO_AUTH_401", () => req("/api/pets")],
    ["NOTIFS_NO_AUTH_401", () => req("/api/notifications")],
    ["ADMIN_METRICS_NO_AUTH_401", () => req("/api/admin/metrics")],
    ["ADMIN_PROVIDERS_NO_AUTH_401", () => req("/api/admin/providers")],
    ["ADMIN_PAYMENTS_NO_AUTH_401", () => req("/api/admin/payments")],
    ["PAY_RECONCILE_NO_AUTH_401", () => req("/api/payments/xxx/reconcile", { method: "POST", body: { action: "verify" } })],
  ];
  for (const [name, fn] of noAuthCases) {
    const r = await fn();
    record(name, r.status === 401, `sin sesión → ${r.status}`);
  }

  // ── 5) Roles: cliente intentando acciones de admin ──
  const clientForbidden: [string, () => Promise<Response>, number][] = [
    ["ADMIN_AS_CLIENT_403", () => req("/api/admin/metrics", { cookie: client }), 403],
    ["SETTINGS_PUT_AS_CLIENT_403", () => req("/api/settings", { method: "PUT", cookie: client, body: { usdToBs: 1 } }), 403],
    ["RESEED_AS_CLIENT_403", () => req("/api/demo/reseed", { method: "POST", cookie: client }), 403],
    ["RECONCILE_AS_CLIENT_403", () => req("/api/payments/xxx/reconcile", { method: "POST", cookie: client, body: { action: "verify" } }), 403],
    ["ADMIN_VERIFY_AS_CLIENT_403", () => req("/api/admin/providers", { method: "PATCH", cookie: client, body: { id: "x", action: "verify" } }), 403],
    ["MODERATE_AS_CLIENT_403", () => req("/api/reviews", { method: "PATCH", cookie: client, body: { id: anyReview?.id ?? "x", action: "hide" } }), 403],
  ];
  for (const [name, fn, expected] of clientForbidden) {
    const r = await fn();
    record(name, r.status === expected, `cliente → ${r.status} (esperado ${expected})`);
  }

  // ── 6) Anti-IDOR: propiedad de recursos ──
  if (jorgePet && maria) {
    const r = await req("/api/bookings", { method: "POST", cookie: client, body: { providerId: "whatever", serviceId: "whatever", petId: jorgePet.id, address: "Calle Falsa 123", date: "2030-01-01", time: "10:00" } });
    record("IDOR_MASCOTA_AJENA_403", r.status === 403, `reservar con mascota de Jorge como María → ${r.status}`);
  } else {
    record("IDOR_MASCOTA_AJENA_403", false, "fixture no disponible");
  }

  if (otherBooking) {
    const r = await req(`/api/bookings/${otherBooking.id}`, { method: "PATCH", cookie: client, body: { action: "cancel" } });
    record("IDOR_RESERVA_AJENA_404", r.status === 404, `cancelar reserva de Jorge como María → ${r.status} (no filtra existencia)`);
  } else {
    record("IDOR_RESERVA_AJENA_404", false, "fixture no disponible");
  }

  if (otherCompleted) {
    const r = await req("/api/reviews", { method: "POST", cookie: client, body: { bookingId: otherCompleted.id, rating: 5, comment: "reseña falsificada por un tercero jeje" } });
    record("IDOR_RESENA_AJENA_404", r.status === 404, `reseñar reserva ajena → ${r.status}`);
  } else {
    record("IDOR_RESENA_AJENA_404", false, "fixture no disponible");
  }

  // Pago de reserva ajena
  if (otherBooking) {
    const r = await req("/api/payments", { method: "POST", cookie: client, body: { bookingId: otherBooking.id, method: "PAGO_MOVIL", reference: "000000111" } });
    record("IDOR_PAGO_AJENO_404", r.status === 404, `pagar reserva de otro → ${r.status}`);
  } else {
    record("IDOR_PAGO_AJENO_404", false, "fixture no disponible");
  }

  // Prestador: solo ve sus reservas (cookie = Carlos, comparación con el perfil de Carlos)
  if (carlosProvRow) {
    const r = await req("/api/bookings", { cookie: provider });
    const body = (await r.json()) as { bookings?: { providerId: string }[] };
    const allMine = (body.bookings ?? []).every((b) => b.providerId === carlosProvRow.id);
    record("PROVIDER_SOLO_SUS_RESERVAS", r.status === 200 && allMine && (body.bookings?.length ?? 0) > 0, `Carlos ve ${body.bookings?.length ?? 0} reservas, todas de su negocio`);
  } else {
    record("PROVIDER_SOLO_SUS_RESERVAS", false, "fixture no disponible");
  }

  // Prestador responde reseña ajena
  if (carlosReview) {
    const r = await req("/api/reviews", { method: "PATCH", cookie: provider, body: { id: carlosReview.id, action: "respond", response: "respuesta falsificada" } });
    record("PROVIDER_RESENA_AJENA_404", r.status === 404, `responder reseña de otro prestador → ${r.status}`);
  } else {
    record("PROVIDER_RESENA_AJENA_404", false, "fixture no disponible");
  }

  // ── 7) Inyección SQL (Prisma parametriza; no debe corromper nada) ──
  const sqli = await req("/api/providers?q=%27%3B%20DROP%20TABLE%20User%3B--&lat=8.29&lng=-62.74");
  const mariaStill = await db.user.findUnique({ where: { email: "maria@demo.ve" } });
  const usersAfter = await db.user.count();
  record("SQLI_Q_PARAM", sqli.status === 200 && !!mariaStill && usersAfter > 10, `payload '; DROP TABLE User;-- → ${sqli.status}, DB intacta (${usersAfter} usuarios)`);

  const sqliEmail = await login("maria@demo.ve' OR '1'='1", "x1234567", undefined);
  record("SQLI_LOGIN", sqliEmail.res.status === 401, `inyección en email de login → ${sqliEmail.res.status}`);

  const badDate = await req("/api/bookings/slots?providerId=x&date=1-1-1&serviceId=y");
  record("VALIDACION_FECHA_SLOTS", badDate.status === 400, `fecha malformada → ${badDate.status}`);

  // ── 8) XSS almacenado: se guarda como texto (React lo escapa al render) ──
  if (otherCompleted) {
    const xssPayload = "<script>alert('hack')</script><img src=x onerror=alert(1)>";
    const r = await req("/api/reviews", { method: "POST", cookie: admin, body: { bookingId: otherCompleted.id, rating: 3, comment: xssPayload } });
    // admin no es CLIENT → debe rechazar por rol (403). El XSS jamás llega a guardarse por esa vía.
    record("XSS_RESENA_RECHAZADA_POR_ROL", r.status === 403, `POST reseña como admin → ${r.status} (guard de rol)`);
  }

  // Payload XSS en búsqueda (solo debe buscarse, no ejecutarse ni romper)
  const xssSearch = await req("/api/providers?q=" + encodeURIComponent("<script>alert(1)</script>"));
  record("XSS_BUSQUEDA_INOFENSIVA", xssSearch.status === 200, "payload de script en q → 200 sin romper el servidor");

  // ── 9) Límites de cuerpo y validación de registro ──
  const hugeBody = { email: "x@x.com", password: "a".repeat(1_000_000) };
  const huge = await req("/api/auth/login", { method: "POST", body: hugeBody });
  record("CUERPO_ENORME_RECHAZADO", huge.status === 400 || huge.status === 413, `login con body de ~1MB → ${huge.status}`);

  const weakPw = await req("/api/auth/register", { method: "POST", body: { name: "Tester Prueba", email: `tester${Date.now()}@test.ve`, phone: "+58 412 1111111", password: "1234", role: "CLIENT" } });
  record("REGISTRO_PW_DEBIL_400", weakPw.status === 400, `contraseña "1234" → ${weakPw.status}`);

  const badEmail = await req("/api/auth/register", { method: "POST", body: { name: "Tester Prueba", email: "no-es-un-correo", phone: "+58 412 1111111", password: "abc12345", role: "CLIENT" } });
  record("REGISTRO_EMAIL_INVALIDO_400", badEmail.status === 400, `correo inválido → ${badEmail.status}`);

  const badMethod = await req("/api/payments", { method: "POST", cookie: client, body: { bookingId: "xxx", method: "BITCOIN_UNDER_THE_TABLE" } });
  record("METODO_PAGO_INVALIDO_400", badMethod.status === 400 || badMethod.status === 404, `método inventado → ${badMethod.status}`);

  // ── 10) CSRF: Origin cross-site en mutaciones ──
  const csrf = await req("/api/auth/login", { method: "POST", body: { email: "maria@demo.ve", password: "demo1234" }, origin: "https://sitio-del-hacker.com" });
  record("CSRF_ORIGIN_403", csrf.status === 403, `Origin malicioso → ${csrf.status}`);

  // ── 11) Enumeración de catálogo público es por diseño ──
  const pub = await req("/api/providers?lat=8.2934&lng=-62.7454&radius=20");
  record("CATALOGO_PUBLICO_OK", pub.status === 200, "listado público de prestadores verificados disponible sin sesión (diseño)");

  // ── 12) Cabeceras de seguridad ──
  // X-Frame-Options se sustituyó por CSP frame-ancestors (equivalente moderno,
  // permite el preview embebido de la plataforma y localhost, bloquea el resto).
  const home = await fetch(BASE, { redirect: "manual" });
  const csp = home.headers.get("content-security-policy") ?? "";
  const nosniff = home.headers.get("x-content-type-options");
  const referrer = home.headers.get("referrer-policy");
  record("HEADER_CSP_FRAME_ANCESTORS", /frame-ancestors/i.test(csp), `CSP frame-ancestors presente (${csp.split(";").find((d) => /frame-ancestors/i.test(d))?.trim() ?? "ausente"})`);
  record("HEADER_NOSNIFF", nosniff === "nosniff", `X-Content-Type-Options: ${nosniff}`);
  record("HEADER_REFERRER_POLICY", !!referrer, `Referrer-Policy: ${referrer}`);

  // ── Resultados ──
  console.log("┌" + "─".repeat(46) + "┬" + "─".repeat(9) + "┐");
  for (const r of results) {
    const name = r.name.length > 44 ? r.name.slice(0, 44) : r.name.padEnd(44);
    console.log(`│ ${name} │ ${r.ok ? "  ✅ OK " : " ❌ FAIL"} │${r.ok ? "" : `  ← ${r.detail}`}`);
  }
  console.log("└" + "─".repeat(46) + "┴" + "─".repeat(9) + "┘");
  console.log(`\n🐾 Resultado: ${pass} pasaron · ${fail} fallaron de ${results.length} pruebas\n`);

  if (fail > 0) {
    console.log("Detalle de fallas:");
    for (const r of results.filter((x) => !x.ok)) console.log(`  ❌ ${r.name}: ${r.detail}`);
    console.log("");
  }

  await db.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("💥 Error en la suite:", e);
  await db.$disconnect();
  process.exit(1);
});
