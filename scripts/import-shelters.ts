/**
 * PetService VE — Importación de REFUGIOS y ADOPCIÓN reales de mascotas.
 *
 * Fuentes: investigación web verificada (prensa local + registros de refugios)
 * guardada en /tmp/shelters-research.json (Task 30-a). Solo se insertan
 * organizaciones con nombre verificado; las direcciones privadas usan el
 * centro de la ciudad y la zona conocida.
 *
 * Idempotente: dedupe por nombre normalizado + ciudad.
 * Uso: bun scripts/import-shelters.ts
 */
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/petservice/auth";
import { randomBytes } from "crypto";

interface ShelterRow {
  name: string;
  kind: "SHELTER" | "ADOPTION" | "BOARDING";
  city: string | null;
  state: string | null;
  address: string;
  phones: string[];
  instagram: string;
  facebook: string;
  website: string;
  email: string;
  hours: string;
  source: string;
  sourceRef: string;
  notes: string;
  /** zona opcional conocida dentro de la ciudad (ej: Minifincas) */
  zoneName?: string;
  /** coordenadas opcionales verificadas; si faltan → centro de la ciudad */
  lat?: number;
  lng?: number;
}

// ── Datos verificados (Task 30-a): refugios/rescates reales de Venezuela ──
const SHELTERS: ShelterRow[] = [
  {
    name: "Fundaproba — Protectora de Animales",
    kind: "SHELTER",
    city: "Puerto Ordaz",
    state: "Bolívar",
    address: "Refugio en el municipio Caroní (dirección exacta reservada por seguridad del refugio); difusión y eventos: Av. Paseo Caroní, Los Samanes",
    phones: ["+58 424-9137488"],
    instagram: "https://www.instagram.com/fundaproba",
    facebook: "https://www.facebook.com/Fundaproba",
    website: "",
    email: "",
    hours: "Visitas coordinadas por WhatsApp (previa cita)",
    source: "WEB",
    sourceRef: "https://primicia.com.ve/guayana/ciudad/fundaproba-cumple-17-anos-protegiendo-animales-en-guayana",
    notes: "Fundación protectora con 17+ años rescatando perritos en Puerto Ordaz (actividad documentada en el sector Minifincas). Alberga decenas de perros rescatados: acepta voluntariado, donaciones y hogares temporales.",
    zoneName: "Minifincas",
    lat: 8.253,
    lng: -62.737,
  },
  {
    name: "Patitas de la Calle (Voluntarios)",
    kind: "ADOPTION",
    city: "Ciudad Bolívar",
    state: "Bolívar",
    address: "Sin sede fija: rescates en Casco Histórico, La Sabanita, Perimetral y casas de voluntarios",
    phones: [],
    instagram: "https://www.instagram.com/patitasdelacalle_voluntarios",
    facebook: "",
    website: "",
    email: "",
    hours: "Coordinación por Instagram/WhatsApp",
    source: "WEB",
    sourceRef: "https://primicia.com.ve/guayana/ciudad/patitas-de-la-calle-promueve-la-adopcion-y-cuidados-de-las-mascotas",
    notes: "Grupo de voluntarios con 16 años rescatando en Ciudad Bolívar; más de 100 animales en cuidado temporal esperando adopción responsable.",
    zoneName: "Centro Histórico",
  },
  {
    name: "Misión Nevado Bolívar",
    kind: "ADOPTION",
    city: "San Félix",
    state: "Bolívar",
    address: "Atención comunitaria en San Félix y Puerto Ordaz",
    phones: [],
    instagram: "https://www.instagram.com/nevadobolivar",
    facebook: "https://www.facebook.com/p/Misi%C3%B3n-Nevado-Bol%C3%ADvar-100064325034354",
    website: "",
    email: "",
    hours: "Campañas y jornadas programadas",
    source: "WEB",
    sourceRef: "https://www.facebook.com/p/Misi%C3%B3n-Nevado-Bol%C3%ADvar-100064325034354",
    notes: "Misión social de bienestar animal del estado Bolívar: cuidado de animales comunitarios, adopciones y jornadas de esterilización.",
    zoneName: "San Félix Centro",
  },
  {
    name: "Hogar Temporal Patitas a Salvo",
    kind: "BOARDING",
    city: "Puerto Ordaz",
    state: "Bolívar",
    address: "Urb. Caura, junto al Polideportivo de Venalum",
    phones: [],
    instagram: "",
    facebook: "",
    website: "https://patitasasalvovenezuela.org/refugios",
    email: "",
    hours: "Coordinación por WhatsApp (previa cita)",
    source: "WEB",
    sourceRef: "https://patitasasalvovenezuela.org/refugios/9df0a385-a616-45f3-ac5e-da38a55fb9b3",
    notes: "Hogar temporal (foster) registrado en la red Patitas a Salvo Venezuela: recibe perritos pequeños y gatos mientras encuentran familia.",
    zoneName: "Urb. Caura",
  },
  {
    name: "Santuario Luna",
    kind: "SHELTER",
    city: "Caracas",
    state: "Distrito Capital",
    address: "Vía Tazón, Maitana, Edo. Miranda (área metropolitana de Caracas)",
    phones: [],
    instagram: "",
    facebook: "",
    website: "https://patitasasalvovenezuela.org/refugios",
    email: "",
    hours: "Visitas coordinadas por la red Patitas a Salvo",
    source: "WEB",
    sourceRef: "https://patitasasalvovenezuela.org/refugios",
    notes: "Santuario de gran capacidad cerca de Caracas: más de 200 animales rescatados (gatos, perros y tortugas) en proceso de rehabilitación y adopción.",
    zoneName: "Vía Tazón · Maitana",
  },
];

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function servicePlanFor(kind: ShelterRow["kind"]): { category: string; name: string } {
  switch (kind) {
    case "SHELTER":
      return { category: "REFUGIO", name: "Visita al refugio · Voluntariado y donaciones" };
    case "BOARDING":
      return { category: "REFUGIO", name: "Hogar temporal para rescatados" };
    default:
      return { category: "ADOPCION", name: "Proceso de adopción responsable" };
  }
}

function buildBio(row: ShelterRow): string {
  const lines: string[] = [];
  lines.push(row.kind === "ADOPTION" ? "Organización de adopción responsable" : "Refugio / rescate de mascotas");
  if (row.address) lines.push(`📍 ${row.address}`);
  if (row.hours) lines.push(`🕐 ${row.hours}`);
  if (row.phones.length) lines.push(`📞 ${row.phones.join(" · ")}`);
  if (row.instagram) lines.push(`📸 Instagram: ${row.instagram}`);
  if (row.facebook) lines.push(`📘 Facebook: ${row.facebook}`);
  if (row.website) lines.push(`🌐 ${row.website}`);
  if (row.email) lines.push(`✉️ ${row.email}`);
  lines.push(row.notes);
  lines.push(`Fuente verificada: ${row.sourceRef}`);
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

  for (const row of SHELTERS) {
    const city = row.city ? cityByKey.get(norm(`${row.city} ${row.state ?? ""}`)) ?? cityByKey.get(norm(`${row.city}`)) : undefined;
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
    let email = `refugio.web${slug}@negocios-reales.ve`;
    if (existingEmails.has(email)) email = `refugio.web${slug}.${created}@negocios-reales.ve`;
    existingEmails.add(email);

    const passwordHash = await hashPassword(randomBytes(24).toString("hex"));
    const user = await db.user.create({
      data: { email, name: row.name.slice(0, 60), phone: row.phones[0] ?? null, role: "PROVIDER", passwordHash },
    });

    const plan = servicePlanFor(row.kind);
    const provider = await db.provider.create({
      data: {
        userId: user.id,
        businessName: row.name.slice(0, 80),
        bio: buildBio(row),
        status: "VERIFIED",
        city: city.name,
        zoneName: (row.zoneName ?? city.name).slice(0, 60),
        lat: row.lat ?? city.lat,
        lng: row.lng ?? city.lng,
        radiusKm: 8,
        ratingAvg: 0,
        ratingCount: 0,
        badges: "VERIFICADO,REAL",
        source: "SHELTER",
      },
    });

    await db.service.create({
      data: {
        providerId: provider.id,
        category: plan.category,
        name: plan.name,
        description: `${row.notes} Contacto: ${row.phones[0] ?? row.instagram ?? row.website ?? "coordinar por la plataforma"}.`,
        durationMin: 60,
        priceUsd: 0,
        modality: "PICKUP",
        petTypes: "PERRO,GATO",
      },
    });

    created++;
    console.log(`✅ ${row.name} — ${city.name}/${row.zoneName ?? city.name} [${plan.category}]`);
  }

  console.log(`\n════════ RESULTADO ════════`);
  console.log(`Creados: ${created} · Omitidos: ${skipped}`);
  process.exit(0);
}

main();
