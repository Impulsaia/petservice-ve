import { db } from "@/lib/db";
import { hashPassword } from "@/lib/petservice/auth";
import { REAL_BIZ_ROWS, type RealBizRow } from "@/lib/petservice/real-bolivar-data";
import { randomBytes } from "crypto";

/**
 * Negocios REALES del estado Bolívar (investigación de fuentes públicas del
 * 20-oct-2026: Google Maps, guayanalocal.com, infoguía.com, redes sociales).
 *
 * - Se importan como prestadores VERIFICADOS con badge "REAL" ✅
 * - Idempotente: si ya existe (mismo nombre normalizado + ciudad), se salta.
 * - Usado por scripts/import-real-bolivar.ts y por seedAll() (reseed demo).
 */

// ───────────────────────── utilidades de normalización ─────────────────────────

const stripAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const norm = (s: string) => stripAccents(s.toLowerCase()).replace(/[^a-z0-9]+/g, " ").trim();

/** Clave de dedupe: primeros tokens útiles (quitando sufijos societarios/ubicación) */
const IGNORE_TOKENS = new Set(["ca", "pzo", "pzo.", "c a", "i", "ii", "iii", "sede", "srl"]);
function dedupeKey(nombre: string): string {
  const tokens = norm(nombre).split(" ").filter((t) => t && !IGNORE_TOKENS.has(t));
  return tokens.slice(0, 3).join(" ");
}

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000; // 0..1
}

// ───────────────────────── derivación de servicios ─────────────────────────

interface ServicePlan {
  category: string;
  name: string;
  description: string;
  durationMin: number;
  priceUsd: number;
  priceToUsd?: number;
  petTypes?: string;
}

function parsePublishedPrice(precios: string): { from: number; to?: number } | null {
  const t = precios.replace(/\./g, "").replace(",", ".");
  const range = t.match(/([\d.]+)\s*usd?\s*\(precio regular\s*([\d.]+)/i);
  if (range) return { from: Number(range[1]), to: Number(range[2]) };
  const desde = t.match(/desde\s*([\d.]+)\s*usd/i);
  if (desde) return { from: Number(desde[1]) };
  const single = t.match(/([\d.]+)\s*usd/i);
  if (single) return { from: Number(single[1]) };
  return null;
}

function buildServices(row: RealBizRow): ServicePlan[] {
  const tipo = norm(row.tipo);
  const isVetSheet = row.sheet === "VET";
  const isGroomSheet = row.sheet === "GROOMING";
  const isShopSheet = row.sheet === "TIENDA";
  const isCuidadoSheet = row.sheet === "CUIDADO";

  const hasVet = isVetSheet || /veterinar|clinica|hospital|consultorio|emergencia|urgencia|farmacia vet/.test(tipo);
  const hasGroom = isGroomSheet || /peluquer|grooming|estetica|bano/.test(tipo);
  const hasTrain = /adiestra|escuela/.test(tipo);
  const hasSit = isCuidadoSheet || /guarderia|pet sitting|hospedaje|cuidado/.test(tipo);
  const hasWalk = /paseo|dog walking/.test(tipo) && !/paseo de meneses|paseo moreno|paseo caroni/.test(row.direccion.toLowerCase());
  const hasShop = isShopSheet || /pet shop|agro|tienda|distribuid|acuario|pajareria|alimento/.test(tipo);

  const published = row.precios ? parsePublishedPrice(row.precios) : null;
  const refNote = "Tarifa referencial — confirma precio y disponibilidad por WhatsApp.";
  const serviciosTxt = row.servicios ? ` Servicios: ${row.servicios.slice(0, 220)}.` : "";
  const plans: ServicePlan[] = [];

  const es24h = /24/.test(row.horario) || /24\s*h/.test(tipo);

  if (hasVet) {
    plans.push({
      category: "VET",
      name: es24h ? "Consulta veterinaria y urgencias" : "Consulta veterinaria",
      description: `${row.tipo}.${serviciosTxt} ${es24h ? "Atiende urgencias y emergencias." : ""} ${refNote}`,
      durationMin: 30,
      priceUsd: published?.from ?? 12,
      priceToUsd: published?.to ?? 20,
    });
  }
  if (hasGroom) {
    plans.push({
      category: "GROOMING",
      name: /felina|gato/.test(tipo) ? "Peluquería canina y felina" : "Baño y corte de mascotas",
      description: `${row.tipo}.${serviciosTxt} Baño, corte y estilizado según tamaño (ref. mercado: pequeño 10–15 USD, mediano ~30, grande hasta 70). ${refNote}`,
      durationMin: 60,
      priceUsd: published?.from ?? 12,
      priceToUsd: published?.to ?? 45,
    });
  }
  if (hasTrain) {
    plans.push({
      category: "TRAINING",
      name: hasWalk && !hasSit ? "Adiestramiento y escuela canina" : "Adiestramiento canino",
      description: `${row.tipo}.${serviciosTxt} Educación y obediencia canina. ${refNote}`,
      durationMin: 60,
      priceUsd: published?.from ?? 40,
      priceToUsd: published?.to ?? 100,
    });
  }
  if (hasSit) {
    plans.push({
      category: "PET_SITTING",
      name: /guarderia/.test(tipo) ? "Guardería y hospedaje canino" : "Pet sitting a domicilio",
      description: `${row.tipo}.${serviciosTxt} Cuidado y hospedaje por día. ${refNote}`,
      durationMin: 480,
      priceUsd: published?.from ?? 15,
      priceToUsd: published?.to ?? 50,
    });
  }
  if (hasWalk) {
    plans.push({
      category: "DOG_WALKING",
      name: "Paseo de perros",
      description: `${row.tipo}.${serviciosTxt} Paseos con supervisión. ${refNote}`,
      durationMin: 60,
      priceUsd: published?.from ?? 6,
      priceToUsd: published?.to ?? 10,
    });
  }
  if (hasShop) {
    plans.push({
      category: "DELIVERY",
      name: /delivery/.test(tipo) ? "Alimentos y accesorios con delivery" : "Alimentos, accesorios e insumos",
      description: `${row.tipo}.${serviciosTxt} Venta de productos para mascotas; entrega a coordinar por WhatsApp. ${refNote}`,
      durationMin: 30,
      priceUsd: published?.from ?? 5,
      priceToUsd: published?.to ?? 50,
      petTypes: /acuario|pajareria|peces|aves/.test(tipo) ? "OTRO" : undefined,
    });
  }

  // Garantía: al menos un servicio (por si el Tipo no calzó con nada)
  if (plans.length === 0) {
    plans.push({
      category: "PET_SITTING",
      name: "Servicio para mascotas",
      description: `${row.tipo}. ${refNote}`,
      durationMin: 60,
      priceUsd: 10,
      priceToUsd: 30,
    });
  }
  return plans;
}

// ───────────────────────── horario → scheduleJson ─────────────────────────

function buildSchedule(horario: string): string {
  const full = [["00:00", "23:30"]];
  if (/24\s*h|24 horas|abierto 24/i.test(horario)) {
    return JSON.stringify(Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, full])));
  }
  const day = [["08:00", "17:00"]];
  return JSON.stringify(Object.fromEntries([1, 2, 3, 4, 5, 6].map((d) => [d, day])));
}

// ───────────────────────── teléfonos ─────────────────────────

function parsePhones(telefonos: string): string[] {
  const raw = telefonos.match(/\d{4}[-\s]?\d{7}/g) ?? [];
  const out: string[] = [];
  for (const r of raw) {
    let digits = r.replace(/\D/g, "");
    // "0414-8601939" → "584148601939" (12 dígitos: 58 + 10 nacionales)
    if (digits.length === 11 && digits.startsWith("0")) digits = "58" + digits.slice(1);
    if (digits.length !== 12 || !digits.startsWith("58")) continue;
    const pretty = `+58 ${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (!out.includes(pretty)) out.push(pretty);
  }
  return out;
}

// ───────────────────────── sector / zona / coords ─────────────────────────

interface SectorLite { name: string; lat: number | null; lng: number | null }
interface CityLite { name: string; lat: number; lng: number }

function matchSector(address: string, sectors: SectorLite[]): SectorLite | null {
  const na = norm(address);
  const sorted = [...sectors].sort((a, b) => b.name.length - a.name.length);
  for (const s of sorted) {
    const ns = norm(s.name);
    if (ns.length >= 4 && na.includes(ns)) return s;
  }
  return null;
}

function fallbackZone(address: string, cityName: string): string {
  // 1) Paréntesis con nombre de lugar: "(Castillito)", "(Antillana Hills)"
  const parens = [...address.matchAll(/\(([^)]{3,24})\)/g)].map((m) => m[1].trim());
  for (const p of parens) {
    if (/seg[uú]n|maps|cp \d|bio|pedidos|sede|lado|\+|\d{4}/i.test(p)) continue;
    if (norm(p) !== norm(cityName)) return p;
  }
  // 2) Segmentos de la dirección, de atrás hacia adelante
  const clean = (s: string) => s.replace(/\([^)]*\)?/g, "").replace(/\s+/g, " ").trim();
  const segments = address.split(",").map(clean).filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    if (/online|delivery|cp \d|ubicaci[oó]n|maps|sin descripci|no publicado|^av\.?\s*$|^\d/i.test(s)) continue;
    if (s.length >= 3 && s.length <= 28) return s;
  }
  return cityName;
}

// ───────────────────────── bio ─────────────────────────

function buildBio(row: RichRow, zone: string, phones: string[]): string {
  const lines: string[] = [];
  lines.push(`✅ Negocio real — ${row.tipo}`);
  if (row.servicios) lines.push(`🛎️ ${row.servicios}`);
  lines.push(`📍 ${[row.direccion, row.ciudad].filter(Boolean).join(" · ")}`);
  if (row.rating) lines.push(`⭐ ${row.rating} en Google Maps`);
  if (row.horario) lines.push(`🕐 ${row.horario}`);
  if (phones.length > 1) lines.push(`📞 ${phones.join(" · ")}`);
  if (row.instagram) lines.push(`📸 Instagram: ${row.instagram}`);
  if (row.facebook) lines.push(`📘 Facebook: ${row.facebook}`);
  if (row.sitioWeb) lines.push(`🌐 ${row.sitioWeb}`);
  const notas = row.notas && !/^Tambi[eé]n en pesta/.test(row.notas) ? row.notas : "";
  if (notas) lines.push(`ℹ️ ${notas}`);
  if (row.fuentes) lines.push(`Fuentes: ${row.fuentes} (consulta 20-oct-2026).`);
  return lines.join("\n").slice(0, 1200);
}

// ───────────────────────── fila enriquecida (merge de duplicados) ─────────────────────────

interface RichRow {
  nombre: string; tipo: string; ciudad: string; rating: string;
  direccion: string; telefonos: string; email: string; instagram: string;
  facebook: string; sitioWeb: string; servicios: string; precios: string;
  horario: string; fuentes: string; notas: string;
  categories: string[];
}

/** Fusiona las 84 filas (4 hojas) en negocios únicos. */
export function mergeRealRows(): RichRow[] {
  const groups = new Map<string, RealBizRow[]>();
  for (const row of REAL_BIZ_ROWS) {
    if (!row.nombre || !row.ciudad) continue;
    const key = `${norm(row.ciudad)}::${dedupeKey(row.nombre)}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const rich: RichRow[] = [];
  for (const rows of groups.values()) {
    const base = rows.reduce((a, b) => (Object.keys(b).filter((k) => (b as unknown as Record<string, string>)[k]).length > Object.keys(a).filter((k) => (a as unknown as Record<string, string>)[k]).length ? b : a));
    rich.push({
      nombre: base.nombre,
      tipo: rows.map((r) => r.tipo).find(Boolean) ?? "",
      ciudad: base.ciudad,
      rating: rows.map((r) => r.rating).find(Boolean) ?? "",
      direccion: rows.map((r) => r.direccion).find(Boolean) ?? "",
      telefonos: (Array.from(new Set(rows.flatMap((r) => parsePhones(r.telefonos)))).join(" · ") || rows.map((r) => r.telefonos).find(Boolean)) ?? "",
      email: rows.map((r) => r.email).find((e) => e && e !== "No publicado") ?? "",
      instagram: rows.map((r) => r.instagram).find(Boolean) ?? "",
      facebook: rows.map((r) => r.facebook).find(Boolean) ?? "",
      sitioWeb: rows.map((r) => r.sitioWeb).find(Boolean) ?? "",
      servicios: Array.from(new Set(rows.map((r) => r.servicios).filter(Boolean))).join(" · "),
      precios: rows.map((r) => r.precios).find((p) => p && /usd/i.test(p)) ?? "",
      horario: rows.map((r) => r.horario).find(Boolean) ?? "",
      fuentes: Array.from(new Set(rows.flatMap((r) => r.fuentes.split("•").map((f) => f.trim())).filter(Boolean))).slice(0, 4).join(" · "),
      notas: rows.map((r) => r.notas).find((n) => n && !/^Tambi[eé]n en pesta/.test(n)) ?? "",
      categories: rows.map((r) => r.sheet),
    });
  }
  return rich;
}

// ───────────────────────── sincronización ─────────────────────────

export interface SyncResult { created: number; skipped: number; byCity: Record<string, number> }

export async function syncRealBusinesses(log = false): Promise<SyncResult> {
  const cities = await db.city.findMany();
  const sectors = await db.sector.findMany({ where: { active: true } });
  const existingProviders = await db.provider.findMany({ select: { businessName: true, city: true, badges: true } });

  const existingKeys = new Set(existingProviders.map((p) => `${norm(p.city)}::${dedupeKey(p.businessName)}`));
  const existingEmails = new Set((await db.user.findMany({ select: { email: true } })).map((u) => u.email));

  const result: SyncResult = { created: 0, skipped: 0, byCity: {} };
  const rows = mergeRealRows();

  for (const row of rows) {
    const cityNorm = norm(row.ciudad);
    const key = `${cityNorm}::${dedupeKey(row.nombre)}`;
    if (existingKeys.has(key)) {
      result.skipped++;
      continue;
    }
    existingKeys.add(key);

    const city = cities.find((c) => norm(c.name) === cityNorm);
    if (!city) {
      if (log) console.warn(`⚠️ Ciudad no encontrada para "${row.ciudad}" (${row.nombre}) — se salta`);
      result.skipped++;
      continue;
    }

    const citySectors: SectorLite[] = sectors.filter((s) => norm(s.cityName) === cityNorm).map((s) => ({ name: s.name, lat: s.lat, lng: s.lng }));
    const sector = matchSector(row.direccion, citySectors);
    const zoneName = sector?.name ?? fallbackZone(row.direccion, city.name);

    const base = sector?.lat != null && sector?.lng != null ? { lat: sector.lat, lng: sector.lng } : { lat: city.lat, lng: city.lng };
    const jitter = (offset: number) => ((hash01(row.nombre + offset) - 0.5) * 2) * 0.006;
    const lat = base.lat + jitter("lat") + (sector ? 0 : (hash01(row.nombre) - 0.5) * 0.03);
    const lng = base.lng + jitter("lng") + (sector ? 0 : (hash01(row.nombre + "x") - 0.5) * 0.03);

    const phones = row.telefonos ? row.telefonos.split(" · ").filter(Boolean) : [];
    const mainPhone = phones.find((p) => /412|414|416|424|426/.test(p)) ?? phones[0] ?? null;

    // Email único y no colisionante
    const slug = norm(row.nombre).replace(/\s+/g, "-").slice(0, 40);
    let email = row.email && /@/.test(row.email) ? row.email.toLowerCase() : `negocio.${slug}@bolivar-real.ve`;
    if (existingEmails.has(email)) email = `negocio.${slug}.${result.created}@bolivar-real.ve`;
    existingEmails.add(email);

    const passwordHash = await hashPassword(randomBytes(24).toString("hex"));
    const user = await db.user.create({
      data: { email, name: row.nombre.slice(0, 60), phone: mainPhone, role: "PROVIDER", passwordHash },
    });

    const ratingNum = row.rating ? Number(String(row.rating).replace(",", ".")) : 0;
    const badges = ["VERIFICADO", "REAL"].join(",");
    const bio = buildBio(row, zoneName, phones);

    const provider = await db.provider.create({
      data: {
        userId: user.id,
        businessName: row.nombre.slice(0, 80),
        bio,
        status: "VERIFIED",
        city: city.name,
        zoneName: zoneName.slice(0, 60),
        lat,
        lng,
        radiusKm: 5,
        scheduleJson: buildSchedule(row.horario),
        ratingAvg: Number.isFinite(ratingNum) && ratingNum > 0 && ratingNum <= 5 ? ratingNum : 0,
        ratingCount: 0,
        badges,
      },
    });

    for (const svc of buildServices(row)) {
      await db.service.create({
        data: {
          providerId: provider.id,
          category: svc.category,
          name: svc.name.slice(0, 80),
          description: svc.description.slice(0, 600),
          durationMin: svc.durationMin,
          priceUsd: svc.priceUsd,
          ...(svc.priceToUsd != null && Number.isFinite(svc.priceToUsd) ? { priceToUsd: svc.priceToUsd } : {}),
          modality: "DOMICILIO",
          petTypes: svc.petTypes ?? "PERRO,GATO",
        },
      });
    }

    result.created++;
    result.byCity[city.name] = (result.byCity[city.name] ?? 0) + 1;
    if (log) console.log(`✅ ${row.nombre} — ${city.name} / ${zoneName} (${buildServices(row).map((s) => s.category).join(",")})`);
  }

  return result;
}
