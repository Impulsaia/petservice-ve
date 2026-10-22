import { NextResponse, after } from "next/server";
import { db, flushDb } from "@/lib/db";
import {
  requireUser,
  sameOriginOrError,
  readJson,
  jsonError,
  cleanText,
  hashPassword,
  verifyPassword,
  isValidEmail,
  passwordProblems,
} from "@/lib/petservice/auth";

/**
 * GET /api/account — perfil del usuario autenticado (cualquier rol).
 * Devuelve los campos editables de la cuenta + datos del negocio si es prestador.
 */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const user = await db.user.findUnique({
    where: { id: auth.id },
    select: {
      id: true, email: true, name: true, phone: true, role: true,
      avatarUrl: true, createdAt: true,
      provider: {
        select: {
          id: true, businessName: true, bio: true, status: true, city: true, zoneName: true,
          avatarUrl: true, instagram: true, facebook: true, tiktok: true, website: true,
          newUntil: true,
        },
      },
    },
  });
  if (!user) return jsonError("Sesión inválida", 401);
  return NextResponse.json({ user });
}

/**
 * PATCH /api/account — actualiza el perfil propio (cliente, prestador o admin).
 * Body (todos opcionales):
 *   { name?, phone?, avatarUrl?, email?, currentPassword?, newPassword? }
 * Reglas:
 *  - Cambiar email requiere currentPassword correcto (si la cuenta tiene clave).
 *  - Cambiar contraseña requiere currentPassword correcto + política mínima.
 *  - avatarUrl admite data URL (≤ ~300 KB, redimensionada en el cliente) o https URL.
 */
export async function PATCH(req: Request) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const body = await readJson<Record<string, unknown>>(req, 600_000);
  if (!body) return jsonError("Solicitud inválida", 400);

  const user = await db.user.findUnique({ where: { id: auth.id } });
  if (!user) return jsonError("Sesión inválida", 401);

  const data: {
    name?: string; phone?: string | null; avatarUrl?: string | null;
    email?: string; passwordHash?: string;
  } = {};

  // ── Perfil básico ──
  if (body.name !== undefined) {
    const name = cleanText(body.name, 60);
    if (name.length < 2) return jsonError("El nombre debe tener al menos 2 caracteres", 400);
    data.name = name;
  }
  if (body.phone !== undefined) {
    const phone = cleanText(body.phone, 20);
    data.phone = phone || null;
  }
  if (body.avatarUrl !== undefined) {
    const av = typeof body.avatarUrl === "string" ? body.avatarUrl.trim() : "";
    if (!av) {
      data.avatarUrl = null;
    } else {
      const isData = av.startsWith("data:image/") && av.length <= 500_000;
      const isHttps = /^https:\/\/\S{1,500}$/.test(av);
      if (!isData && !isHttps) return jsonError("Foto inválida (usa una imagen o URL https)", 400);
      data.avatarUrl = av;
    }
  }

  // ── Cambio de email (requiere clave actual si existe) ──
  if (body.email !== undefined) {
    const email = cleanText(body.email, 120).toLowerCase();
    if (!isValidEmail(email)) return jsonError("Email inválido", 400);
    if (email !== user.email) {
      const hasPassword = Boolean(user.passwordHash);
      if (hasPassword) {
        const cur = typeof body.currentPassword === "string" ? body.currentPassword : "";
        if (!cur || !(await verifyPassword(cur, user.passwordHash))) {
          return jsonError("Para cambiar tu email debes confirmar tu contraseña actual", 403);
        }
      }
      const dup = await db.user.findUnique({ where: { email }, select: { id: true } });
      if (dup && dup.id !== user.id) return jsonError("Ese email ya está registrado por otra cuenta", 409);
      data.email = email;
    }
  }

  // ── Cambio de contraseña (persistente en la base de datos) ──
  if (body.newPassword !== undefined && body.newPassword !== "") {
    const hasPassword = Boolean(user.passwordHash);
    const cur = typeof body.currentPassword === "string" ? body.currentPassword : "";
    if (hasPassword) {
      if (!cur || !(await verifyPassword(cur, user.passwordHash))) {
        return jsonError("La contraseña actual no es correcta", 403);
      }
    }
    const problem = passwordProblems(body.newPassword);
    if (problem) return jsonError(problem, 400);
    data.passwordHash = await hashPassword(String(body.newPassword));
  }

  if (Object.keys(data).length === 0) return jsonError("Nada que actualizar", 400);

  const updated = await db.user.update({
    where: { id: user.id },
    data,
    select: { id: true, email: true, name: true, phone: true, role: true, avatarUrl: true },
  });
  return NextResponse.json({ user: updated });
}
