import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/providers/[id] — perfil público completo
 * Servicios con extras, reseñas visibles, horarios. El documento de identidad
 * NUNCA se expone (solo admin lo ve); aquí solo hay datos públicos.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await db.provider.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, phone: true } },
      services: { where: { active: true }, orderBy: { priceUsd: "asc" } },
      reviews: {
        where: { hidden: false },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
  if (!p) return NextResponse.json({ error: "Prestador no encontrado" }, { status: 404 });

  const tagCounts: Record<string, number> = {};
  for (const r of p.reviews) {
    for (const t of r.tags.split(",").filter(Boolean)) {
      tagCounts[t] = (tagCounts[t] ?? 0) + 1;
    }
  }

  return NextResponse.json({
    provider: {
      id: p.id,
      businessName: p.businessName,
      ownerName: p.user.name,
      phone: p.user.phone,
      bio: p.bio,
      status: p.status,
      city: p.city,
      zoneName: p.zoneName,
      lat: p.lat,
      lng: p.lng,
      radiusKm: p.radiusKm,
      scheduleJson: p.scheduleJson,
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
      badges: p.badges,
    },
    services: p.services,
    reviews: p.reviews,
    tagCounts,
  });
}
