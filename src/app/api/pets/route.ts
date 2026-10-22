import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, sameOriginOrError, readJson, jsonError, cleanText } from "@/lib/petservice/auth";

const SPECIES = ["PERRO", "GATO", "AVE", "ROEDOR", "OTRO"];
const SIZES = ["S", "M", "L"];
const GENDERS = ["MACHO", "HEMBRA", "N/D"];

/** GET /api/pets — mascotas del cliente autenticado */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const pets = await db.pet.findMany({ where: { ownerId: auth.id }, orderBy: { name: "asc" } });
  return NextResponse.json({ pets });
}

/**
 * POST /api/pets — registra una mascota del cliente autenticado.
 * Body: { name, species, size, breed?, notes?, birthDate?, weightKg?, gender? }
 */
export async function POST(req: Request) {
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "CLIENT") return NextResponse.json({ error: "Solo los clientes registran mascotas" }, { status: 403 });

  const body = await readJson<Record<string, unknown>>(req, 600_000);
  if (!body) return jsonError("Solicitud inválida", 400);

  const name = cleanText(body.name, 40);
  const species = cleanText(body.species, 10).toUpperCase() || "PERRO";
  const size = cleanText(body.size, 2).toUpperCase() || "M";
  if (name.length < 1) return jsonError("El nombre es obligatorio", 400);
  if (!SPECIES.includes(species)) return jsonError(`Especie inválida. Usa: ${SPECIES.join(", ")}`, 400);
  if (!SIZES.includes(size)) return jsonError("Tamaño inválido. Usa S, M o L", 400);

  let birthDate: Date | null = null;
  if (body.birthDate) {
    const bd = cleanText(body.birthDate, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bd)) return jsonError("birthDate inválida (usa YYYY-MM-DD)", 400);
    birthDate = new Date(`${bd}T00:00:00.000Z`);
    if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) return jsonError("birthDate no puede ser futura", 400);
  }
  let weightKg: number | null = null;
  if (body.weightKg !== undefined && body.weightKg !== null && body.weightKg !== "") {
    const w = Number(body.weightKg);
    if (!Number.isFinite(w) || w < 0 || w > 200) return jsonError("weightKg debe estar entre 0 y 200", 400);
    weightKg = Math.round(w * 100) / 100;
  }
  const gender = body.gender ? cleanText(body.gender, 8).toUpperCase() : null;
  if (gender && !GENDERS.includes(gender)) return jsonError(`gender debe ser: ${GENDERS.join(", ")}`, 400);

  const pet = await db.pet.create({
    data: {
      ownerId: auth.id,
      name,
      species,
      size,
      breed: body?.breed ? cleanText(body.breed, 40) : null,
      notes: body?.notes ? cleanText(body.notes, 500) : null,
      medicalNotes: body?.medicalNotes ? cleanText(body.medicalNotes, 1000) : null,
      photoUrl:
        typeof body?.photoUrl === "string" && body.photoUrl
          ? (body.photoUrl.startsWith("data:image/") || /^https:\/\//.test(body.photoUrl)) && body.photoUrl.length <= 500_000
            ? body.photoUrl
            : null
          : null,
      birthDate,
      weightKg,
      gender,
    },
  });
  return NextResponse.json({ pet }, { status: 201 });
}
