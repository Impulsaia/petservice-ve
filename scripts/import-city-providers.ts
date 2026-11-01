/**
 * PetService VE — Importación de prestadores REALES de otras ciudades
 * (Task 31-a: Barquisimeto, Maturín y Maracaibo — investigación web verificada).
 *
 * Fuentes: /tmp/cities-providers-research.json (19 negocios verificados con
 * ≥2 fuentes independientes o ficha completa). Nada inventado: si un campo
 * no está verificado va vacío. Coordenadas = centro de la ciudad (sin
 * geolocalización verificada de dirección aún).
 *
 * Idempotente: dedupe por ciudad + nombre normalizado.
 * Uso: bun scripts/import-city-providers.ts
 */
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/petservice/auth";
import { randomBytes } from "crypto";
import { readFileSync } from "fs";

interface Row {
  name: string;
  category: "VETERINARIA" | "PETSHOP" | "GROOMING";
  city: string;
  state: string;
  zone: string | null;
  address: string | null;
  phones: string[];
  instagram: string | null;
  facebook: string | null;
  website: string | null;
  hours: string | null;
  sourceRef: string | string[];
  notes: string;
}

const RESEARCH_JSON = process.env.RESEARCH_JSON ?? "/tmp/cities-providers-research.json";
const rows: Row[] = JSON.parse(readFileSync(RESEARCH_JSON, "utf8"));

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Teléfono preferido: móvil 04xx (WhatsApp-first), sino el primero */
function primaryPhone(phones: string[]): string | null {
  const mobile = phones.find((p) => p.replace(/\D/g, "").startsWith("04"));
  return (mobile ?? phones[0] ?? null) ? (mobile ?? phones[0]!).replace(/\s+/g, " ").trim() : null;
}

function planFor(category: Row["category"]): { category: string; name: string } {
  switch (category) {
    case "VETERINARIA":
      return { category: "VET", name: "Consulta veterinaria" };
    case "GROOMING":
      return { category: "GROOMING", name: "Baño y corte de mascotas" };
    default:
      return { category: "DELIVERY", name: "Alimentos, accesorios e insumos" };
  }
}

function buildBio(row: Row): string {
  const lines: string[] = [];
  lines.push(
    row.category === "VETERINARIA" ? "Veterinaria real verificada" : row.category === "GROOMING" ? "Peluquería canina real verificada" : "Tienda de mascotas real verificada"
  );
  if (row.address) lines.push(`📍 ${row.address}`);
  else if (row.zone) lines.push(`📍 Zona: ${row.zone}`);
  if (row.hours) lines.push(`🕐 ${row.hours}`);
  const phone = primaryPhone(row.phones);
  if (phone) lines.push(`📞 ${phone}`);
  if (row.phones.filter((p) => p !== phone).length) lines.push(`☎️ Otros teléfonos: ${row.phones.filter((p) => p !== phone).join(" · ")}`);
  if (row.instagram) lines.push(`📸 Instagram: ${row.instagram}`);
  if (row.facebook) lines.push(`📘 Facebook: ${row.facebook}`);
  if (row.website) lines.push(`🌐 ${row.website}`);
  if (row.notes) lines.push(row.notes);
  const refs = Array.isArray(row.sourceRef) ? row.sourceRef : [row.sourceRef];
  if (refs[0]) lines.push(`Fuente verificada: ${refs[0]}`);
  return lines.join("\n").slice(0, 1400);
}

async function main() {
  const cities = await db.city.findMany();
  const cityByKey = new Map(cities.map((c) => [norm(`${c.name} ${c.state}`), c]));

  const existing = await db.provider.findMany({ select: { businessName: true, city: true } });
  const existingKeys = new Set(existing.map((p) => `${norm(p.city)}::${norm(p.businessName).slice(0, 24)}`));
  const existingEmails = new Set((await db.user.findMany({ select: { email: true } })).map((u) => u.email));

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const city = cityByKey.get(norm(`${row.city} ${row.state ?? ""}`)) ?? cityByKey.get(norm(row.city));
    if (!city) {
      console.log(`⚠️ Ciudad no encontrada para "${row.name}" (${row.city}) — omitido`);
      skipped++;
      continue;
    }
    const key = `${norm(city.name)}::${norm(row.name).slice(0, 24)}`;
    if (existingKeys.has(key)) {
      console.log(`↩️  Ya existe: ${row.name} — omitido`);
      skipped++;
      continue;
    }
    existingKeys.add(key);

    const slug = norm(row.name).replace(/ /g, "").slice(0, 24);
    let email = `negocio.web${slug}@negocios-reales.ve`;
    if (existingEmails.has(email)) email = `negocio.web${slug}.${created}@negocios-reales.ve`;
    existingEmails.add(email);

    const passwordHash = await hashPassword(randomBytes(24).toString("hex"));
    const user = await db.user.create({
      data: { email, name: row.name.slice(0, 60), phone: primaryPhone(row.phones), role: "PROVIDER", passwordHash },
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
        lat: city.lat,
        lng: city.lng,
        radiusKm: 8,
        ratingAvg: 0,
        ratingCount: 0,
        badges: "REAL,VERIFICADO",
        instagram: row.instagram,
        facebook: row.facebook,
        website: row.website,
        source: "WEB",
      },
    });

    await db.service.create({
      data: {
        providerId: provider.id,
        category: plan.category,
        name: plan.name,
        description: `${row.address ? `${row.address}. ` : ""}${row.hours ? `Horario: ${row.hours}. ` : ""}Precio a consultar (este negocio aún no publica tarifas en la plataforma). ${row.notes ?? ""}`.slice(0, 600),
        durationMin: 30,
        priceUsd: 0,
        modality: "PICKUP",
        petTypes: "PERRO,GATO",
      },
    });

    created++;
    console.log(`✅ ${row.name} — ${city.name}/${row.zone ?? "centro"} [${plan.category}] tel:${primaryPhone(row.phones) ?? "—"}`);
  }

  console.log(`\n════════ RESULTADO ════════`);
  console.log(`Creados: ${created} · Omitidos: ${skipped}`);
  process.exit(0);
}

main();
