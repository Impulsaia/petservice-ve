import { NextResponse, after } from "next/server";
import { db, flushDb } from "@/lib/db";
import { requireRole, sameOriginOrError, readJson, jsonError, cleanText } from "@/lib/petservice/auth";

const ZONES = ["CENTRO", "NORTE", "SUR", "ESTE", "OESTE"];

/**
 * GET /api/admin/sectors?city=… — sectores (admin ve todo, con inactivos).
 * Sin ?city devuelve todas las ciudades agrupadas.
 */
export async function GET(req: Request) {
  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const city = cleanText(searchParams.get("city"), 60);

  const sectors = await db.sector.findMany({
    where: city ? { cityName: city } : {},
    orderBy: [{ cityName: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ sectors, total: sectors.length });
}

/**
 * POST /api/admin/sectors — crea un sector en una ciudad existente del catálogo.
 * Body: { cityName, name, zone?, lat?, lng? }
 */
export async function POST(req: Request) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  const body = await readJson<Record<string, unknown>>(req, 4096);
  if (!body) return jsonError("Solicitud inválida", 400);

  const cityName = cleanText(body.cityName, 60);
  const name = cleanText(body.name, 60);
  if (!cityName || !name) return jsonError("cityName y name son obligatorios", 400);

  const city = await db.city.findFirst({ where: { name: cityName } });
  if (!city) return jsonError("La ciudad no existe en el catálogo (créala primero o usa un nombre exacto de City)", 404);

  const zone = body.zone ? cleanText(body.zone, 10).toUpperCase() : "CENTRO";
  if (!ZONES.includes(zone)) return jsonError(`Zone debe ser: ${ZONES.join(", ")}`, 400);

  let lat: number | null = null;
  let lng: number | null = null;
  if (body.lat !== undefined && body.lat !== null && body.lat !== "") {
    const n = Number(body.lat);
    if (!Number.isFinite(n) || n < -90 || n > 90) return jsonError("lat inválida", 400);
    lat = n;
  }
  if (body.lng !== undefined && body.lng !== null && body.lng !== "") {
    const n = Number(body.lng);
    if (!Number.isFinite(n) || n < -180 || n > 180) return jsonError("lng inválida", 400);
    lng = n;
  }

  const dup = await db.sector.findUnique({ where: { cityName_name: { cityName, name } } });
  if (dup) return jsonError("Ya existe un sector con ese nombre en esa ciudad", 409);

  const sector = await db.sector.create({ data: { cityName, name, zone, lat, lng } });
  return NextResponse.json({ sector }, { status: 201 });
}
