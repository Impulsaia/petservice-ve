import { NextResponse, after } from "next/server";
import { db, flushDb } from "@/lib/db";
import { requireRole, sameOriginOrError, readJson, jsonError, cleanText } from "@/lib/petservice/auth";

/**
 * PATCH /api/admin/sectors/[id] — edita un sector (nombre, parroquia, coords, active).
 * `zone` guarda la PARROQUIA del sector (texto libre validado por la UI).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const sector = await db.sector.findUnique({ where: { id } });
  if (!sector) return jsonError("Sector no encontrado", 404);

  const body = await readJson<Record<string, unknown>>(req, 4096);
  if (!body) return jsonError("Solicitud inválida", 400);

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = cleanText(body.name, 60);
    if (name.length < 2) return jsonError("El nombre debe tener al menos 2 caracteres", 400);
    // Unicidad (cityName, name)
    const dup = await db.sector.findUnique({ where: { cityName_name: { cityName: sector.cityName, name } } });
    if (dup && dup.id !== id) return jsonError("Ya existe otro sector con ese nombre en esa ciudad", 409);
    data.name = name;
  }
  if (body.zone !== undefined) {
    const zone = cleanText(body.zone, 60);
    if (!zone) return jsonError("La parroquia (zone) no puede quedar vacía", 400);
    data.zone = zone;
  }
  if (body.lat !== undefined) {
    if (body.lat === null || body.lat === "") data.lat = null;
    else {
      const n = Number(body.lat);
      if (!Number.isFinite(n) || n < -90 || n > 90) return jsonError("lat inválida", 400);
      data.lat = n;
    }
  }
  if (body.lng !== undefined) {
    if (body.lng === null || body.lng === "") data.lng = null;
    else {
      const n = Number(body.lng);
      if (!Number.isFinite(n) || n < -180 || n > 180) return jsonError("lng inválida", 400);
      data.lng = n;
    }
  }
  if (body.active !== undefined) data.active = Boolean(body.active);

  const updated = await db.sector.update({ where: { id }, data });
  return NextResponse.json({ sector: updated });
}

/** DELETE /api/admin/sectors/[id] — elimina un sector (los eventos no lo referencian) */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const sector = await db.sector.findUnique({ where: { id } });
  if (!sector) return jsonError("Sector no encontrado", 404);

  await db.sector.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
