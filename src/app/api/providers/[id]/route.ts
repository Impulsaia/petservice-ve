import { NextResponse } from "next/server";
import { db, ensureDbReady } from "@/lib/db";
import { haversineKm } from "@/lib/petservice/geo";
import { driveTable } from "@/lib/petservice/routing";

/**
 * GET /api/providers/[id] — perfil público completo
 * Servicios con extras, reseñas visibles, horarios. El documento de identidad
 * NUNCA se expone (solo admin lo ve); aquí solo hay datos públicos.
 * Con ?lat=&lng= añade la distancia/tiempo REALES de conducción (OSRM).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureDbReady();
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

  // Distancia de conducción real (si el cliente pasa su ubicación de búsqueda)
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  let drive: { km: number | null; min: number | null; straightKm: number | null } | null = null;
  if (isFinite(lat) && isFinite(lng)) {
    const straightKm = haversineKm({ lat, lng }, { lat: p.lat, lng: p.lng });
    const t = await driveTable({ lat, lng }, [{ lat: p.lat, lng: p.lng }]);
    drive = { km: t.km[0], min: t.min[0], straightKm: +straightKm.toFixed(1) };
  }

  const tagCounts: Record<string, number> = {};
  for (const r of p.reviews) {
    for (const t of r.tags.split(",").filter(Boolean)) {
      tagCounts[t] = (tagCounts[t] ?? 0) + 1;
    }
  }

  // Flujo de "Agenda personalizada" (JSON opcional del prestador).
  // Si el JSON está corrupto se devuelve null para no romper el detalle.
  let bookingFlow: unknown = null;
  if (p.bookingFlowJson) {
    try {
      bookingFlow = JSON.parse(p.bookingFlowJson);
    } catch {
      bookingFlow = null;
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
      googleRating: p.googleRating,
      googleReviews: p.googleReviews,
      badges: p.badges,
      avatarUrl: p.avatarUrl,
      isNew: p.newUntil ? p.newUntil.getTime() > Date.now() : false,
      bookingFlow,
      socials: {
        instagram: p.instagram,
        facebook: p.facebook,
        tiktok: p.tiktok,
        website: p.website,
      },
    },
    services: p.services,
    reviews: p.reviews,
    tagCounts,
    drive,
  });
}
