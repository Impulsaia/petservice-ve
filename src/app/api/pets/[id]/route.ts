import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, sameOriginOrError, readJson, jsonError, cleanText } from "@/lib/petservice/auth";

const SPECIES = ["PERRO", "GATO", "AVE", "ROEDOR", "OTRO"];
const SIZES = ["S", "M", "L"];
const GENDERS = ["MACHO", "HEMBRA", "N/D"];

/**
 * PATCH /api/pets/[id] — edita la mascota del cliente autenticado (anti-IDOR).
 * Campos: name, species, size, breed, notes, birthDate, weightKg, gender.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const pet = await db.pet.findUnique({ where: { id } });
  // 404 sin filtrar existencia si no es dueño (anti-IDOR)
  if (!pet || pet.ownerId !== auth.id) return jsonError("Mascota no encontrada", 404);

  const body = await readJson<Record<string, unknown>>(req, 4096);
  if (!body) return jsonError("Solicitud inválida", 400);

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = cleanText(body.name, 40);
    if (name.length < 1) return jsonError("El nombre es obligatorio", 400);
    data.name = name;
  }
  if (body.species !== undefined) {
    const species = cleanText(body.species, 10).toUpperCase();
    if (!SPECIES.includes(species)) return jsonError(`Especie inválida. Usa: ${SPECIES.join(", ")}`, 400);
    data.species = species;
  }
  if (body.size !== undefined) {
    const size = cleanText(body.size, 2).toUpperCase();
    if (!SIZES.includes(size)) return jsonError("Tamaño inválido. Usa S, M o L", 400);
    data.size = size;
  }
  if (body.breed !== undefined) data.breed = body.breed ? cleanText(body.breed, 40) : null;
  if (body.notes !== undefined) data.notes = body.notes ? cleanText(body.notes, 200) : null;
  if (body.birthDate !== undefined) {
    if (body.birthDate === null || body.birthDate === "") {
      data.birthDate = null;
    } else {
      const bd = cleanText(body.birthDate, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bd)) return jsonError("birthDate inválida (usa YYYY-MM-DD)", 400);
      const d = new Date(`${bd}T00:00:00.000Z`);
      if (Number.isNaN(d.getTime()) || d > new Date()) return jsonError("birthDate no puede ser futura", 400);
      data.birthDate = d;
    }
  }
  if (body.weightKg !== undefined) {
    if (body.weightKg === null || body.weightKg === "") {
      data.weightKg = null;
    } else {
      const w = Number(body.weightKg);
      if (!Number.isFinite(w) || w < 0 || w > 200) return jsonError("weightKg debe estar entre 0 y 200", 400);
      data.weightKg = Math.round(w * 100) / 100;
    }
  }
  if (body.gender !== undefined) {
    const gender = body.gender ? cleanText(body.gender, 8).toUpperCase() : null;
    if (gender && !GENDERS.includes(gender)) return jsonError(`gender debe ser: ${GENDERS.join(", ")}`, 400);
    data.gender = gender;
  }

  if (Object.keys(data).length === 0) return jsonError("Nada que actualizar", 400);

  const updated = await db.pet.update({ where: { id }, data });
  return NextResponse.json({ pet: updated });
}

/**
 * DELETE /api/pets/[id] — elimina la mascota del cliente autenticado.
 * Si tiene reservas asociadas se rechaza el borrado (integridad histórica).
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const pet = await db.pet.findUnique({
    where: { id },
    include: { _count: { select: { bookings: true } } },
  });
  if (!pet || pet.ownerId !== auth.id) return jsonError("Mascota no encontrada", 404);

  if (pet._count.bookings > 0) {
    return jsonError(
      `${pet.name} tiene ${pet._count.bookings} reserva(s) en su historial y no puede eliminarse. Edita sus datos si lo necesitas.`,
      409
    );
  }

  await db.pet.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
