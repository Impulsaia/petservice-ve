import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, cleanText } from "@/lib/petservice/auth";

/**
 * GET /api/admin/services — todos los servicios del marketplace con filtros.
 * Query: ?providerId=…&category=GROOMING&city=San%20Félix&active=true
 *        &q=texto&priceMin=5&priceMax=50
 * Respuesta: { services: [...con provider {businessName, city}], total }
 */
export async function GET(req: Request) {
  const auth = await requireRole(req, "ADMIN");
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const providerId = cleanText(searchParams.get("providerId"), 40);
  const category = cleanText(searchParams.get("category"), 20).toUpperCase();
  const city = cleanText(searchParams.get("city"), 60);
  const active = searchParams.get("active");
  const q = cleanText(searchParams.get("q"), 60);
  // Solo aplicar el filtro si el parámetro viene presente (Number("") = 0 causaba lte:0 → 0 resultados)
  const priceMinRaw = searchParams.get("priceMin");
  const priceMaxRaw = searchParams.get("priceMax");
  const priceMin = priceMinRaw !== null && priceMinRaw !== "" ? Number(priceMinRaw) : null;
  const priceMax = priceMaxRaw !== null && priceMaxRaw !== "" ? Number(priceMaxRaw) : null;

  const where: Record<string, unknown> = {};
  if (providerId) where.providerId = providerId;
  if (["GROOMING", "DELIVERY", "PET_SITTING", "DOG_WALKING", "TRAINING", "PET_TAXI", "SPA_MOVIL", "VET"].includes(category)) {
    where.category = category;
  }
  if (city) where.provider = { is: { city } };
  if (active === "true") where.active = true;
  if (active === "false") where.active = false;
  if (priceMin !== null || priceMax !== null) {
    where.priceUsd = {
      ...(priceMin !== null && Number.isFinite(priceMin) ? { gte: priceMin } : {}),
      ...(priceMax !== null && Number.isFinite(priceMax) ? { lte: priceMax } : {}),
    };
  }
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { description: { contains: q } },
      { provider: { is: { businessName: { contains: q } } } },
    ];
  }

  const services = await db.service.findMany({
    where,
    include: {
      provider: { select: { id: true, businessName: true, city: true, zoneName: true, status: true } },
      _count: { select: { bookings: true } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: 300,
  });

  return NextResponse.json({ services, total: services.length });
}
