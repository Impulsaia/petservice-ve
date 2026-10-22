import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requireUser,
  sameOriginOrError,
  readJson,
  jsonError,
  cleanText,
} from "@/lib/petservice/auth";

const SOCIAL_URL_RE = /^https:\/\/(www\.)?\S{1,300}$/;

/**
 * PATCH /api/provider/profile — el prestador autenticado edita SU negocio:
 * Body (todos opcionales):
 *   { businessName?, bio?, phone?, avatarUrl?, instagram?, facebook?, tiktok?, website? }
 * El teléfono se guarda en User.phone (es el WhatsApp que ve el cliente).
 * No permite cambiar ciudad/zona/coordenadas (eso lo valida el admin).
 */
export async function PATCH(req: Request) {
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "PROVIDER") return jsonError("Solo para prestadores", 403);

  const provider = await db.provider.findUnique({ where: { userId: auth.id } });
  if (!provider) return jsonError("Perfil de prestador no encontrado", 404);

  const body = await readJson<Record<string, unknown>>(req, 600_000);
  if (!body) return jsonError("Solicitud inválida", 400);

  const data: {
    businessName?: string; bio?: string; avatarUrl?: string | null;
    instagram?: string | null; facebook?: string | null; tiktok?: string | null; website?: string | null;
  } = {};

  if (body.businessName !== undefined) {
    const bn = cleanText(body.businessName, 80);
    if (bn.length < 3) return jsonError("El nombre del negocio debe tener al menos 3 caracteres", 400);
    data.businessName = bn;
  }
  if (body.bio !== undefined) {
    data.bio = cleanText(body.bio, 600);
  }
  if (body.avatarUrl !== undefined) {
    const av = typeof body.avatarUrl === "string" ? body.avatarUrl.trim() : "";
    if (!av) data.avatarUrl = null;
    else {
      const isData = av.startsWith("data:image/") && av.length <= 500_000;
      const isHttps = /^https:\/\/\S{1,500}$/.test(av);
      if (!isData && !isHttps) return jsonError("Foto inválida (usa una imagen o URL https)", 400);
      data.avatarUrl = av;
    }
  }

  for (const key of ["instagram", "facebook", "tiktok", "website"] as const) {
    if (body[key] !== undefined) {
      const v = typeof body[key] === "string" ? (body[key] as string).trim() : "";
      if (!v) { data[key] = null; continue; }
      // Acepta usuario @handle o URL completa; normaliza a URL
      let val = v;
      if (key !== "website" && v.startsWith("@")) val = `https://${key}.com/${v.slice(1)}`;
      if (!SOCIAL_URL_RE.test(val)) return jsonError(`Enlace de ${key} inválido (usa URL https o @usuario)`, 400);
      if (val.length > 300) return jsonError(`Enlace de ${key} demasiado largo`, 400);
      data[key] = val;
    }
  }

  const phoneWanted = body.phone !== undefined;
  const phone = phoneWanted ? cleanText(body.phone, 20) : null;

  if (Object.keys(data).length === 0 && !phoneWanted) return jsonError("Nada que actualizar", 400);

  const [updated, updatedUser] = await db.$transaction([
    db.provider.update({
      where: { id: provider.id },
      data,
      select: {
        id: true, businessName: true, bio: true, avatarUrl: true,
        instagram: true, facebook: true, tiktok: true, website: true,
      },
    }),
    phoneWanted
      ? db.user.update({ where: { id: auth.id }, data: { phone: phone || null }, select: { phone: true } })
      : db.user.findUnique({ where: { id: auth.id }, select: { phone: true } }),
  ]);

  return NextResponse.json({ provider: { ...updated, phone: updatedUser?.phone ?? null } });
}
