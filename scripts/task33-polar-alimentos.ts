/**
 * Task 33 — Categoría "Alimentos" + resaltado de prestadores con productos
 * Empresas Polar (SuperCan, Dogourmet, Champ's, Don Kat, Oh Mai Gat!).
 *
 * 1) polarBrands para prestadores EXISTENTES con evidencia verificada:
 *    - Imperio Animal, C.A. (CBBA) → CHAMPS,DOGOURMET (IG @imperioanimalca: precios de Champ's + post Dogourmet cachorros, cita @alimentospolarr)
 *    - Animal's Center (PZO)      → DOGOURMET     (IG @animalscenter: lista de marcas del pet shop con Dogourmet)
 * 2) NUEVOS prestadores verificados (user + provider + servicio ALIMENTOS):
 *    - Agrocan Guayana (PZO, delivery)  → SUPERCAN,CHAMPS (IG @agrocan_pzo: "Perrarina Champs... delivery gratis... #champs #supercan")
 *    - Mykonos AG (Barqto, Centro)      → SUPERCAN,CHAMPS,DOGOURMET (FB: "CHAMP'S, DOGOURMET Y SUPERCAN PARA ADULTOS Y CACHORROS. Delivery gratis")
 *    - Daba Pets (Barqto, Calle 60)     → SUPERCAN,DOGOURMET (post: "we have Dogourmet, Dog Chow and Supercan")
 *    - Acuario Atlantic Center (Maracaibo) → SUPERCAN (post geolocalizado: "SuperCan de Alimentos Polar...")
 *    NOTA: Hipermercado Caroní (Dogourmet+OhMaiGat en IG) queda FUERA hasta tener
 *    coordenadas verificables de "Urb. Lomas del Caroní, Av. Atlántico" (estándar
 *    Task 32: nada de pins adivinados).
 * 3) Servicio ALIMENTOS para prestadores existentes que venden comida
 *    (tienen servicio DELIVERY + señales de tienda/agro/alimentos en nombre o bio).
 *
 * Idempotente. Uso: bun scripts/task33-polar-alimentos.ts
 */
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/petservice/auth";
import { randomBytes } from "crypto";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// Centros de ciudad calibrados (scripts/audit-geo-deep.ts)
const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  "Puerto Ordaz": { lat: 8.2746, lng: -62.762 },
  Barquisimeto: { lat: 10.0774, lng: -69.3222 },
  Maracaibo: { lat: 10.6545, lng: -71.6409 },
};

const FOOD_SIGNAL = /(agro|pet ?shop|tienda|aliment|forraje|acuario|balancead|perrarina|gatarina)/i;
const POLAR_LABELS: Record<string, string> = {
  SUPERCAN: "SuperCan",
  DOGOURMET: "Dogourmet",
  CHAMPS: "Champ's",
  DONKAT: "Don Kat",
  OHMAIGAT: "Oh Mai Gat!",
};

async function main() {
  const all = await db.provider.findMany({
    include: { services: true, user: { select: { email: true } } },
  });
  const byNameCity = new Map(all.map((p) => [`${norm(p.city)}::${norm(p.businessName)}`, p]));
  const existingEmails = new Set((await db.user.findMany({ select: { email: true } })).map((u) => u.email));

  let updates = 0;
  let created = 0;
  let alimentosServices = 0;

  // ── 1) polarBrands de prestadores existentes ──────────────────────────────
  const brandUpdates: [string, string, string][] = [
    ["Ciudad Bolívar", "Imperio Animal, C.A.", "CHAMPS,DOGOURMET"],
    ["Puerto Ordaz", "Animal's Center (Animalscenter)", "DOGOURMET"],
  ];
  for (const [city, name, brands] of brandUpdates) {
    const p = byNameCity.get(`${norm(city)}::${norm(name)}`);
    if (!p) {
      console.log(`⚠️ No encontrado: ${name} (${city})`);
      continue;
    }
    if (p.polarBrands === brands) {
      console.log(`↩️ Sin cambios: ${name}`);
      continue;
    }
    await db.provider.update({ where: { id: p.id }, data: { polarBrands: brands } });
    updates++;
    console.log(`✅ polarBrands: ${name} → ${brands}`);
  }

  // ── 2) Nuevos prestadores ─────────────────────────────────────────────────
  interface NewRow {
    name: string;
    city: keyof typeof CITY_CENTERS;
    zone: string;
    pin: { lat: number; lng: number };
    brands: string;
    instagram?: string;
    facebook?: string;
    bioIntro: string;
    bioAddress: string;
    sourceRef: string;
  }
  const newRows: NewRow[] = [
    {
      name: "Agrocan Guayana",
      city: "Puerto Ordaz",
      zone: "Delivery en toda Puerto Ordaz (sin sede física)",
      pin: CITY_CENTERS["Puerto Ordaz"],
      brands: "SUPERCAN,CHAMPS",
      instagram: "https://www.instagram.com/agrocan_pzo",
      bioIntro: "Tienda virtual de alimentos para mascotas con delivery GRATIS los sábados por toda Puerto Ordaz.",
      bioAddress: "📍 Sin tienda física: pedidos por DM/WhatsApp de Instagram (entrega a domicilio en toda la ciudad)",
      sourceRef: "Instagram @agrocan_pzo (consulta 1-nov-2026)",
    },
    {
      name: "Mykonos AG",
      city: "Barquisimeto",
      zone: "Carrera 16, Centro",
      pin: { lat: 10.06163, lng: -69.33458 }, // Carrera 16, Centro (Nominatim) — dirección declarada: entre calles 58 y 59
      brands: "SUPERCAN,CHAMPS,DOGOURMET",
      facebook: "https://www.facebook.com/profile.php?id=100063511055012",
      bioIntro: "Agropecuaria y pet shop en el centro de Barquisimeto, con delivery gratis a zonas céntricas.",
      bioAddress: "📍 Carrera 16 entre calles 58 y 59, Centro",
      sourceRef: "Facebook Mykonos AG #mykonosag (consulta 1-nov-2026)",
    },
    {
      name: "Daba Pets",
      city: "Barquisimeto",
      zone: "Calle 60, Negro Primero",
      pin: { lat: 10.05295, lng: -69.3499 }, // Calle 60 (Nominatim) — dirección declarada: entre carreras 13b y 13c
      brands: "SUPERCAN,DOGOURMET",
      bioIntro: "Pet shop barquisimetano con perrarinas para el mantenimiento de tus caninos adultos.",
      bioAddress: "📍 Calle 60 entre carreras 13b y 13c",
      sourceRef: "Post de Daba Pets (consulta 1-nov-2026)",
    },
    {
      name: "Acuario Atlantic Center",
      city: "Maracaibo",
      zone: "Maracaibo (dirección exacta por Instagram)",
      pin: CITY_CENTERS["Maracaibo"],
      brands: "SUPERCAN",
      bioIntro: "Acuario y tienda de mascotas en Maracaibo: peceras, accesorios y alimentos.",
      bioAddress: "📍 Maracaibo, Edo. Zulia — dirección exacta por Instagram",
      sourceRef: "Post geolocalizado Maracaibo (consulta 1-nov-2026)",
    },
  ];

  for (const row of newRows) {
    const key = `${norm(row.city)}::${norm(row.name)}`;
    if (byNameCity.has(key)) {
      console.log(`↩️ Ya existe: ${row.name}`);
      continue;
    }
    byNameCity.set(key, {} as (typeof all)[number]); // reserva para el dedupe interno

    const slug = norm(row.name).replace(/ /g, "").slice(0, 24);
    let email = `negocio.web${slug}@negocios-reales.ve`;
    if (existingEmails.has(email)) email = `negocio.web${slug}.${Date.now()}@negocios-reales.ve`;
    existingEmails.add(email);

    const brandNames = row.brands.split(",").map((b) => POLAR_LABELS[b] ?? b).join(", ");
    const bio = [
      row.bioIntro,
      row.bioAddress,
      `🌽 Productos Empresas Polar verificados: ${brandNames}`,
      "🥣 Venta de alimentos para mascotas (perrarinas y gatarinas); precio según marca y presentación.",
      row.instagram ? `📸 Instagram: ${row.instagram}` : "",
      row.facebook ? `📘 Facebook: ${row.facebook}` : "",
      `Fuente verificada: ${row.sourceRef}`,
    ].filter(Boolean).join("\n");

    const passwordHash = await hashPassword(randomBytes(24).toString("hex"));
    const user = await db.user.create({
      data: { email, name: row.name.slice(0, 60), phone: null, role: "PROVIDER", passwordHash },
    });
    const provider = await db.provider.create({
      data: {
        userId: user.id,
        businessName: row.name.slice(0, 80),
        bio,
        status: "VERIFIED",
        city: row.city,
        zoneName: row.zone.slice(0, 60),
        lat: row.pin.lat,
        lng: row.pin.lng,
        radiusKm: 8,
        badges: "REAL,VERIFICADO",
        instagram: row.instagram,
        facebook: row.facebook,
        source: "WEB",
        polarBrands: row.brands,
        newUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
    });
    await db.service.create({
      data: {
        providerId: provider.id,
        category: "ALIMENTOS",
        name: "Alimentos para mascotas",
        description: `Perrarinas y gatarinas — Empresas Polar verificadas: ${brandNames}. Precio según marca y presentación; pedido por WhatsApp/DM. ${row.bioAddress}`.slice(0, 600),
        durationMin: 30,
        priceUsd: 0,
        modality: row.name === "Agrocan Guayana" ? "DOMICILIO" : "PICKUP",
        petTypes: "PERRO,GATO",
      },
    });
    created++;
    console.log(`✅ Nuevo: ${row.name} — ${row.city} [ALIMENTOS · ${row.brands}]`);
  }

  // ── 3) Servicio ALIMENTOS para prestadores existentes que venden comida ──
  for (const p of all) {
    if (p.status === "SUSPENDED") continue;
    const hasDelivery = p.services.some((s) => s.category === "DELIVERY" && s.active);
    if (!hasDelivery) continue;
    const isShelter = p.services.some((s) => s.category === "REFUGIO" || s.category === "ADOPCION");
    if (isShelter) continue;
    const foodSignal = FOOD_SIGNAL.test(`${p.businessName} ${p.bio}`);
    if (!foodSignal) continue;
    if (p.services.some((s) => s.category === "ALIMENTOS" && s.active)) continue;

    const delivery = p.services.find((s) => s.category === "DELIVERY" && s.active)!;
    const brandLine = p.polarBrands
      ? `Incluye marcas de Empresas Polar verificadas: ${p.polarBrands.split(",").map((b) => POLAR_LABELS[b.trim()] ?? b.trim()).join(", ")}. `
      : "";
    await db.service.create({
      data: {
        providerId: p.id,
        category: "ALIMENTOS",
        name: "Alimentos para mascotas",
        description: `Venta de alimentos para mascotas (perrarinas, gatarinas y snacks). ${brandLine}Precio según marca y presentación — consulta al prestador. Atiende en ${p.zoneName} (${p.city}) y coordina entregas como en su servicio de delivery.`.slice(0, 600),
        durationMin: 30,
        priceUsd: delivery.priceUsd,
        priceToUsd: delivery.priceToUsd,
        modality: delivery.modality,
        petTypes: "PERRO,GATO",
      },
    });
    alimentosServices++;
  }

  console.log(`\nRESUMEN: polarBrands actualizados=${updates} · nuevos=${created} · servicios ALIMENTOS añadidos=${alimentosServices}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
