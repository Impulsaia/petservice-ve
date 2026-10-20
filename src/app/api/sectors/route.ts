import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/sectors?city=Puerto%20Ordaz — sectores activos de una ciudad. Público.
 * cityName es denormalizado: guarda el valor EXACTO de Provider.city.
 *
 * Respuesta: { city, sectors: [{ id, cityName, name, zone, lat, lng }] }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = (searchParams.get("city") ?? "").trim().slice(0, 60);
  if (!city) {
    return NextResponse.json({ error: "Parámetro 'city' requerido" }, { status: 400 });
  }

  const sectors = await db.sector.findMany({
    where: { cityName: city, active: true },
    select: { id: true, cityName: true, name: true, zone: true, lat: true, lng: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ city, sectors });
}
