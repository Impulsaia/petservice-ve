/**
 * PetService VE — Corrección de precisión geográfica (Task 32).
 *
 * 1) EXPLICIT: coordenadas verificadas (OSM Plaza/C.C. vía Nominatim + research 32-a)
 * 2) GEOCODE: geocodifica la dirección de la bio (📍) vía Nominatim (1.1 req/s, caché)
 * 3) IMPORTA: 24 prestadores nuevos de /tmp/new-providers.json (research 32-a) con geocodificación
 *
 * Uso: bun scripts/fix-geo-accuracy.ts
 * Luego: bun scripts/gen-demo-db.ts
 */
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync, writeFileSync } from "fs";

const db = new PrismaClient({ datasourceUrl: `file:${process.cwd()}/db/custom.db`, log: ["error"] });

// ───────────────────────── Nominatim (con caché) ─────────────────────────

const UA = "PetServiceVE/2.0 (directorio de mascotas; one-time geo fix; contact: impulsaia@gmail.com)";
const CACHE = "/tmp/geo-cache.json";
const cache: Record<string, { lat: number; lng: number } | null> = existsSync(CACHE)
  ? JSON.parse(readFileSync(CACHE, "utf8"))
  : {};

async function geocode(q: string, viewbox?: string): Promise<{ lat: number; lng: number } | null> {
  const key = `${q}|${viewbox ?? ""}`;
  if (key in cache) return cache[key];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ve");
  if (viewbox) url.searchParams.set("viewbox", viewbox);
  url.searchParams.set("bounded", viewbox ? "1" : "0");
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { lat: string; lon: string }[];
    const out = j[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : null;
    cache[key] = out;
    writeFileSync(CACHE, JSON.stringify(cache));
    return out;
  } catch (e) {
    console.log(`   ⚠️ geocode falló (${q}): ${e instanceof Error ? e.message : e}`);
    return null;
  } finally {
    await new Promise((r) => setTimeout(r, 1150)); // política 1 req/s
  }
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, dLat = ((bLat - aLat) * Math.PI) / 180, dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// ───────────────────────── 1) Fixes explícitos ─────────────────────────

// Coordenadas verificadas: C.C. Villa Alianza, Plaza Chipia, C.C. La Churuata,
// C.C. Sierra Parima (Nominatim/OSM), ancla Core 8 (Task 28).
const EXPLICIT: { match: string; lat: number; lng: number; zone?: string; city?: string; note: string }[] = [
  { match: "Firulais Spa PZO", lat: 8.30355, lng: -62.71989, zone: "Villa Alianza", note: "C.C. Villa Alianza, Av. Estados Unidos (Nominatim/OSM)" },
  { match: "Furulais PZO", lat: 8.30355, lng: -62.71989, zone: "Villa Alianza", note: "mismo negocio real que Firulais Spa (dueño): Villa Alianza" },
  { match: "Estilos Kninos", lat: 8.28612, lng: -62.72298, zone: "La Churuata", note: "C.C./Conjunto La Churuata, Alta Vista (Nominatim + FB)" },
  { match: "Kninos & Felinos", lat: 8.28728, lng: -62.71571, note: "frente a Plaza Chipia (Nominatim/OSM)" },
  { match: "Agropecuaria Todo Animal", lat: 8.25033, lng: -62.80267, zone: "Sierra Parima", note: "C.C. Sierra Parima (Nominatim/OSM)" },
  { match: "El Perolero Core 8", lat: 8.22855, lng: -62.82539, zone: "Core 8", note: "ancla Core 8/Urb. Gran Sabana verificada en Task 28" },
  { match: "G-A Experiencias Animales", lat: 8.3475, lng: -62.6471, zone: "San Félix", note: "sin sector verificado: pin a nivel de ciudad (estaba en la orilla equivocada del Caroní)" },
];

// ───────────────────────── 2) Geocodificación por dirección ─────────────────────────

interface GeoFix { match: string; query: string; fallback: { lat: number; lng: number }; zone?: string; city?: string; note: string }
const GEO_FIXES: GeoFix[] = [
  { match: "Dra. Iginia Márquez", query: "Calle Sicilia, Los Olivos, Puerto Ordaz", fallback: { lat: 8.2856, lng: -62.714 }, zone: "Los Olivos", note: "Calle Sicilia Local 24 (infoguia)" },
  { match: "Agropeluquería N.R.", query: "Guanaguanare, Bella Vista, San Félix", fallback: { lat: 8.3475, lng: -62.6471 }, zone: "Bella Vista", note: "Av. Principal Guanaguanare (AiYellow)" },
  { match: "Agro Avícola Chirica", query: "Nueva Chirica, San Félix", fallback: { lat: 8.3475, lng: -62.6471 }, zone: "Nueva Chirica", note: "Av. Manuel Piar × Calle El Tablazo (Cylex/infoguia)" },
  { match: "Agropet Machico", query: "C.C. Río Caura, Av. Atlántico, Puerto Ordaz", fallback: { lat: 8.2667, lng: -62.7594 }, zone: "Av. Atlántico", city: "Puerto Ordaz", note: "C.C. Río Caura está en Av. Atlántico (Puerto Ordaz), NO en San Félix" },
  { match: "Colitas Pet House", query: "Yara Yara, Puerto Ordaz", fallback: { lat: 8.2692, lng: -62.7557 }, note: "Av. Atlántico, Yara Yara 2 (bio) — solo refinar coords" },
  { match: "Hogar Temporal Patitas a Salvo", query: "Urb. Caura, Puerto Ordaz", fallback: { lat: 8.2735, lng: -62.7245 }, note: "Urb. Caura junto al Polideportivo Venalum" },
  { match: "Santuario Luna", query: "Vía Tazón, Maitana, Miranda", fallback: { lat: 10.44, lng: -66.94 }, note: "Vía Tazón (área metropolitana Caracas)" },
];

/** 18 importados por investigación: la bio tiene la 📍 dirección real */
async function geocodeBioProviders() {
  const providers = await db.provider.findMany({ where: { source: "WEB", city: { in: ["Barquisimeto", "Maturín", "Maracaibo"] } } });
  const out: { name: string; lat: number; lng: number; dKm: number }[] = [];
  for (const p of providers) {
    const pin = (p.bio ?? "").split("\n").find((l) => l.includes("📍"))?.replace("📍", "").trim();
    if (!pin) continue;
    // Limpia prefijos de zona tipo "Zona: "
    const q = `${pin.replace(/^Zona:\s*/i, "")}, ${p.city}, Venezuela`;
    const g = await geocode(q);
    if (!g) continue;
    const dKm = haversineKm(p.lat, p.lng, g.lat, g.lng);
    if (dKm < 0.15) continue; // ya correcto
    await db.provider.update({ where: { id: p.id }, data: { lat: g.lat, lng: g.lng } });
    out.push({ name: p.businessName, lat: g.lat, lng: g.lng, dKm });
    console.log(`📍 ${p.businessName} → ${g.lat.toFixed(4)},${g.lng.toFixed(4)} (antes a ${(dKm).toFixed(1)} km)`);
  }
  return out;
}

// ───────────────────────── 3) Importar los 24 nuevos ─────────────────────────

interface NewRow {
  name: string; category: string; city: string; state: string; zone: string | null; address: string | null;
  phones: string[]; instagram: string | null; facebook: string | null; website: string | null;
  hours: string | null; sourceRef: string | string[]; notes: string;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function primaryPhone(phones: string[]): string | null {
  const mobile = phones.find((p) => p.replace(/\D/g, "").startsWith("04"));
  const pick = mobile ?? phones[0];
  if (!pick) return null;
  const d = pick.replace(/\D/g, "");
  if (/^04\d{9}$/.test(d)) return `+58 ${d.slice(1, 4)}-${d.slice(4)}`; // 0426-2694094 → +58 426-2694094
  if (/^58(4\d{9})$/.test(d)) return `+58 ${d.slice(2, 5)}-${d.slice(5)}`;
  return pick.trim();
}

function planFor(category: string): { category: string; name: string } {
  switch (category) {
    case "VETERINARIA":
    case "EMERGENCY_24H":
      return { category: "VET", name: "Consulta veterinaria" };
    case "GROOMING":
      return { category: "GROOMING", name: "Baño y corte de mascotas" };
    default:
      return { category: "DELIVERY", name: "Alimentos, accesorios e insumos" };
  }
}

function buildBio(row: NewRow): string {
  const lines: string[] = [];
  lines.push(row.category === "VETERINARIA" || row.category === "EMERGENCY_24H" ? "Veterinaria real verificada" : row.category === "GROOMING" ? "Peluquería canina real verificada" : "Tienda de mascotas real verificada");
  if (row.address) lines.push(`📍 ${row.address}`);
  else if (row.zone) lines.push(`📍 Zona: ${row.zone}`);
  if (row.hours) lines.push(`🕐 ${row.hours}`);
  const phone = primaryPhone(row.phones ?? []);
  if (phone) lines.push(`📞 ${phone}`);
  const others = (row.phones ?? []).filter((p) => p !== phone);
  if (others.length) lines.push(`☎️ Otros teléfonos: ${others.join(" · ")}`);
  if (row.instagram) lines.push(`📸 Instagram: ${row.instagram}`);
  if (row.facebook) lines.push(`📘 Facebook: ${row.facebook}`);
  if (row.website) lines.push(`🌐 ${row.website}`);
  if (row.notes) lines.push(row.notes);
  const refs = Array.isArray(row.sourceRef) ? row.sourceRef : [row.sourceRef];
  if (refs[0]) lines.push(`Fuente verificada: ${refs[0]}`);
  return lines.join("\n").slice(0, 1400);
}

async function importNew() {
  const rows: NewRow[] = JSON.parse(readFileSync("/tmp/new-providers.json", "utf8"));
  const cities = await db.city.findMany();
  const cityByKey = new Map(cities.map((c) => [norm(`${c.name} ${c.state}`), c]));
  const existing = await db.provider.findMany({ select: { businessName: true, city: true } });
  const existingKeys = new Set(existing.map((p) => `${norm(p.city)}::${norm(p.businessName).slice(0, 24)}`));
  const existingEmails = new Set((await db.user.findMany({ select: { email: true } })).map((u) => u.email));

  let created = 0, skipped = 0;
  for (const row of rows) {
    const city = cityByKey.get(norm(`${row.city} ${row.state ?? ""}`)) ?? cityByKey.get(norm(row.city));
    if (!city) { console.log(`⚠️ Ciudad no encontrada: ${row.name} (${row.city})`); skipped++; continue; }
    const key = `${norm(city.name)}::${norm(row.name).slice(0, 24)}`;
    if (existingKeys.has(key)) { console.log(`↩️  Ya existe: ${row.name}`); skipped++; continue; }
    existingKeys.add(key);

    // Coordenadas: geocodifica la dirección; fallback centro de ciudad
    let lat = city.lat, lng = city.lng;
    if (row.address) {
      const g = await geocode(`${row.address}, ${city.name}, Venezuela`);
      if (g) { lat = g.lat; lng = g.lng; }
    }
    const slug = norm(row.name).replace(/ /g, "").slice(0, 24);
    let email = `negocio32${slug}@negocios-reales.ve`;
    if (existingEmails.has(email)) email = `negocio32${slug}.${created}@negocios-reales.ve`;
    existingEmails.add(email);
    const { hashPassword } = await import("@/lib/petservice/auth");
    const { randomBytes } = await import("crypto");
    const user = await db.user.create({
      data: { email, name: row.name.slice(0, 60), phone: primaryPhone(row.phones ?? []), role: "PROVIDER", passwordHash: await hashPassword(randomBytes(24).toString("hex")) },
    });
    const plan = planFor(row.category);
    const provider = await db.provider.create({
      data: {
        userId: user.id,
        businessName: row.name.slice(0, 80),
        bio: buildBio(row),
        status: "VERIFIED",
        city: city.name,
        zoneName: (row.zone ?? row.address ?? city.name).slice(0, 60),
        lat, lng,
        radiusKm: 8,
        ratingAvg: 0, ratingCount: 0,
        badges: "REAL,VERIFICADO",
        instagram: row.instagram, facebook: row.facebook, website: row.website,
        source: "WEB",
      },
    });
    await db.service.create({
      data: {
        providerId: provider.id, category: plan.category, name: plan.name,
        description: `${row.address ? `${row.address}. ` : ""}${row.hours ? `Horario: ${row.hours}. ` : ""}Precio a consultar (este negocio aún no publica tarifas en la plataforma). ${(row.notes ?? "").slice(0, 200)}`.slice(0, 600),
        durationMin: 30, priceUsd: 0, modality: "PICKUP", petTypes: "PERRO,GATO",
      },
    });
    created++;
    console.log(`✅ ${row.name} — ${city.name}/${(row.zone ?? "centro").slice(0, 30)} @ ${lat.toFixed(4)},${lng.toFixed(4)} [${plan.category}]`);
  }
  console.log(`\nNuevos: ${created} · Omitidos: ${skipped}`);
}

// ───────────────────────── main ─────────────────────────

async function main() {
  // 1) Fixes explícitos
  for (const f of EXPLICIT) {
    const p = await db.provider.findFirst({ where: { businessName: { contains: f.match } } });
    if (!p) { console.log(`⚠️ no encontrado: ${f.match}`); continue; }
    const dKm = haversineKm(p.lat, p.lng, f.lat, f.lng);
    await db.provider.update({ where: { id: p.id }, data: { lat: f.lat, lng: f.lng, ...(f.zone ? { zoneName: f.zone } : {}), ...(f.city ? { city: f.city } : {}) } });
    console.log(`🎯 ${p.businessName} → ${f.lat.toFixed(4)},${f.lng.toFixed(4)} (movido ${(dKm).toFixed(1)} km) — ${f.note}`);
  }

  // 2) Fixes geocodificados
  for (const f of GEO_FIXES) {
    const p = await db.provider.findFirst({ where: { businessName: { contains: f.match } } });
    if (!p) { console.log(`⚠️ no encontrado: ${f.match}`); continue; }
    const g = (await geocode(f.query)) ?? f.fallback;
    const dKm = haversineKm(p.lat, p.lng, g.lat, g.lng);
    if (dKm < 0.15) { console.log(`↩️  ${p.businessName} ya estaba bien`); continue; }
    await db.provider.update({
      where: { id: p.id },
      data: { lat: g.lat, lng: g.lng, ...(f.zone ? { zoneName: f.zone } : {}), ...(f.city ? { city: f.city } : {}) },
    });
    console.log(`📍 ${p.businessName} → ${g.lat.toFixed(4)},${g.lng.toFixed(4)} (movido ${dKm.toFixed(1)} km) — ${f.note}`);
  }

  // Bio del negocio movido a PO (Agropet Machico decía San Félix)
  const machico = await db.provider.findFirst({ where: { businessName: { contains: "Agropet Machico" } } });
  if (machico && machico.city === "Puerto Ordaz" && (machico.bio ?? "").includes("San Félix")) {
    await db.provider.update({
      where: { id: machico.id },
      data: { bio: (machico.bio ?? "").replace("📍 Avenida Atlántico C.C. Río Caura · San Félix", "📍 Av. Atlántico, C.C. Río Caura · Puerto Ordaz") },
    });
    console.log(`📝 bio Agropet Machico corregida (C.C. Río Caura es Av. Atlántico, Puerto Ordaz)`);
  }

  // 3) Geocodificar los 18 WEB previos (pins de centro de ciudad)
  await geocodeBioProviders();

  // 4) Importar los 24 nuevos
  await importNew();

  await db.$disconnect();
}

main();
