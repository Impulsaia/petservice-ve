import { NextResponse, after } from "next/server";
import { db, flushDb } from "@/lib/db";
import { requireRole, sameOriginOrError, readJson, jsonError, cleanText } from "@/lib/petservice/auth";
import { getProviderOf } from "@/lib/petservice/server";
import { normalizeTagsInput, fetchTagsByProvider, writeTags } from "../contact-tags";

const CONTACT_STATUSES = ["NUEVO", "ACTIVO", "VIP", "INACTIVO"];
const CONTACT_SOURCES = ["MANUAL", "RESERVA"];

/**
 * GET /api/crm/contacts — contactos CRM del prestador autenticado.
 * Query: ?q=texto&status=VIP&source=RESERVA&sort=recent|name|visits|spent
 * La búsqueda q también cubre las etiquetas (tags coma-separadas).
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
  // q NO va en el `where`: `tags` es columna nueva y el client en memoria puede ser
  // anterior (Unknown argument). Se busca en JS tras traer los contactos (case-insensitive,
  // incluye etiquetas). Ver contact-tags.ts.

  const orderBy =
    sort === "name" ? { name: "asc" as const }
    : sort === "visits" ? { totalVisits: "desc" as const }
    : sort === "spent" ? { totalSpentUsd: "desc" as const }
    : { lastVisitAt: "desc" as const };

  const rows = await db.crmContact.findMany({ where, orderBy, take: 300 });
  // tags se lee por SQL crudo (columna nueva — ver contact-tags.ts)
  const tagsById = await fetchTagsByProvider(provider.id);
  const needle = q.toLowerCase();
  const contacts = rows
    .map((c) => ({ ...c, tags: tagsById.get(c.id) ?? "" }))
    .filter((c) =>
      !needle ||
      [c.name, c.phone, c.email, c.petName, c.notes, c.tags]
        .some((v) => (v ?? "").toLowerCase().includes(needle))
    );

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
 * Body: { name, phone?, email?, petName?, petType?, notes?, status?, tags? }
 * tags: string coma-separado (se normaliza: trim, máx 8 etiquetas de 60 chars, dedupe).
 */
export async function POST(req: Request) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
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

  const tags = normalizeTagsInput(body.tags);
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
  // tags va por SQL crudo (columna nueva — ver contact-tags.ts)
  await writeTags(contact.id, tags);
  return NextResponse.json({ contact: { ...contact, tags } }, { status: 201 });
}
