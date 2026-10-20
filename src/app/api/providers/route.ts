import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { haversineKm } from "@/lib/petservice/geo";

/**
 * GET /api/providers
 * Búsqueda pública de prestadores VERIFICADOS con:
 * - lat/lng/radius → filtro por radio y orden por cercanía (Haversine, sin PostGIS)
 * - zone → zona administrativa (municipio/parroquia/ciudad)
 * - category, q, minRating, petType, sort
 */
export async function GET(req: Request) {
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
        badges: p.badges,
        status: p.status,
        distanceKm,
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
      if (minRating && p.ratingAvg < minRating) return false;
      if (zone && !`${p.zoneName} ${p.city}`.toLowerCase().includes(zone.toLowerCase())) return false;
      if (hasCoords && p.distanceKm !== null && p.distanceKm > radius) return false;
      return true;
    });

  results.sort((a, b) => {
    switch (sort) {
      case "rating":
        return b.ratingAvg - a.ratingAvg;
      case "price_asc":
        return (a.minPriceUsd ?? 1e9) - (b.minPriceUsd ?? 1e9);
      case "price_desc":
        return (b.minPriceUsd ?? -1) - (a.minPriceUsd ?? -1);
      default: {
        const da = a.distanceKm ?? 1e9;
        const dbb = b.distanceKm ?? 1e9;
        return da - dbb;
      }
    }
  });

  return NextResponse.json({
    total: results.length,
    providers: results,
    search: { hasCoords, lat, lng, radius, category, q, zone },
  });
}
