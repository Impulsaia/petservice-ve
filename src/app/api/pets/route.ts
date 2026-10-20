import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, sameOriginOrError, readJson, cleanText } from "@/lib/petservice/auth";

/** GET /api/pets — mascotas del cliente autenticado */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const pets = await db.pet.findMany({ where: { ownerId: auth.id }, orderBy: { name: "asc" } });
  return NextResponse.json({ pets });
}

/** POST /api/pets — registra una mascota del cliente autenticado */
export async function POST(req: Request) {
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "CLIENT") return NextResponse.json({ error: "Solo los clientes registran mascotas" }, { status: 403 });

  const body = await readJson<Record<string, unknown>>(req, 4096);
  if (!body) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });

  const name = cleanText(body.name, 40);
  const species = cleanText(body.species, 10).toUpperCase() || "PERRO";
  const size = cleanText(body.size, 2).toUpperCase() || "M";
  if (name.length < 1) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  if (!["PERRO", "GATO", "OTRO"].includes(species)) return NextResponse.json({ error: "Especie inválida" }, { status: 400 });
  if (!["S", "M", "L"].includes(size)) return NextResponse.json({ error: "Tamaño inválido" }, { status: 400 });

  const pet = await db.pet.create({
    data: {
      ownerId: auth.id,
      name,
      species,
      size,
      breed: body?.breed ? cleanText(body.breed, 40) : null,
      notes: body?.notes ? cleanText(body.notes, 200) : null,
    },
  });
  return NextResponse.json({ pet }, { status: 201 });
}
