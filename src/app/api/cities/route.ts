import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/cities — ciudades activas de toda Venezuela + número de prestadores
 * por ciudad (match exacto contra Provider.city). Público.
 *
 * Respuesta: { cities: [{ id, name, state, lat, lng, providerCount }] }
 * Ordenadas: primero por nº de prestadores (desc), luego alfabético.
 */
export async function GET() {
  const [cities, grouped] = await Promise.all([
    db.city.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.provider.groupBy({ by: ["city"], _count: { city: true } }),
  ]);

  const counts = new Map(grouped.map((g) => [g.city, g._count.city]));
  const result = cities
    .map((c) => ({ ...c, providerCount: counts.get(c.name) ?? 0 }))
    .sort((a, b) => b.providerCount - a.providerCount || a.name.localeCompare(b.name, "es"));

  return NextResponse.json({ cities: result, total: result.length });
}
