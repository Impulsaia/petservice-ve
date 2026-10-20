/**
 * PetService VE — Seed SOLO DATOS REALES
 *
 * El directorio de prestadores lo componen únicamente negocios reales:
 *  - 84 negocios del estado Bolívar (investigación de fuentes públicas, badge "VERIFICADO,REAL")
 *  - Negocios reales de OpenStreetMap de toda Venezuela (badge "REAL", atribución ODbL)
 *
 * Este seed ya NO crea prestadores ficticios. Solo garantiza:
 *  - Settings (sin tocar la tasa BCV existente)
 *  - Cuentas demo de clientes/admin para probar la app
 *  - Mascotas de ejemplo de los clientes demo
 *  - Credenciales demo de UN prestador real (Ponme Guapo, Puerto Ordaz)
 *  - Contactos CRM de muestra para ese prestador
 *  - Importación idempotente de los negocios reales
 *  - Limpieza de cualquier prestador ficticio residual
 *
 * Usado por prisma/seed.ts (CLI) y por /api/demo/reseed (botón admin).
 * Regenerar demoDb después: bun scripts/gen-demo-db.ts
 */
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/petservice/auth";

const CLIENTS: { email: string; name: string; phone: string }[] = [
  { email: "maria@demo.ve", name: "María González", phone: "+58 412 5550101" },
  { email: "jorge@demo.ve", name: "Jorge Ramírez", phone: "+58 414 5550202" },
  { email: "elena@demo.ve", name: "Elena Salazar", phone: "+58 416 5550303" },
  { email: "victor@demo.ve", name: "Víctor Hernández", phone: "+58 424 5550404" },
  { email: "genesis@demo.ve", name: "Génesis Marín", phone: "+58 412 5550505" },
  { email: "wuilmer@demo.ve", name: "Wuilmer Ferrer", phone: "+58 414 5550606" },
  { email: "yulimar@demo.ve", name: "Yulimar Rondón", phone: "+58 416 5550707" },
  { email: "daniela.sf@demo.ve", name: "Daniela Fuentes", phone: "+58 412 5550808" },
  { email: "alexander@demo.ve", name: "Alexander Rondón", phone: "+58 414 5550909" },
  { email: "nayeli@demo.ve", name: "Nayeli Vargas", phone: "+58 416 5551010" },
  { email: "gabriel@demo.ve", name: "Gabriel Mendoza", phone: "+58 424 5551111" },
  { email: "estefania@demo.ve", name: "Estefanía Colmenarez", phone: "+58 412 5551212" },
  { email: "ricardo@demo.ve", name: "Ricardo Escalona", phone: "+58 414 5551313" },
];

const PETS: { owner: string; name: string; species: string; breed: string; size: string; notes?: string }[] = [
  { owner: "maria@demo.ve", name: "Luna", species: "PERRO", breed: "Maltés", size: "S", notes: "Nerviosa con los secadores, usar toalla." },
  { owner: "maria@demo.ve", name: "Simón", species: "PERRO", breed: "Mestizo", size: "L", notes: "Muy energético, adora correr por el malecón." },
  { owner: "maria@demo.ve", name: "Mia", species: "GATO", breed: "Siamés", size: "S", notes: "Solo con prestadores certificados para gatos." },
  { owner: "jorge@demo.ve", name: "Thor", species: "PERRO", breed: "Labrador", size: "L", notes: "Adora el agua, ideal pasearlo cerca del Caroní." },
  { owner: "jorge@demo.ve", name: "Nala", species: "PERRO", breed: "Beagle", size: "M" },
  { owner: "elena@demo.ve", name: "Mishi", species: "GATO", breed: "Criollo", size: "S", notes: "Sale al patio, revisar garrapatas." },
  { owner: "elena@demo.ve", name: "Coco", species: "PERRO", breed: "Poodle", size: "S" },
  { owner: "victor@demo.ve", name: "Rocky", species: "PERRO", breed: "Criollo", size: "M", notes: "Reservado con extraños al principio." },
  { owner: "genesis@demo.ve", name: "Pancho", species: "PERRO", breed: "Schnauzer", size: "S" },
  { owner: "wuilmer@demo.ve", name: "Pelusa", species: "GATO", breed: "Angora", size: "S", notes: "Desmate obligatorio cada 2 meses." },
  { owner: "wuilmer@demo.ve", name: "Beya", species: "PERRO", breed: "Dóberman", size: "L" },
  { owner: "yulimar@demo.ve", name: "Rey", species: "PERRO", breed: "Husky", size: "L", notes: "Cepillado frecuente por el manto." },
  { owner: "yulimar@demo.ve", name: "Kira", species: "PERRO", breed: "Pomerania", size: "S" },
  { owner: "daniela.sf@demo.ve", name: "Bolt", species: "PERRO", breed: "Border Collie", size: "M", notes: "Inteligente y juguetón, ama el frisbee." },
  { owner: "daniela.sf@demo.ve", name: "Nina", species: "GATO", breed: "Bombay", size: "S", notes: "Muy mansa, se esconde bajo la cama al principio." },
  { owner: "alexander@demo.ve", name: "Papí", species: "PERRO", breed: "Chihuahua", size: "S", notes: "Pequeño pero ruidoso; mejor pasearlo solo." },
  { owner: "alexander@demo.ve", name: "Lola", species: "GATO", breed: "Criolla", size: "S" },
  { owner: "nayeli@demo.ve", name: "Brutus", species: "PERRO", breed: "Rottweiler", size: "L", notes: "Necesita paseo firme con correa doble." },
  { owner: "gabriel@demo.ve", name: "Chispita", species: "PERRO", breed: "Poodle Toy", size: "S", notes: "Cita cada 3 semanas por el pelo." },
  { owner: "estefania@demo.ve", name: "Manteca", species: "GATO", breed: "Naranja criollo", size: "M", notes: "Gordito adorable, dieta por indicación del vet." },
  { owner: "ricardo@demo.ve", name: "Zeus", species: "PERRO", breed: "Pitbull", size: "M", notes: "Sociable con perros, adora nadar en el Caroní." },
];

export async function seedAll() {
  console.log("🐾 Seed PetService VE — SOLO datos reales…");

  // ── 1) Settings: solo crear si falta (NUNCA pisa la tasa BCV existente) ──
  await db.settings.upsert({
    where: { id: "main" },
    update: {},
    create: { id: "main", usdToBs: 40, commissionPct: 5, defaultRadiusKm: 8 },
  });

  // ── 2) Limpieza de prestadores ficticios residuales (+ su historial) ──
  const { wipeFictionalProviders } = await import("@/lib/petservice/real-osm");
  const wipe = await wipeFictionalProviders();
  if (wipe.providers) console.log(`   - Prestadores ficticios eliminados: ${wipe.providers}`);

  // ── 3) Cuentas demo de clientes y admin (idempotente) ──
  const pwdClient = await hashPassword("demo1234");
  const pwdAdmin = await hashPassword("admin1234");
  const users: Record<string, { id: string }> = {};
  for (const c of CLIENTS) {
    users[c.email] = await db.user.upsert({
      where: { email: c.email },
      update: { active: true },
      create: { email: c.email, name: c.name, phone: c.phone, role: "CLIENT", passwordHash: pwdClient },
    });
  }
  await db.user.upsert({
    where: { email: "admin@petservice.ve" },
    update: { active: true },
    create: { email: "admin@petservice.ve", name: "Admin PetService", phone: "+58 412 5550000", role: "ADMIN", passwordHash: pwdAdmin },
  });

  // Usuario real del propietario (para probar recuperación de contraseña)
  await db.user.upsert({
    where: { email: "sergioromeroinforma@gmail.com" },
    update: {},
    create: { email: "sergioromeroinforma@gmail.com", name: "Sergio Romero", phone: "+58 414 0000000", role: "CLIENT", passwordHash: pwdClient },
  });

  // ── 4) Mascotas de ejemplo (idempotente) ──
  let petsCreated = 0;
  for (const p of PETS) {
    const owner = users[p.owner];
    if (!owner) continue;
    const exists = await db.pet.findFirst({ where: { ownerId: owner.id, name: p.name } });
    if (exists) continue;
    await db.pet.create({ data: { ownerId: owner.id, name: p.name, species: p.species, breed: p.breed, size: p.size, notes: p.notes ?? null } });
    petsCreated++;
  }

  // ── 5) Negocios REALES (idempotente): Bolívar (investigación) + OpenStreetMap ──
  try {
    const { syncRealBusinesses } = await import("@/lib/petservice/real-bolivar");
    const bolivar = await syncRealBusinesses();
    console.log(`   - Negocios reales Bolívar: +${bolivar.created} (omitidos: ${bolivar.skipped})`);
  } catch (err) {
    console.warn("⚠️ Bolívar:", err instanceof Error ? err.message : err);
  }
  try {
    const { syncRealOsmBusinesses } = await import("@/lib/petservice/real-osm");
    const osm = await syncRealOsmBusinesses();
    console.log(`   - Negocios reales OpenStreetMap: +${osm.created} (omitidos: ${osm.skipped})`);
  } catch (err) {
    console.warn("⚠️ OpenStreetMap:", err instanceof Error ? err.message : err);
  }

  // ── 6) Prestador demo: credenciales conocidas sobre un negocio REAL ──
  const ponme = await db.provider.findFirst({ where: { businessName: { contains: "Ponme Guapo" } }, include: { user: true } });
  if (ponme) {
    await db.user.update({
      where: { id: ponme.userId },
      data: { email: "ponmeguapo@petservice.ve", passwordHash: await hashPassword("ponme1234") },
    });
  }

  // ── 7) Contactos CRM de muestra para el prestador demo (datos operativos) ──
  if (ponme) {
    const n = await db.crmContact.count({ where: { providerId: ponme.id } });
    if (n === 0) {
      await db.crmContact.createMany({
        data: [
          { providerId: ponme.id, name: "María Rodríguez", phone: "+58 414-8601939", email: "maria.rodriguez@example.com", petName: "Coco", petType: "PERRO", status: "VIP", tags: "VIP,Perros", notes: "Cliente de prueba (demo)", totalVisits: 5, totalSpentUsd: 85 },
          { providerId: ponme.id, name: "Carlos Pérez", phone: "+58 424-9299390", petName: "Luna", petType: "GATO", status: "ACTIVO", tags: "Gatos,Adeuda", notes: "Cliente de prueba (demo)", totalVisits: 2, totalSpentUsd: 30 },
          { providerId: ponme.id, name: "Ana Gómez", phone: "+58 412-5550000", petName: "Rocky", petType: "PERRO", status: "NUEVO", tags: "Perros", notes: "Cliente de prueba (demo)", totalVisits: 0, totalSpentUsd: 0 },
        ],
      });
    }
  }

  console.log("✅ Seed (solo datos reales) completado:");
  console.log(`   - Usuarios: ${await db.user.count()} | Mascotas nuevas: ${petsCreated}`);
  console.log(`   - Prestadores REALES: ${await db.provider.count()} | Servicios: ${await db.service.count()}`);
  console.log(`   - Prestadores ficticios: ${await db.provider.count({ where: { badges: { not: { contains: "REAL" } } } })}`);
}
