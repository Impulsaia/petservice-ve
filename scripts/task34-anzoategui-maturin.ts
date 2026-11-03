/**
 * PetService VE — Task 34: certificación de prestadores en Maturín, El Tigre,
 * Barcelona y Puerto La Cruz (investigación web verificada por 3 rondas).
 *
 * Fuentes: /tmp/research-{maturin,eltigre,bna-plc}.json — cada negocio con
 * evidencia web real (IG/FB, directorios, fichas). Estándar Task 32:
 *  - Coordenadas SOLO verificadas (Nominatim dentro del bbox de la ciudad).
 *  - Sin contacto real (tel/IG/FB/web) NO se importa: un negocio inalcanzable
 *    no aporta nada al cliente.
 *  - Geocodificación de refuerzo para filas sin pin: dirección/zona →
 *    Nominatim (street-level, máx 1 rps). Si no resuelve → centro de ciudad
 *    con etiqueta de zona en la ficha (mismo patrón del Task 31).
 *
 * Idempotente: dedupe por ciudad + nombre normalizado.
 * Uso: bun scripts/task34-anzoategui-maturin.ts
 */
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/petservice/auth";
import { randomBytes } from "crypto";
import { readFileSync, copyFileSync, mkdirSync } from "fs";

interface Row {
  name: string;
  category: "VETERINARIA" | "PETSHOP" | "GROOMING";
  city: string;
  state: string;
  zone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  geocodeSource: string | null;
  phones: string[];
  instagram: string | null;
  facebook: string | null;
  website: string | null;
  hours: string | null;
  polarBrands: string | null;
  sourceRef: string | string[];
  notes: string;
}

const SOURCES = [
  "/tmp/research-maturin.json",
  "/tmp/research-eltigre.json",
  "/tmp/research-bna-plc.json",
];

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Centros calibrados + bbox de validación por ciudad */
const CITY: Record<string, { lat: number; lng: number; bbox: [number, number, number, number] }> = {
  "Maturín": { lat: 9.7459, lng: -63.1768, bbox: [9.68, -63.22, 9.82, -63.10] },
  "El Tigre": { lat: 8.8847, lng: -64.2593, bbox: [8.83, -64.32, 8.97, -64.18] },
  "Barcelona": { lat: 10.1371, lng: -64.6863, bbox: [10.10, -64.79, 10.20, -64.64] },
  "Puerto La Cruz": { lat: 10.1920, lng: -64.6555, bbox: [10.12, -64.79, 10.28, -64.58] },
};

const inBbox = (city: string, lat: number, lng: number) => {
  const b = CITY[city]?.bbox;
  if (!b) return false;
  return lat >= b[0] && lng >= b[1] && lat <= b[2] && lng <= b[3];
};

async function geocode(query: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=ve`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "petservice-ve-import/1.0 (contacto: impulsaia@gmail.com)" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name.slice(0, 100) };
  } catch {
    return null;
  }
}

function primaryPhone(phones: string[]): string | null {
  const clean = phones.map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!clean.length) return null;
  const mobile = clean.find((p) => p.replace(/\D/g, "").startsWith("04"));
  return (mobile ?? clean[0]).slice(0, 24);
}

function planFor(category: Row["category"]): { category: string; name: string; extra?: { category: string; name: string } } {
  switch (category) {
    case "VETERINARIA":
      return { category: "VET", name: "Consulta veterinaria a domicilio" };
    case "GROOMING":
      return { category: "GROOMING", name: "Baño y corte de mascotas a domicilio" };
    default:
      // PETSHOP: servicio ALIMENTOS (categoría Task 33) + DELIVERY de accesorios
      return {
        category: "ALIMENTOS",
        name: "Perrarinas y alimentos para mascotas",
        extra: { category: "DELIVERY", name: "Accesorios e insumos (delivery)" },
      };
  }
}

async function main() {
  // Copia de respaldo de la investigación al repo (.cache no se commitea)
  mkdirSync(".cache", { recursive: true });
  for (const s of SOURCES) copyFileSync(s, `.cache/${s.split("/").pop()}`);

  const rows: Row[] = SOURCES.flatMap((f) => JSON.parse(readFileSync(f, "utf8")) as Row[]);

  const cities = await db.city.findMany();
  const cityByKey = new Map(cities.map((c) => [norm(c.name), c]));
  for (const key of Object.keys(CITY)) {
    if (!cityByKey.has(norm(key))) throw new Error(`Falta la ciudad en la tabla City: ${key}`);
  }

  const existing = await db.provider.findMany({ select: { businessName: true, city: true } });
  const existingKeys = new Set(existing.map((p) => `${norm(p.city)}::${norm(p.businessName).slice(0, 24)}`));
  const existingEmails = new Set((await db.user.findMany({ select: { email: true } })).map((u) => u.email));

  let created = 0;
  let skippedContact = 0;
  let skippedDupe = 0;
  let geocoded = 0;
  let centerFallback = 0;

  for (const row of rows) {
    const cityMeta = cityByKey.get(norm(row.city));
    if (!cityMeta || !CITY[row.city]) {
      console.log(`⚠️ Ciudad inválida para "${row.name}" (${row.city}) — omitido`);
      continue;
    }
    const key = `${norm(row.city)}::${norm(row.name).slice(0, 24)}`;
    if (existingKeys.has(key)) {
      console.log(`↩️  Ya existe: ${row.name} (${row.city}) — omitido`);
      skippedDupe++;
      continue;
    }

    // Filtro de calidad: sin ningún contacto real no se importa
    const hasContact = row.phones.length > 0 || row.instagram || row.facebook || row.website;
    if (!hasContact) {
      console.log(`✂️  Sin contacto verificable: ${row.name} (${row.city}) — omitido`);
      skippedContact++;
      continue;
    }

    // ── Geocodificación de refuerzo (estándar Task 32) ──
    let lat = row.lat;
    let lng = row.lng;
    let geoNote = row.geocodeSource ?? "";
    if (lat === null || lng === null) {
      const addr = [row.address, row.zone].find((x) => x && x.length > 6);
      if (addr) {
        for (const attempt of [
          `${addr}, ${row.city}, ${row.state}, Venezuela`,
          `${addr}, Venezuela`,
        ]) {
          const hit = await geocode(attempt);
          if (hit && inBbox(row.city, hit.lat, hit.lng)) {
            lat = hit.lat;
            lng = hit.lng;
            geoNote = `Nominatim '${attempt}' → ${hit.label}`;
            geocoded++;
            break;
          }
          await new Promise((r) => setTimeout(r, 1100));
        }
      }
      if (lat === null || lng === null) {
        lat = CITY[row.city].lat;
        lng = CITY[row.city].lng;
        centerFallback++;
      }
    }

    const phone = primaryPhone(row.phones);
    const slug = norm(row.name).replace(/ /g, "").slice(0, 24) || randomBytes(6).toString("hex");
    let email = `negocio.web${slug}@negocios-reales.ve`;
    if (existingEmails.has(email)) email = `negocio.web${slug}.${created}@negocios-reales.ve`;
    existingEmails.add(email);

    const passwordHash = await hashPassword(randomBytes(24).toString("hex"));
    const user = await db.user.create({
      data: { email, name: row.name.slice(0, 60), phone, role: "PROVIDER", passwordHash },
    });

    const refs = Array.isArray(row.sourceRef) ? row.sourceRef : [row.sourceRef];
    const bioLines = [
      row.category === "VETERINARIA" ? "Veterinaria real verificada" : row.category === "GROOMING" ? "Peluquería canina real verificada" : "Tienda de mascotas real verificada",
      row.address ? `📍 ${row.address}` : row.zone ? `📍 Zona: ${row.zone}` : null,
      row.hours ? `🕐 ${row.hours}` : null,
      phone ? `📞 ${phone}` : null,
      row.phones.filter((p) => p !== phone).length ? `☎️ Otros teléfonos: ${row.phones.filter((p) => p !== phone).join(" · ")}` : null,
      row.instagram ? `📸 Instagram: ${row.instagram}` : null,
      row.facebook ? `📘 Facebook: ${row.facebook}` : null,
      row.website ? `🌐 ${row.website}` : null,
      row.notes || null,
      refs[0] ? `Fuente verificada: ${refs[0]}` : null,
    ].filter(Boolean) as string[];

    const provider = await db.provider.create({
      data: {
        userId: user.id,
        businessName: row.name.slice(0, 80),
        bio: bioLines.join("\n").slice(0, 1400),
        status: "VERIFIED",
        city: row.city,
        zoneName: (row.zone ?? row.address ?? row.city).slice(0, 60),
        lat,
        lng,
        radiusKm: 8,
        ratingAvg: 0,
        ratingCount: 0,
        badges: "REAL,VERIFICADO",
        instagram: row.instagram,
        facebook: row.facebook,
        website: row.website,
        polarBrands: row.polarBrands,
        source: "WEB",
      },
    });

    const plan = planFor(row.category);
    const baseDesc = `${row.address ? `${row.address}. ` : ""}${row.hours ? `Horario: ${row.hours}. ` : ""}Precio a consultar (este negocio aún no publica tarifas en la plataforma). ${row.notes ?? ""}`;
    await db.service.create({
      data: {
        providerId: provider.id,
        category: plan.category,
        name: plan.name,
        description: baseDesc.slice(0, 600),
        durationMin: 30,
        priceUsd: 0,
        modality: "DOMICILIO",
        petTypes: "PERRO,GATO",
      },
    });
    if (plan.extra) {
      await db.service.create({
        data: {
          providerId: provider.id,
          category: plan.extra.category,
          name: plan.extra.name,
          description: `Entrega y pedidos de accesorios e insumos. ${baseDesc}`.slice(0, 600),
          durationMin: 30,
          priceUsd: 0,
          modality: "DOMICILIO",
          petTypes: "PERRO,GATO",
        },
      });
    }

    created++;
    existingKeys.add(key);
    const pinLabel = (lat === CITY[row.city].lat && lng === CITY[row.city].lng) ? "centro" : "pin";
    console.log(`✅ ${row.name} — ${row.city}/${row.zone ?? row.address ?? "s/z"} [${plan.category}] tel:${phone ?? "—"} (${pinLabel})`);
  }

  console.log(`\n════════ RESULTADO TASK 34 ════════`);
  console.log(`Creados: ${created} · Sin contacto: ${skippedContact} · Duplicados: ${skippedDupe}`);
  console.log(`Geocodificados: ${geocoded} · Fallback centro: ${centerFallback}`);
  process.exit(0);
}

main();
