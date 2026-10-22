import { NextResponse } from "next/server";
import { db, ensureDbReady } from "@/lib/db";
import { haversineKm } from "@/lib/petservice/geo";
import { driveTable } from "@/lib/petservice/routing";

/**
 * GET /api/providers
 * Búsqueda pública de prestadores VERIFICADOS con:
 * - lat/lng/radius → filtro por radio (línea recta, coincide con el círculo del mapa)
 * - driveKm/driveMin → distancia y tiempo REALES de conducción vía OSRM
 *   (el río Caroní convierte "1.7 km recta" en ~25 min de carro: se reporta la verdad)
 * - zone → zona administrativa (municipio/parroquia/ciudad)
 * - category, q, minRating (cuenta Google Maps o reseñas internas), petType, sort
 */
export async function GET(req: Request) {
  await ensureDbReady();
  const { searchParams } = new URL(req.url);
  const num = (v: string | null, min: number, max: number, dflt: number) => {
    // Nota: un param ausente (null/vacío) debe caer al default — Number(null)=0
    // contaminaba lat/lng con 0,0 y el Haversine filtraba TODOS los resultados.
    if (v === null || v.trim() === "") return dflt;
    const n = Number(v);
    return isFinite(n) && n >= min && n <= max ? n : dflt;
  };
  const lat = num(searchParams.get("lat"), -90, 90, NaN);
  const lng = num(searchParams.get("lng"), -180, 180, NaN);
  const radius = num(searchParams.get("radius"), 1, 100, 30);
  const category = searchParams.get("category");
  const q = (searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 80);
  const minRating = num(searchParams.get("minRating"), 0, 5, 0);
  const petType = searchParams.get("petType");
  const onlyVerified = searchParams.get("onlyVerified") !== "false";
  const zone = searchParams.get("zone")?.slice(0, 60) ?? null;
  const sort = searchParams.get("sort") ?? "distance";
  const hasCoords = isFinite(lat) && isFinite(lng);

  const providers = await db.provider.findMany({
    where: onlyVerified ? { status: "VERIFIED" } : {},
    include: { services: { where: { active: true } } },
  });

  const results = providers
    .map((p) => {
      const distanceKm = hasCoords ? haversineKm({ lat, lng }, { lat: p.lat, lng: p.lng }) : null;

      let filtered = p.services;
      if (category) filtered = filtered.filter((s) => s.category === category);
      if (petType) filtered = filtered.filter((s) => s.petTypes.split(",").includes(petType));

      // Match textual: nombre, bio, zona o (si no hay filtros de categoría) servicios
      let textMatch = true;
      if (q) {
        const hay = `${p.businessName} ${p.bio} ${p.zoneName} ${p.city}`.toLowerCase();
        const hayServices = p.services.map((s) => s.name).join(" ").toLowerCase();
        textMatch = hay.includes(q) || (!category && !petType && hayServices.includes(q));
      }

      const visible = category || petType ? filtered : filtered.length ? filtered : p.services;
      const minPriceUsd = visible.length ? Math.min(...visible.map((s) => s.priceUsd)) : null;

      return {
        id: p.id,
        businessName: p.businessName,
        bio: p.bio,
        city: p.city,
        zoneName: p.zoneName,
        lat: p.lat,
        lng: p.lng,
        radiusKm: p.radiusKm,
        ratingAvg: p.ratingAvg,
        ratingCount: p.ratingCount,
        googleRating: p.googleRating,
        googleReviews: p.googleReviews,
        badges: p.badges,
        status: p.status,
        avatarUrl: p.avatarUrl,
        // "Nuevo prestador": etiqueta destacada durante 1 mes desde el registro manual
        isNew: p.newUntil ? p.newUntil.getTime() > Date.now() : false,
        distanceKm,
        driveKm: null as number | null,
        driveMin: null as number | null,
        serviceCount: p.services.length,
        serviceCategories: [...new Set(p.services.map((s) => s.category))],
        minPriceUsd,
        textMatch,
        services: visible.map((s) => ({
          id: s.id,
          category: s.category,
          name: s.name,
          priceUsd: s.priceUsd,
          durationMin: s.durationMin,
          petTypes: s.petTypes,
          petSizes: s.petSizes,
        })),
      };
    })
    .filter((p) => {
      if (!p.textMatch) return false;
      if ((category || petType) && p.services.length === 0) return false;
      // minRating: vale la ficha de Google Maps O las reseñas internas
      if (minRating && Math.max(p.googleRating ?? 0, p.ratingAvg) < minRating) return false;
      if (zone && !`${p.zoneName} ${p.city}`.toLowerCase().includes(zone.toLowerCase())) return false;
      if (hasCoords && p.distanceKm !== null && p.distanceKm > radius) return false;
      return true;
    });

  // Distancias/tiempos de conducción reales (OSRM): solo para los resultados
  // visibles (≤90 → 1 llamada table); si falla, quedan null y la UI muestra
  // la distancia recta rotulada.
  if (hasCoords && results.length > 0) {
    const drive = await driveTable(
      { lat, lng },
      results.slice(0, 90).map((r) => ({ lat: r.lat, lng: r.lng }))
    );
    results.forEach((r, i) => {
      if (i < 90) {
        r.driveKm = drive.km[i];
        r.driveMin = drive.min[i];
      }
    });
  }

  results.sort((a, b) => {
    switch (sort) {
      case "rating":
        return b.ratingAvg - a.ratingAvg;
      case "price_asc":
        return (a.minPriceUsd ?? 1e9) - (b.minPriceUsd ?? 1e9);
      case "price_desc":
        return (b.minPriceUsd ?? -1) - (a.minPriceUsd ?? -1);
      default: {
        // "Más cerca" = menos tiempo de conducción (los usuarios cruzan puentes, no líneas rectas)
        const ka = a.driveMin ?? (a.distanceKm != null ? a.distanceKm * 2.2 : 1e9);
        const kb = b.driveMin ?? (b.distanceKm != null ? b.distanceKm * 2.2 : 1e9);
        return ka - kb;
      }
    }
  });

  return NextResponse.json({
    total: results.length,
    providers: results,
    search: { hasCoords, lat, lng, radius, category, q, zone, drive: results.some((r) => r.driveMin != null) },
  });
}
