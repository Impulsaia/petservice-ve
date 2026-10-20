/**
 * PetService VE — Autenticación y seguridad (server-only)
 *
 * Medidas implementadas:
 * - Contraseñas: scrypt con salt aleatorio por usuario + comparación timing-safe
 * - Sesiones: token firmado con HMAC-SHA256 (cookie HttpOnly, SameSite=Strict)
 * - Rate limiting en memoria (sliding window) para login y endpoints públicos
 * - Verificación de Origin en mutaciones (anti-CSRF de profundidad extra)
 * - Límite de tamaño de cuerpo JSON (anti-DoS)
 * - Los tokens nunca se comparan con ==, siempre timingSafeEqual
 */
import { createHmac, randomBytes, scrypt as _scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const scrypt = promisify(_scrypt) as (p: string, s: Buffer, k: number) => Promise<Buffer>;

// ─────────────── Configuración de sesión ───────────────

export const SESSION_COOKIE = "psve_session";
export const SESSION_TTL_S = 60 * 60 * 24 * 7; // 7 días

/** Secreto HMAC: variable de entorno AUTH_SECRET o secreto persistido en db/.auth-secret */
function getSecret(): Buffer {
  if (process.env.AUTH_SECRET) return Buffer.from(process.env.AUTH_SECRET);
  const file = path.join(process.cwd(), "db", ".auth-secret");
  if (existsSync(file)) return Buffer.from(readFileSync(file, "utf8").trim());
  const secret = randomBytes(32).toString("hex");
  writeFileSync(file, secret, { mode: 0o600 });
  return Buffer.from(secret);
}

interface SessionPayload {
  uid: string;
  iat: number;
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url");
}

/** Crea el token de sesión firmado: payloadB64.hmac */
export function createSessionToken(userId: string): string {
  const payload: SessionPayload = {
    uid: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

/** Verifica el token (firma + expiración) de forma timing-safe */
export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(body));
  if (mac.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(mac, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─────────────── Contraseñas ───────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `s2:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, saltB64, hashB64] = stored.split(":");
    if (scheme !== "s2" || !saltB64 || !hashB64) return false;
    const hash = await scrypt(password, Buffer.from(saltB64, "base64"), 64);
    const expected = Buffer.from(hashB64, "base64");
    if (hash.length !== expected.length) return false;
    return timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}

// ─────────────── Rate limiting (sliding window en memoria) ───────────────

const buckets = new Map<string, number[]>();

/** Limpieza periódica para no crecer indefinidamente */
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, hits] of buckets) {
    const alive = hits.filter((t) => now - t < 30 * 60_000);
    if (alive.length === 0) buckets.delete(k);
    else buckets.set(k, alive);
  }
}

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterS: number } {
  const now = Date.now();
  sweep(now);
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const retryAfterS = Math.ceil((windowMs - (now - hits[0])) / 1000);
    buckets.set(key, hits);
    return { ok: false, retryAfterS };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, retryAfterS: 0 };
}

/** IP del cliente (detrás de proxy/gateway usa x-forwarded-for) */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

// ─────────────── Helpers de sesión para las rutas ───────────────

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
}

/** Lee la cookie de sesión y devuelve el usuario (o null). Consulta fresca en DB para rol actual. */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const cookies = req.headers.get("cookie") ?? "";
  const match = cookies.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  const token = decodeURIComponent(match.slice(SESSION_COOKIE.length + 1));
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const user = await db.user.findUnique({ where: { id: payload.uid } });
  // Sin credenciales locales Y sin OAuth → cuenta huérfana.
  // Inactivo → el admin la desactivó: la sesión deja de ser válida al instante.
  if (!user || (!user.passwordHash && !user.googleId) || !user.active) return null;
  return { id: user.id, email: user.email, name: user.name, phone: user.phone, role: user.role };
}

export function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** 401 si no hay sesión */
export async function requireUser(req: Request): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser(req);
  if (!user) return jsonError("Debes iniciar sesión", 401);
  return user;
}

/** 401 sin sesión, 403 si el rol no coincide */
export async function requireRole(req: Request, ...roles: string[]): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser(req);
  if (!user) return jsonError("Debes iniciar sesión", 401);
  if (!roles.includes(user.role)) return jsonError("No tienes permisos para esta acción", 403);
  return user;
}

/**
 * Cookie de sesión segura (HttpOnly + SameSite=None + Secure).
 * - SameSite=None permite que la sesión funcione dentro del preview embebido
 *   (iframe) y en la pestaña independiente; Secure es obligatorio con None.
 * - La protección CSRF NO depende de la cookie: cada mutación verifica el
 *   header Origin contra los hosts de la plataforma (ver sameOriginOrError).
 * - HttpOnly: JavaScript no puede leer el token (anti-XSS exfiltración).
 */
export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${SESSION_TTL_S}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0`;
}

/**
 * Anti-CSRF en mutaciones: si el navegador envía Origin, debe coincidir con
 * alguno de los hosts legítimos por los que se sirve esta app.
 *
 * Tras el gateway del sandbox, el header Host es reescrito (p.ej. a
 * ws-*.fcapp.run) y el dominio público original viaja en headers de la
 * plataforma (abc / x-forwarded-host). Por eso la lista de candidatos incluye:
 *   - Host
 *   - cada valor de X-Forwarded-Host
 *   - el header abc (id del preview) y "<abc>.space-z.ai"
 * Un atacante cross-site no puede falsificar Host/abc (los fija la
 * plataforma), así que su Origin no coincidirá y recibirá 403.
 */
export function sameOriginOrError(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) return null; // curl / tests server-side: sin Origin
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return jsonError("Origen inválido", 403);
  }

  const candidates = new Set<string>();
  const host = req.headers.get("host");
  if (host) candidates.add(host.trim().toLowerCase());
  const xfh = req.headers.get("x-forwarded-host");
  if (xfh) {
    for (const h of xfh.split(",")) {
      const v = h.trim().toLowerCase();
      if (v) candidates.add(v);
    }
  }
  // Header inyectado por la plataforma del sandbox con el prefijo público
  const abc = req.headers.get("abc");
  if (abc) {
    const v = abc.trim().toLowerCase();
    if (v) {
      candidates.add(v);
      candidates.add(`${v}.space-z.ai`);
      candidates.add(`${v}.space-z.ai:443`);
    }
  }

  if (candidates.size === 0) return jsonError("Origen no permitido", 403);
  if (!candidates.has(originHost)) return jsonError("Origen no permitido", 403);
  return null;
}

/**
 * Lee el cuerpo JSON con límite de tamaño (anti-DoS) y devuelve null si es inválido/enorme.
 */
export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 16_384): Promise<T | null> {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > maxBytes) return null;
  try {
    const text = await req.text();
    if (text.length > maxBytes) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ─────────────── Validación de entradas ───────────────

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && email.length <= 254 && EMAIL_RE.test(email);
}

/** Contraseña: mínimo 8 caracteres, al menos una letra y un número */
export function passwordProblems(pw: unknown): string | null {
  if (typeof pw !== "string" || pw.length < 8) return "La contraseña debe tener al menos 8 caracteres";
  if (pw.length > 128) return "La contraseña es demasiado larga (máx. 128)";
  if (!/[a-zA-Z]/.test(pw)) return "La contraseña debe incluir al menos una letra";
  if (!/[0-9]/.test(pw)) return "La contraseña debe incluir al menos un número";
  return null;
}

/** Sanitiza texto libre: recorta y quita caracteres de control */
export function cleanText(v: unknown, maxLen: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maxLen);
}
