/**
 * Task 32 — Reintento de geocodificación con ANCLAS (sector/C.C./avenida + ciudad).
 * Nominatim falla con direcciones detalladas venezolanas; con "sector, ciudad" acierta.
 * También: corrige ciudad/bio de Agropet Machico, zoneName de TodoPets, crea Tu Veterinario 24,
 * y calibra el centro de las ciudades contra Nominatim.
 * Uso: bun scripts/fix-geo-retry.ts
 */
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync, writeFileSync } from "fs";

const db = new PrismaClient({ datasourceUrl: `file:${process.cwd()}/db/custom.db`, log: ["error"] });
const UA = "PetServiceVE/2.0 (directorio de mascotas; one-time geo fix; contact: impulsaia@gmail.com)";
const CACHE = "/tmp/geo-cache2.json";
const cache: Record<string, { lat: number; lng: number } | null> = existsSync(CACHE)
  ? JSON.parse(readFileSync(CACHE, "utf8"))
  : {};

async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  if (q in cache) return cache[q];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ve");
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    const out = j[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : null;
    cache[q] = out;
    writeFileSync(CACHE, JSON.stringify(cache));
    if (out) console.log(`      ↳ "${q}" → ${out.lat.toFixed(4)},${out.lng.toFixed(4)} (${j[0].display_name.slice(0, 55)})`);
    return out;
  } catch {
    cache[q] = null;
    writeFileSync(CACHE, JSON.stringify(cache));
    return null;
  } finally {
    await new Promise((r) => setTimeout(r, 1150));
  }
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, dLat = ((bLat - aLat) * Math.PI) / 180, dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** nombre → cadena de intentos de ancla */
const RETRIES: { match: string; queries: string[]; fallbackZone?: string }[] = [
  // Barquisimeto (18 previos, pins en centro de ciudad)
  { match: "Centro Veterinario Bqto", queries: ["Barrio Ajuro, Barquisimeto", "Avenida Los Abogados, Barquisimeto"] },
  { match: "VetPlus", queries: ["Barici, Barquisimeto", "Urb. Barici, Barquisimeto"] },
  { match: "Mascotas del Este", queries: ["Urb. Del Este, Barquisimeto", "Carrera 24, Barquisimeto"] },
  { match: "MM Veterinarios", queries: ["Carrera 25, Barquisimeto", "Centro, Barquisimeto"] },
  { match: "Animal Pets", queries: ["Calle 16, Barquisimeto", "Centro, Barquisimeto"] },
  // Maturín
  { match: "Estep Dog House", queries: ["Los Bloques, Maturín"] },
  { match: "Pet Shop Center", queries: ["Tipuro, Maturín", "Centro Comercial Virgen del Valle, Maturín"] },
  { match: "Dra. Jessika Rivas", queries: ["Las Brisas, Maturín", "Avenida Orinoco, Maturín"] },
  { match: "Agro-veterinaria Costa Azul", queries: ["Avenida Juncal, Maturín", "polideportivo, Maturín"] },
  { match: "Mr Guau PetShop", queries: ["C.C. Bello Campo, Maturín", "Tipuro, Maturín"] },
  // Maracaibo
  { match: "Yo Soy Tu Clínica", queries: ["Avenida Circunvalación 2, Maracaibo"] },
  { match: "Hospital Veterinario Maracaibo", queries: ["Campo Creole, Maracaibo", "Calle 67, Maracaibo"] },
  { match: "Hospital Veterinario Delicias Norte", queries: ["Delicias Norte, Maracaibo", "Calle 60, Maracaibo"] },
  { match: "Centro de Urgencia Animal", queries: ["La Rotaria, Maracaibo", "Avenida 81, Maracaibo"] },
  { match: "Centromcbo", queries: ["Avenida Padilla, Maracaibo", "El Centro, Maracaibo"] },
  { match: "Marlene's Grooming", queries: ["Indiomara, Maracaibo", "calle 66, Maracaibo"] },
  // Nuevos PO (Task 32-a)
  { match: "Las Teodokildas", queries: ["Avenida Guarapiche, Puerto Ordaz", "Unare, Puerto Ordaz"] },
  { match: "Urgencias Veterinarias El Rancho", queries: ["Carrera Roma, Puerto Ordaz", "Alta Vista, Puerto Ordaz"], fallbackZone: "Alta Vista Sur" },
  { match: "Bioanimal", queries: ["Villa Betania, Puerto Ordaz"] },
  { match: "Mascotalandia", queries: ["Unare, Puerto Ordaz", "Mercado Municipal, Puerto Ordaz"], fallbackZone: "Unare II / Sierra Parima" },
  { match: "Animal's Center", queries: ["Castillito, Puerto Ordaz", "Calle La Urbana, Puerto Ordaz"] },
  { match: "Coquetitos", queries: ["C.C. Caroní Plaza, Puerto Ordaz", "Alta Vista, Puerto Ordaz"] },
  { match: "Agro & Pets", queries: ["Los Olivos, Puerto Ordaz"] },
  { match: "Guayana Pets", queries: ["C.C. Santo Tomé, Puerto Ordaz", "Redoma La Piña, Puerto Ordaz", "Avenida Guayana, Puerto Ordaz"] },
  { match: "Crazy Pets", queries: ["Orinokia Mall, Puerto Ordaz", "Avenida Guayana, Puerto Ordaz"] },
  { match: "Coco Pet Shop", queries: ["Unare, Puerto Ordaz"] },
  // San Félix / CBO / Upata
  { match: "TodoPets", queries: ["El Roble, San Félix"], fallbackZone: "El Roble" },
  { match: "Servimaskoticas", queries: ["C.C. Don Lucio, Ciudad Bolívar", "Zona Industrial, Ciudad Bolívar"] },
  { match: "La Hacienda LP", queries: ["La Floresta, Upata", "Avenida La Loma, Upata"] },
];

async function main() {
  // ── 0) Calibrar centros de ciudades contra Nominatim ──
  for (const c of ["Barquisimeto", "Maturín", "Maracaibo", "Ciudad Bolívar", "Upata", "Puerto Ordaz", "San Félix"]) {
    const city = await db.city.findFirst({ where: { name: c } });
    if (!city) continue;
    const g = await geocode(`${c}, Venezuela`);
    if (g && haversineKm(city.lat, city.lng, g.lat, g.lng) > 4) {
      console.log(`🏙️  centro ${c}: ${city.lat.toFixed(4)},${city.lng.toFixed(4)} → ${g.lat.toFixed(4)},${g.lng.toFixed(4)}`);
      await db.city.update({ where: { id: city.id }, data: { lat: g.lat, lng: g.lng } });
    }
  }

  // ── 1) Machico: city + bio ──
  const machico = await db.provider.findFirst({ where: { businessName: { contains: "Agropet Machico" } } });
  if (machico && machico.city !== "Puerto Ordaz") {
    await db.provider.update({
      where: { id: machico.id },
      data: {
        city: "Puerto Ordaz",
        zoneName: "Av. Atlántico · C.C. Río Caura",
        bio: (machico.bio ?? "").replace("📍 Avenida Atlántico C.C. Río Caura · San Félix", "📍 Av. Atlántico, C.C. Río Caura · Puerto Ordaz"),
      },
    });
    console.log(`🏙️  Agropet Machico: ciudad San Félix → Puerto Ordaz (C.C. Río Caura está al oeste del Caroní)`);
  }

  // ── 2) TodoPets zoneName limpio ──
  const todopets = await db.provider.findFirst({ where: { businessName: { contains: "TodoPets" } } });
  if (todopets && (todopets.zoneName ?? "").includes(";")) {
    await db.provider.update({ where: { id: todopets.id }, data: { zoneName: "El Roble" } });
    console.log(`📝 TodoPets zoneName → "El Roble"`);
  }

  // ── 3) Reintentos de geocodificación por ancla ──
  for (const r of RETRIES) {
    const p = await db.provider.findFirst({ where: { businessName: { contains: r.match } } });
    if (!p) { console.log(`⚠️ no encontrado: ${r.match}`); continue; }
    let g: { lat: number; lng: number } | null = null;
    for (const q of r.queries) {
      g = await geocode(q);
      if (g) break;
    }
    const updates: { lat?: number; lng?: number; zoneName?: string } = {};
    if (g && haversineKm(p.lat, p.lng, g.lat, g.lng) > 0.3) {
      updates.lat = g.lat;
      updates.lng = g.lng;
    }
    if (r.fallbackZone && p.zoneName !== r.fallbackZone) updates.zoneName = r.fallbackZone;
    if (Object.keys(updates).length) {
      await db.provider.update({ where: { id: p.id }, data: updates });
      console.log(`📍 ${p.businessName}${g ? ` → ${g.lat.toFixed(4)},${g.lng.toFixed(4)}` : ""} ${updates.zoneName ? `· zone "${updates.zoneName}"` : ""}`);
    } else {
      console.log(`↩️  ${p.businessName} sin cambio`);
    }
  }

  // ── 4) Crear Tu Veterinario 24 (Caracas) que falló por lookup de ciudad ──
  const tuvet = await db.provider.findFirst({ where: { businessName: { contains: "Tu Veterinario 24" } } });
  if (!tuvet) {
    const row = JSON.parse(readFileSync("/tmp/new-providers.json", "utf8")).find((x: { name: string }) => x.name.includes("Tu Veterinario 24"));
    if (row) {
      const caracas = await db.city.findFirst({ where: { name: "Caracas" } });
      if (caracas) {
        const g = (await geocode("Colinas de Bello Monte, Caracas")) ?? { lat: caracas.lat, lng: caracas.lng };
        const { hashPassword } = await import("@/lib/petservice/auth");
        const { randomBytes } = await import("crypto");
        const user = await db.user.create({
          data: { email: "negocio32tuvet24@negocios-reales.ve", name: row.name.slice(0, 60), phone: (row.phones ?? [])[0] ?? null, role: "PROVIDER", passwordHash: await hashPassword(randomBytes(24).toString("hex")) },
        });
        const provider = await db.provider.create({
          data: {
            userId: user.id, businessName: "Tu Veterinario 24 (TUVET24)",
            bio: `Veterinaria real verificada · 24 horas\n📍 ${row.address ?? "Colinas de Bello Monte, Caracas"}\n🕐 Abierto 24 horas\n📞 ${(row.phones ?? [])[0] ?? ""}\n${row.instagram ? `📸 Instagram: ${row.instagram}\n` : ""}${row.notes ?? ""}\nFuente verificada: ${Array.isArray(row.sourceRef) ? row.sourceRef[0] : row.sourceRef}`.slice(0, 1400),
            status: "VERIFIED", city: "Caracas", zoneName: "Colinas de Bello Monte",
            lat: g.lat, lng: g.lng, radiusKm: 8, ratingAvg: 0, ratingCount: 0,
            badges: "REAL,VERIFICADO", source: "WEB",
            ...(row.instagram ? { instagram: row.instagram } : {}),
            ...(row.website ? { website: row.website } : {}),
          },
        });
        await db.service.create({
          data: { providerId: provider.id, category: "VET", name: "Consulta veterinaria (24 h)", description: "Atención veterinaria de urgencias y consulta 24 horas. Precio a consultar.", durationMin: 30, priceUsd: 0, modality: "PICKUP", petTypes: "PERRO,GATO" },
        });
        console.log(`✅ Tu Veterinario 24 (TUVET24) — Caracas/Colinas de Bello Monte @ ${g.lat.toFixed(4)},${g.lng.toFixed(4)}`);
      }
    }
  }

  await db.$disconnect();
}

main();
