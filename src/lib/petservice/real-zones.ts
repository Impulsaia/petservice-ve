import { db } from "@/lib/db";
import { hashPassword } from "@/lib/petservice/auth";
import { REAL_ZONE_ROWS, type RealZoneRow } from "@/lib/petservice/real-zones-data";
import { randomBytes } from "crypto";

/**
 * Sincroniza los negocios REALES de zonas solicitadas por usuarios
 * (Core 8, Gran Sabana, Guamo, Villa Bahía, Río Negro, Minifincas, Toro Muerto,
 * aledañas de San Félix y C. Bolívar). Ver src/lib/petservice/real-zones-data.ts.
 * - Badge "REAL" ✅ + precio "A consultar" (priceUsd=0) + CTA WhatsApp
 * - Idempotente: dedupe por ciudad + nombre normalizado + proximidad <15 km
 */

const stripAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const norm = (s: string) => stripAccents(s.toLowerCase()).replace(/[^a-z0-9]+/g, " ").trim();

const IGNORE_TOKENS = new Set(["ca", "c a", "srl", "el", "de"]);
function dedupeKey(nombre: string): string {
  const tokens = norm(nombre).split(" ").filter((t) => t && !IGNORE_TOKENS.has(t));
  return tokens.slice(0, 3).join(" ");
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, dLat = ((bLat - aLat) * Math.PI) / 180, dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// hash determinista para jitter (mismo negocio → misma posición siempre)
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

const SERVICE_BY_KIND: Record<RealZoneRow["kind"], { category: string; name: string; durationMin: number }> = {
  VET: { category: "VET", name: "Consulta veterinaria", durationMin: 30 },
  TIENDA: { category: "DELIVERY", name: "Alimentos y accesorios", durationMin: 30 },
  GROOMING: { category: "GROOMING", name: "Baño y corte", durationMin: 60 },
};

export interface ZoneSyncResult { created: number; skipped: number; byCity: Record<string, number> }

export async function syncZoneBusinesses(log = false): Promise<ZoneSyncResult> {
  const existingProviders = await db.provider.findMany({ select: { businessName: true, city: true, lat: true, lng: true } });
  const existingKeys = new Set(existingProviders.map((p) => `${norm(p.city)}::${dedupeKey(p.businessName)}`));
  const existingEmails = new Set((await db.user.findMany({ select: { email: true } })).map((u) => u.email));

  const result: ZoneSyncResult = { created: 0, skipped: 0, byCity: {} };

  for (const row of REAL_ZONE_ROWS) {
    const key = `${norm(row.city)}::${dedupeKey(row.name)}`;
    const nearDup = existingProviders.find(
      (p) => dedupeKey(p.businessName) === dedupeKey(row.name) && haversineKm(row.lat, row.lng, p.lat, p.lng) < 15
    );
    if (existingKeys.has(key) || nearDup) { result.skipped++; continue; }
    existingKeys.add(key);
    existingProviders.push({ businessName: row.name, city: row.city, lat: row.lat, lng: row.lng });

    const slug = row.id.replace(/[^a-z0-9]/gi, "").slice(0, 30);
    let email = `negocio.zona${slug}@negocios-reales.ve`;
    if (existingEmails.has(email)) email = `negocio.zona${slug}.${result.created}@negocios-reales.ve`;
    existingEmails.add(email);

    const passwordHash = await hashPassword(randomBytes(24).toString("hex"));
    const user = await db.user.create({
      data: { email, name: row.name.slice(0, 60), phone: row.phones[0] ?? null, role: "PROVIDER", passwordHash },
    });

    // jitter determinista pequeño (evita pines superpuestos) salvo coords geocodificadas
    const jitter = (seed: string, base: number) => (row.conf === "geocode" ? base : base + (hash01(row.id + seed) - 0.5) * 0.004);
    const lat = jitter("lat", row.lat);
    const lng = jitter("lng", row.lng);

    const socialBits = [
      row.instagram ? `Instagram: ${row.instagram}` : null,
      row.facebook ? `Facebook: ${row.facebook}` : null,
    ].filter(Boolean).join(" · ");
    const bio = [
      `Peluquería y servicios para mascotas en ${row.city}. ${row.address}.`,
      row.phones.length ? "Contacto por WhatsApp o llamada." : "Contacto por redes sociales.",
      socialBits ? `${socialBits}.` : null,
      `Fuente: ${row.source}.`,
    ].filter(Boolean).join(" ");

    const plan = SERVICE_BY_KIND[row.kind];
    const provider = await db.provider.create({
      data: {
        userId: user.id,
        businessName: row.name.slice(0, 80),
        bio,
        status: "VERIFIED",
        city: row.city,
        zoneName: row.address.split(",")[0].slice(0, 60),
        lat,
        lng,
        radiusKm: 5,
        scheduleJson: "{}",
        ratingAvg: 0,
        ratingCount: 0,
        badges: "REAL",
      },
    });

    await db.service.create({
      data: {
        providerId: provider.id,
        category: plan.category,
        name: plan.name.slice(0, 80),
        description: `Servicio del negocio real ${row.name} (${row.address}). Precio a consultar por WhatsApp — el negocio aún no publicó tarifas en la plataforma.`,
        durationMin: plan.durationMin,
        priceUsd: 0,
        modality: "PICKUP",
        petTypes: "PERRO,GATO",
      },
    });

    result.created++;
    result.byCity[row.city] = (result.byCity[row.city] ?? 0) + 1;
    if (log) console.log(`✅ ${row.name} — ${row.city} [${plan.category}] tel:${row.phones[0] ?? "—"}`);
  }

  return result;
}
