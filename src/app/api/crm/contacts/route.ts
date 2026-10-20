import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, sameOriginOrError, readJson, jsonError, cleanText } from "@/lib/petservice/auth";
import { getProviderOf } from "@/lib/petservice/server";

const CONTACT_STATUSES = ["NUEVO", "ACTIVO", "VIP", "INACTIVO"];
const CONTACT_SOURCES = ["MANUAL", "RESERVA"];

/**
 * GET /api/crm/contacts — contactos CRM del prestador autenticado.
 * Query: ?q=texto&status=VIP&source=RESERVA&sort=recent|name|visits|spent
 * Respuesta: { contacts: [...], stats: { total, activos, vip, ingresos, nuevos30d } }
 */
export async function GET(req: Request) {
  const auth = await requireRole(req, "PROVIDER");
  if (auth instanceof NextResponse) return auth;

  const provider = await getProviderOf(auth.id);
  if (!provider) return jsonError("Perfil de prestador no encontrado", 404);

  const { searchParams } = new URL(req.url);
  const q = cleanText(searchParams.get("q"), 60);
  const status = cleanText(searchParams.get("status"), 12).toUpperCase();
  const source = cleanText(searchParams.get("source"), 10).toUpperCase();
  const sort = cleanText(searchParams.get("sort"), 12) || "recent";

  const where: Record<string, unknown> = { providerId: provider.id };
  if (CONTACT_STATUSES.includes(status)) where.status = status;
  if (CONTACT_SOURCES.includes(source)) where.source = source;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { phone: { contains: q } },
      { email: { contains: q } },
      { petName: { contains: q } },
      { notes: { contains: q } },
    ];
  }

  const orderBy =
    sort === "name" ? { name: "asc" as const }
    : sort === "visits" ? { totalVisits: "desc" as const }
    : sort === "spent" ? { totalSpentUsd: "desc" as const }
    : { lastVisitAt: "desc" as const };

  const contacts = await db.crmContact.findMany({ where, orderBy, take: 300 });

  // Stats sobre TODOS los contactos del prestador (no solo los filtrados)
  const all = await db.crmContact.findMany({
    where: { providerId: provider.id },
    select: { status: true, totalSpentUsd: true, createdAt: true },
  });
  const hace30d = new Date(Date.now() - 30 * 24 * 3600_000);
  const stats = {
    total: all.length,
    activos: all.filter((c) => c.status === "ACTIVO").length,
    vip: all.filter((c) => c.status === "VIP").length,
    ingresos: Math.round(all.reduce((a, c) => a + c.totalSpentUsd, 0) * 100) / 100,
    nuevos30d: all.filter((c) => c.createdAt >= hace30d).length,
  };

  return NextResponse.json({ contacts, stats });
}

/**
 * POST /api/crm/contacts — crea un contacto manual (sin cuenta en la plataforma).
 * Body: { name, phone?, email?, petName?, petType?, notes?, status? }
 */
export async function POST(req: Request) {
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "PROVIDER");
  if (auth instanceof NextResponse) return auth;

  const provider = await getProviderOf(auth.id);
  if (!provider) return jsonError("Perfil de prestador no encontrado", 404);

  const body = await readJson<Record<string, unknown>>(req, 8192);
  if (!body) return jsonError("Solicitud inválida", 400);

  const name = cleanText(body.name, 80);
  if (name.length < 2) return jsonError("El nombre del contacto es obligatorio", 400);
  const phone = body.phone ? cleanText(body.phone, 24) : null;
  if (phone && !/^[+0-9 ()-]{7,24}$/.test(phone)) return jsonError("Teléfono inválido (ej: +58 412 555 0000)", 400);
  const email = body.email ? cleanText(body.email, 254) : null;

  const status = body.status ? cleanText(body.status, 12).toUpperCase() : "NUEVO";
  if (!CONTACT_STATUSES.includes(status)) return jsonError(`Status debe ser: ${CONTACT_STATUSES.join(", ")}`, 400);

  // Evita duplicados evidentes: mismo prestador + mismo nombre + mismo teléfono
  if (phone) {
    const dup = await db.crmContact.findFirst({ where: { providerId: provider.id, name, phone } });
    if (dup) return jsonError("Ya existe un contacto con ese nombre y teléfono", 409);
  }

  const contact = await db.crmContact.create({
    data: {
      providerId: provider.id,
      name,
      phone,
      email,
      petName: body.petName ? cleanText(body.petName, 40) : null,
      petType: body.petType ? cleanText(body.petType, 20) : null,
      notes: body.notes ? cleanText(body.notes, 500) : null,
      status,
      source: "MANUAL",
    },
  });
  return NextResponse.json({ contact }, { status: 201 });
}
