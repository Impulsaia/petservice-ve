import { db } from "@/lib/db";
import { hashPassword } from "@/lib/petservice/auth";
import { REAL_OSM_ROWS, type RealOsmRow } from "@/lib/petservice/real-osm-data";
import { randomBytes } from "crypto";

/**
 * Negocios REALES de mascotas desde OpenStreetMap (Overpass).
 * - Badge "REAL" ✅ (negocio real, aún sin cuenta propia: teléfono real para WhatsApp)
 * - Precio de sus servicios = 0 → la UI muestra "A consultar" + CTA WhatsApp
 * - Idempotente: dedupe por ciudad + nombre normalizado (también contra los
 *   negocios reales de Bolívar ya importados).
 * - Atribución obligatoria ODbL: "Datos de negocios © OpenStreetMap contributors"
 */

// ───────────────────────── normalización (igual criterio que real-bolivar) ─────────────────────────

const stripAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const norm = (s: string) => stripAccents(s.toLowerCase()).replace(/[^a-z0-9]+/g, " ").trim();

const IGNORE_TOKENS = new Set(["ca", "c a", "srl", "i", "ii", "iii", "pzo"]);
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

// ───────────────────────── horario OSM → scheduleJson ─────────────────────────

const DAY_MAP: Record<string, number> = { Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6, Su: 7 };

function parseOpeningHours(oh: string): string {
  if (!oh) return "{}";
  const full = [["00:00", "23:30"]];
  if (/24\/7|24\s*h|24 horas/i.test(oh)) {
    return JSON.stringify(Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, full])));
  }
  try {
    const result: Record<number, [string, string][]> = {};
    for (const seg of oh.split(";")) {
      const m = seg.trim().match(/^((?:[A-Z][a-z](?:\s*-\s*[A-Z][a-z])?)(?:\s*,\s*[A-Z][a-z](?:\s*-\s*[A-Z][a-z])?)*)\s+(.+)$/);
      if (!m) return "{}";
      const days: number[] = [];
      for (const part of m[1].split(",")) {
        const [a, b] = part.trim().split("-").map((x) => x.trim());
        const da = DAY_MAP[a], dbb = DAY_MAP[b];
        if (da && dbb && dbb > da) { for (let d = da; d <= dbb; d++) days.push(d); }
        else if (da) days.push(da);
      }
      const ranges = m[2]
        .split(",")
        .map((r) => r.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/))
        .filter(Boolean)
        .map((x) => [x![1], x![2]] as [string, string]);
      if (!days.length || !ranges.length) return "{}";
      for (const d of days) result[d] = ranges;
    }
    return Object.keys(result).length ? JSON.stringify(result) : "{}";
  } catch {
    return "{}";
  }
}

// ───────────────────────── servicios según tipo ─────────────────────────

function servicePlanFor(row: RealOsmRow): { category: string; name: string } {
  switch (row.kind) {
    case "VET":
      return { category: "VET", name: "Consulta veterinaria" };
    case "GROOM":
      return { category: "GROOMING", name: "Baño y corte de mascotas" };
    case "BOARD":
      return { category: "PET_SITTING", name: "Hospedaje y cuidado" };
    default:
      return { category: "DELIVERY", name: "Alimentos, accesorios e insumos" };
  }
}

// ───────────────────────── bio ─────────────────────────

const KIND_LABEL: Record<RealOsmRow["kind"], string> = {
  VET: "Veterinaria",
  GROOM: "Peluquería canina",
  SHOP: "Tienda de mascotas",
  BOARD: "Guardería / hospedaje animal",
};

function buildBio(row: RealOsmRow): string {
  const lines: string[] = [];
  lines.push(`✅ Negocio real — ${KIND_LABEL[row.kind]} (OpenStreetMap)`);
  if (row.address) lines.push(`📍 ${row.address} · ${row.city}`);
  if (row.hours) lines.push(`🕐 ${row.hours}`);
  if (row.phones.length) lines.push(`📞 ${row.phones.join(" · ")}`);
  if (row.email) lines.push(`✉️ ${row.email}`);
  if (row.instagram) lines.push(`📸 Instagram: ${row.instagram}`);
  if (row.facebook) lines.push(`📘 Facebook: ${row.facebook}`);
  if (row.tiktok) lines.push(`🎵 TikTok: ${row.tiktok}`);
  if (row.website) lines.push(`🌐 ${row.website}`);
  if (row.rif) lines.push(`🧾 RIF: ${row.rif}`);
  lines.push(`Precio a consultar por WhatsApp.`);
  lines.push(`Fuente: © OpenStreetMap contributors (ODbL).`);
  return lines.join("\n").slice(0, 1200);
}

// ───────────────────────── limpieza de datos ficticios ─────────────────────────

export interface WipeResult { providers: number; users: number; bookings: number; reviews: number; crm: number }

/** Elimina TODO prestador sin badge REAL y sus datos dependientes (demo ficticio). */
export async function wipeFictionalProviders(): Promise<WipeResult> {
  const counts: WipeResult = { providers: 0, users: 0, bookings: 0, reviews: 0, crm: 0 };

  // Reservas / reseñas / pagos (toda la demo histórica)
  counts.reviews = (await db.review.deleteMany({})).count;
  await db.payment.deleteMany({});
  counts.bookings = (await db.booking.deleteMany({})).count;

  // CRM y agenda de los prestadores ficticios
  counts.crm = (await db.crmContact.deleteMany({})).count;
  await db.calendarEvent.deleteMany({});

  // Notificaciones demo
  await db.notification.deleteMany({});

  // Servicios y prestadores ficticios
  await db.service.deleteMany({ where: { provider: { badges: { not: { contains: "REAL" } } } } });
  const del = await db.provider.deleteMany({ where: { badges: { not: { contains: "REAL" } } } });
  counts.providers = del.count;

  // Usuarios prestador huérfanos (sin provider)
  const orphanUsers = await db.user.deleteMany({ where: { role: "PROVIDER", provider: null } });
  counts.users = orphanUsers.count;

  return counts;
}

// ───────────────────────── sincronización OSM ─────────────────────────

export interface OsmSyncResult { created: number; skipped: number; byCity: Record<string, number> }

export async function syncRealOsmBusinesses(log = false): Promise<OsmSyncResult> {
  const cities = await db.city.findMany();
  const cityByName = new Map(cities.map((c) => [norm(c.name), c]));

  const existingProviders = await db.provider.findMany({ select: { businessName: true, city: true, lat: true, lng: true } });
  const existingKeys = new Set(existingProviders.map((p) => `${norm(p.city)}::${dedupeKey(p.businessName)}`));
  const existingEmails = new Set((await db.user.findMany({ select: { email: true } })).map((u) => u.email));

  const result: OsmSyncResult = { created: 0, skipped: 0, byCity: {} };

  for (const row of REAL_OSM_ROWS) {
    const city = cityByName.get(norm(row.city));
    if (!city) { result.skipped++; continue; }

    const key = `${norm(city.name)}::${dedupeKey(row.name)}`;
    // dedupe intra-ciudad Y entre ciudades cercanas (mismo negocio mapeado en
    // ciudad vecina por el bbox, ej. Puerto Ordaz/San Félix)
    const nearDup = existingProviders.find(
      (p) => dedupeKey(p.businessName) === dedupeKey(row.name) && haversineKm(row.lat, row.lng, p.lat, p.lng) < 25
    );
    if (existingKeys.has(key) || nearDup) { result.skipped++; continue; }
    existingKeys.add(key);
    existingProviders.push({ businessName: row.name, city: city.name, lat: row.lat, lng: row.lng });

    // zona: primer segmento útil de la dirección; si no, la ciudad
    const segs = row.address.split(",").map((s) => s.trim()).filter(Boolean);
    const zoneName = (segs.find((s) => s.length >= 3 && s.length <= 28 && !/^\d/.test(s)) ?? city.name).slice(0, 60);

    const slug = row.osmId.replace(/[^a-z0-9]/gi, "").slice(0, 30);
    let email = `negocio.osm${slug}@negocios-reales.ve`;
    if (existingEmails.has(email)) email = `negocio.osm${slug}.${result.created}@negocios-reales.ve`;
    existingEmails.add(email);

    const passwordHash = await hashPassword(randomBytes(24).toString("hex"));
    const user = await db.user.create({
      data: { email, name: row.name.slice(0, 60), phone: row.phones[0] ?? null, role: "PROVIDER", passwordHash },
    });

    const bio = buildBio(row);
    const plan = servicePlanFor(row);

    const provider = await db.provider.create({
      data: {
        userId: user.id,
        businessName: row.name.slice(0, 80),
        bio,
        status: "VERIFIED",
        city: city.name,
        zoneName,
        lat: row.lat,
        lng: row.lng,
        radiusKm: 5,
        scheduleJson: parseOpeningHours(row.hours),
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
        description: `Negocio real de OpenStreetMap${row.address ? ` — ${row.address}` : ""}${row.hours ? `. Horario: ${row.hours}` : ""}. Precio a consultar por WhatsApp (los negocios publicados aún no cargan tarifas en la plataforma).`,
        durationMin: 30,
        priceUsd: 0,
        modality: "PICKUP",
        petTypes: "PERRO,GATO",
      },
    });

    result.created++;
    result.byCity[city.name] = (result.byCity[city.name] ?? 0) + 1;
    if (log) console.log(`✅ ${row.name} — ${city.name}/${zoneName} [${plan.category}] tel:${row.phones[0] ?? "—"}`);
  }

  return result;
}
