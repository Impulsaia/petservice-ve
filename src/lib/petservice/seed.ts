/**
 * PetService VE — Seed de datos demo del ESTADO BOLÍVAR (sintéticos, sin datos reales)
 * Cobertura: Puerto Ordaz + San Félix (Ciudad Guayana), Ciudad Bolívar y Upata
 * Usado por prisma/seed.ts (CLI) y por /api/demo/reseed (botón admin)
 *
 * Cuentas de prueba:
 *  - Cliente  : maria@demo.ve / demo1234
 *  - Prestador: carlos@petservice.ve / demo1234
 *  - Admin    : admin@petservice.ve / admin1234
 */
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/petservice/auth";

// Utilidades de fecha: manipulamos UTC para que el ISO string sea estable (VET = UTC-4)
function daysFromNow(days: number, hourUtc = 14, min = 0): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, min, 0, 0);
  return d;
}

const RATE = 40; // Bs. por USD
const COMMISSION = 15; // %

function bs(usd: number): number {
  return Math.round(usd * RATE * 100) / 100;
}

function commission(usd: number): number {
  return Math.round(usd * (COMMISSION / 100) * 100) / 100;
}

export async function seedAll() {
  console.log("🐾 Sembrando PetService VE — Estado Bolívar...");

  // Limpieza (orden por dependencias)
  await db.notification.deleteMany();
  await db.review.deleteMany();
  await db.payment.deleteMany();
  await db.booking.deleteMany();
  await db.service.deleteMany();
  await db.pet.deleteMany();
  await db.provider.deleteMany();
  await db.user.deleteMany();
  await db.settings.deleteMany();

  await db.settings.create({
    data: { id: "main", usdToBs: RATE, commissionPct: COMMISSION, defaultRadiusKm: 8 },
  });

  const [pwdClient, pwdAdmin] = await Promise.all([hashPassword("demo1234"), hashPassword("admin1234")]);

  // ──────────────── Clientes (13) ────────────────
  const clientsData = [
    { email: "maria@demo.ve", name: "María González", phone: "+58 412 5550101", zone: "Alta Vista" },
    { email: "jorge@demo.ve", name: "Jorge Ramírez", phone: "+58 414 5550202", zone: "Unare" },
    { email: "elena@demo.ve", name: "Elena Salazar", phone: "+58 416 5550303", zone: "Centro Histórico" },
    { email: "victor@demo.ve", name: "Víctor Hernández", phone: "+58 424 5550404", zone: "Vista Hermosa" },
    { email: "genesis@demo.ve", name: "Génesis Marín", phone: "+58 412 5550505", zone: "Upata Centro" },
    { email: "wuilmer@demo.ve", name: "Wuilmer Ferrer", phone: "+58 414 5550606", zone: "Villa América" },
    { email: "yulimar@demo.ve", name: "Yulimar Rondón", phone: "+58 416 5550707", zone: "Las Mercedes" },
    // San Félix y zonas circunvecinas
    { email: "daniela.sf@demo.ve", name: "Daniela Fuentes", phone: "+58 412 5550808", zone: "San Félix Centro" },
    { email: "alexander@demo.ve", name: "Alexander Rondón", phone: "+58 414 5550909", zone: "El Roble" },
    { email: "nayeli@demo.ve", name: "Nayeli Vargas", phone: "+58 416 5551010", zone: "Los Olivos" },
    { email: "gabriel@demo.ve", name: "Gabriel Mendoza", phone: "+58 424 5551111", zone: "11 de Abril" },
    { email: "estefania@demo.ve", name: "Estefanía Colmenarez", phone: "+58 412 5551212", zone: "Dalla Costa" },
    { email: "ricardo@demo.ve", name: "Ricardo Escalona", phone: "+58 414 5551313", zone: "Guaicara" },
  ];
  const clientZone: Record<string, string> = {};
  const clients: Record<string, { id: string; name: string; email: string }> = {};
  for (const c of clientsData) {
    const u = await db.user.create({
      data: { email: c.email, name: c.name, phone: c.phone, role: "CLIENT", passwordHash: pwdClient },
    });
    clients[c.email.split("@")[0]] = u;
    clientZone[c.email] = c.zone;
  }
  const maria = clients["maria"];
  const jorge = clients["jorge"];
  const elena = clients["elena"];
  const victor = clients["victor"];
  const genesis = clients["genesis"];
  const wuilmer = clients["wuilmer"];
  const yulimar = clients["yulimar"];
  const danielaSf = clients["daniela.sf"];
  const alexander = clients["alexander"];
  const nayeli = clients["nayeli"];
  const gabriel = clients["gabriel"];
  const estefania = clients["estefania"];
  const ricardo = clients["ricardo"];

  const admin = await db.user.create({
    data: { email: "admin@petservice.ve", name: "Admin PetService", phone: "+58 412 5550000", role: "ADMIN", passwordHash: pwdAdmin },
  });

  // ──────────────── Mascotas (22) ────────────────
  async function makePet(owner: { id: string }, name: string, species: string, breed: string, size: string, notes?: string) {
    return db.pet.create({ data: { ownerId: owner.id, name, species, breed, size, notes: notes ?? null } });
  }
  const luna = await makePet(maria, "Luna", "PERRO", "Maltés", "S", "Nerviosa con los secadores, usar toalla.");
  const simon = await makePet(maria, "Simón", "PERRO", "Mestizo", "L", "Muy energético, adora correr por el malecón.");
  const mia = await makePet(maria, "Mia", "GATO", "Siamés", "S", "Solo con prestadores certificados para gatos.");
  const thor = await makePet(jorge, "Thor", "PERRO", "Labrador", "L", "Adora el agua, ideal pasearlo cerca del Caroní.");
  const nala = await makePet(jorge, "Nala", "PERRO", "Beagle", "M");
  const mishi = await makePet(elena, "Mishi", "GATO", "Criollo", "S", "Sale al patio, revisar garrapatas.");
  const coco = await makePet(elena, "Coco", "PERRO", "Poodle", "S");
  const rocky = await makePet(victor, "Rocky", "PERRO", "Criollo", "M", "Reservado con extraños al principio.");
  const pancho = await makePet(genesis, "Pancho", "PERRO", "Schnauzer", "S");
  const pelusa = await makePet(wuilmer, "Pelusa", "GATO", "Angora", "S", "Desmate obligatorio cada 2 meses.");
  const beya = await makePet(wuilmer, "Beya", "PERRO", "Dóberman", "L");
  const rey = await makePet(yulimar, "Rey", "PERRO", "Husky", "L", "Cepillado frecuente por el manto.");
  const kira = await makePet(yulimar, "Kira", "PERRO", "Pomerania", "S");
  // Mascotas de clientes de San Félix
  const bolt = await makePet(danielaSf, "Bolt", "PERRO", "Border Collie", "M", "Inteligente y juguetón, ama el frisbee.");
  const nina = await makePet(danielaSf, "Nina", "GATO", "Bombay", "S", "Muy mansa, se esconde bajo la cama al principio.");
  const papi = await makePet(alexander, "Papí", "PERRO", "Chihuahua", "S", "Pequeño pero ruidoso; mejor pasearlo solo.");
  const lola = await makePet(alexander, "Lola", "GATO", "Criolla", "S");
  const brutus = await makePet(nayeli, "Brutus", "PERRO", "Rottweiler", "L", "Necesita paseo firme con correa doble.");
  const chispita = await makePet(gabriel, "Chispita", "PERRO", "Poodle Toy", "S", "Cita cada 3 semanas por el pelo.");
  const manteca = await makePet(estefania, "Manteca", "GATO", "Naranja criollo", "M", "Gordito adorable, dieta por indicación del vet.");
  const zeus = await makePet(ricardo, "Zeus", "PERRO", "Pitbull", "M", "Sociable con perros, adora nadar en el Caroní.");

  // ──────────────── Prestadores (25) ────────────────
  const scheduleFull = JSON.stringify({ "1": [["08:00", "17:00"]], "2": [["08:00", "17:00"]], "3": [["08:00", "17:00"]], "4": [["08:00", "17:00"]], "5": [["08:00", "16:00"]], "6": [["09:00", "13:00"]] });
  const scheduleLate = JSON.stringify({ "1": [["14:00", "19:00"]], "2": [["14:00", "19:00"]], "3": [["14:00", "19:00"]], "4": [["14:00", "19:00"]], "5": [["14:00", "19:00"]] });
  const scheduleEarly = JSON.stringify({ "1": [["06:00", "10:00"]], "2": [["06:00", "10:00"]], "3": [["06:00", "10:00"]], "4": [["06:00", "10:00"]], "5": [["06:00", "10:00"]], "6": [["07:00", "09:00"]], "7": [["07:00", "09:00"]] });

  interface ProvSeed {
    email: string; name: string; phone: string; businessName: string; bio: string;
    status: string; city: string; zoneName: string; lat: number; lng: number; radiusKm: number;
    ratingAvg: number; ratingCount: number; badges: string; schedule?: string;
  }
  const providersData: ProvSeed[] = [
    // Puerto Ordaz
    { email: "carlos@petservice.ve", name: "Carlos Pérez", phone: "+58 412 5551111", businessName: "Pet Spa VIP", bio: "Peluquería canina y felina premium a domicilio en Puerto Ordaz. +8 años de experiencia, certificado en grooming internacional. Tu mascota relajada y hermosa sin salir de casa.", status: "VERIFIED", city: "Puerto Ordaz", zoneName: "Alta Vista", lat: 8.2934, lng: -62.7454, radiusKm: 12, ratingAvg: 4.9, ratingCount: 48, badges: "VERIFICADO,TOP,GATOS", schedule: scheduleFull },
    { email: "andreina@petservice.ve", name: "Andreína Rojas", phone: "+58 414 5552222", businessName: "Andreína Grooming Studio", bio: "Estilismo canino y felino en Villa América con productos hipoalergénicos. Especialista en razas pequeñas y gatos.", status: "VERIFIED", city: "Puerto Ordaz", zoneName: "Villa América", lat: 8.2808, lng: -62.7715, radiusKm: 9, ratingAvg: 4.7, ratingCount: 31, badges: "VERIFICADO,GATOS", schedule: scheduleLate },
    { email: "luis@petservice.ve", name: "Luis Márquez", phone: "+58 412 5553333", businessName: "PetShop Express Guayana", bio: "Delivery de alimentos, medicinas y accesorios en Puerto Ordaz en menos de 2 horas. Distribuidor autorizado de Royal Canin, Pro Plan y Nupec.", status: "VERIFIED", city: "Puerto Ordaz", zoneName: "Villa América", lat: 8.2821, lng: -62.7762, radiusKm: 18, ratingAvg: 4.6, ratingCount: 62, badges: "VERIFICADO,EXPRESS", schedule: scheduleFull },
    { email: "mafer@petservice.ve", name: "María Fernanda Silva", phone: "+58 416 5554444", businessName: "Cuidando Patitas Guayana", bio: "Pet sitting a domicilio en la zona de Unare con reportes y fotos diarias. Veterinaria con 6 años de experiencia en cuidado de mascotas.", status: "VERIFIED", city: "Puerto Ordaz", zoneName: "Unare", lat: 8.2646, lng: -62.7403, radiusKm: 8, ratingAvg: 4.8, ratingCount: 27, badges: "VERIFICADO,GATOS", schedule: scheduleFull },
    { email: "jose@petservice.ve", name: "José Rodríguez", phone: "+58 424 5555555", businessName: "Paseos Felices Caroní", bio: "Paseos grupales e individuales por Alta Vista y el Paseo Caroní con reporte de ruta. Adiestrador canino certificado.", status: "VERIFIED", city: "Puerto Ordaz", zoneName: "Alta Vista", lat: 8.2961, lng: -62.7492, radiusKm: 7, ratingAvg: 4.9, ratingCount: 89, badges: "VERIFICADO,TOP", schedule: scheduleFull },
    { email: "gaby@petservice.ve", name: "Gabriela Torres", phone: "+58 412 5556666", businessName: "Escuela Canina Gaby", bio: "Adiestramiento básico y modificación de conducta a domicilio en Los Mangos y alrededores. Refuerzo positivo, sin castigos.", status: "VERIFIED", city: "Puerto Ordaz", zoneName: "Los Mangos", lat: 8.2950, lng: -62.7687, radiusKm: 14, ratingAvg: 4.7, ratingCount: 19, badges: "VERIFICADO", schedule: scheduleFull },
    { email: "valeria@petservice.ve", name: "Valeria Mendoza", phone: "+58 414 5557777", businessName: "Móvil Spa Animal", bio: "Baño y spa móvil profesional en Villa Colombia: ¡la peluquería llega a tu puerta! Unidad equipada con agua caliente y fría.", status: "VERIFIED", city: "Puerto Ordaz", zoneName: "Villa Colombia", lat: 8.2752, lng: -62.7657, radiusKm: 11, ratingAvg: 4.8, ratingCount: 22, badges: "VERIFICADO,TOP", schedule: scheduleFull },
    { email: "pedro@petservice.ve", name: "Pedro Contreras", phone: "+58 416 5558888", businessName: "PetTaxi Guayana", bio: "Transporte seguro de mascotas en Ciudad Guayana con jaulas climatizadas. Traslados a veterinarias de San Félix, Puerto Ordaz y el aeropuerto.", status: "PENDING", city: "San Félix", zoneName: "El Roble", lat: 8.2550, lng: -62.7930, radiusKm: 25, ratingAvg: 0, ratingCount: 0, badges: "", schedule: scheduleFull },
    { email: "ramon@petservice.ve", name: "Ramón Ojeda", phone: "+58 412 5559999", businessName: "Delivery Patas Caroní", bio: "Entregas exprés de comida, arenas y antipulgas en Unare y Villa América. Motorizado con caja porta-paquetes.", status: "VERIFIED", city: "Puerto Ordaz", zoneName: "Unare", lat: 8.2682, lng: -62.7449, radiusKm: 15, ratingAvg: 4.5, ratingCount: 38, badges: "VERIFICADO,EXPRESS", schedule: scheduleFull },
    { email: "yeimi@petservice.ve", name: "Yeimi Suárez", phone: "+58 424 5551010", businessName: "Pet Spa La Llovizna", bio: "Grooming artesanal cerca del Parque La Llovizna. Cortes de raza, deshedding y baño antipulgas.", status: "VERIFIED", city: "Puerto Ordaz", zoneName: "La Llovizna", lat: 8.2608, lng: -62.7312, radiusKm: 10, ratingAvg: 4.6, ratingCount: 17, badges: "VERIFICADO,GATOS", schedule: scheduleLate },
    // San Félix y zonas circunvecinas
    { email: "wilmer.sf@petservice.ve", name: "Wilmer Sifontes", phone: "+58 412 5551919", businessName: "Grooming Caroní San Félix", bio: "Peluquería canina y felina a domicilio en todo San Félix: Centro Cívico, El Roble, Los Olivos y 11 de Abril. Cortes de raza y baños medicados.", status: "VERIFIED", city: "San Félix", zoneName: "San Félix Centro", lat: 8.2506, lng: -62.8047, radiusKm: 11, ratingAvg: 4.8, ratingCount: 29, badges: "VERIFICADO,TOP,GATOS", schedule: scheduleFull },
    { email: "yoselin@petservice.ve", name: "Yoselín Marcano", phone: "+58 414 5552020", businessName: "La Casita de las Mascotas", bio: "Pet sitting en Los Olivos y Villa Española. Tu peludito en su propia casa: visitas, comida, juegos y reporte con fotos por WhatsApp.", status: "VERIFIED", city: "San Félix", zoneName: "Los Olivos", lat: 8.2646, lng: -62.8176, radiusKm: 9, ratingAvg: 4.9, ratingCount: 24, badges: "VERIFICADO,TOP,GATOS", schedule: scheduleFull },
    { email: "jesus.a@petservice.ve", name: "Jesús Adrián", phone: "+58 416 5552121", businessName: "Delivery Animal SF", bio: "Delivery de alimentos, arenas, medicinas y antipulgas en San Félix y El Roble. Distribuidor de Royal Canin, Nupec y Vitalcan. Entrega el mismo día.", status: "VERIFIED", city: "San Félix", zoneName: "Villa Española", lat: 8.2576, lng: -62.8118, radiusKm: 16, ratingAvg: 4.6, ratingCount: 41, badges: "VERIFICADO,EXPRESS", schedule: scheduleFull },
    { email: "keiver@petservice.ve", name: "Keiver Salazar", phone: "+58 424 5552222", businessName: "Paseos 11 de Abril", bio: "Dog walking en 11 de Abril, Dalla Costa y Caratal. Paseos grupales por la mañana y individuales en la tarde, con reporte de ruta.", status: "VERIFIED", city: "San Félix", zoneName: "11 de Abril", lat: 8.2400, lng: -62.8050, radiusKm: 8, ratingAvg: 4.7, ratingCount: 18, badges: "VERIFICADO", schedule: scheduleEarly },
    { email: "mileidis@petservice.ve", name: "Mileidis Ponce", phone: "+58 412 5552323", businessName: "Spa Móvil Guayana Este", bio: "Unidad móvil de baño y spa en Las Américas y San Félix Centro. Agua caliente, mesa antideslizante y secado sin jaulas.", status: "VERIFIED", city: "San Félix", zoneName: "Las Américas", lat: 8.2472, lng: -62.8146, radiusKm: 12, ratingAvg: 4.8, ratingCount: 20, badges: "VERIFICADO,TOP", schedule: scheduleFull },
    { email: "freddy@petservice.ve", name: "Freddy Núñez", phone: "+58 414 5552424", businessName: "Adiestra Guayana", bio: "Adiestramiento canino en Los Tanques y El Niño: obediencia básica, corrección de conducta y socialización. Sesiones a domicilio.", status: "VERIFIED", city: "San Félix", zoneName: "Los Tanques", lat: 8.2600, lng: -62.7990, radiusKm: 14, ratingAvg: 4.7, ratingCount: 15, badges: "VERIFICADO", schedule: scheduleLate },
    { email: "pettaxi.dc@petservice.ve", name: "Josmar Rivas", phone: "+58 416 5552525", businessName: "PetTaxi Dalla Costa", bio: "Traslados de mascotas en Dalla Costa, La Cruz y Caruachi. Jaulas climatizadas, chofer certificado y seguimiento por WhatsApp.", status: "PENDING", city: "San Félix", zoneName: "Dalla Costa", lat: 8.2330, lng: -62.8090, radiusKm: 22, ratingAvg: 0, ratingCount: 0, badges: "", schedule: scheduleFull },
    { email: "rosangela@petservice.ve", name: "Rosángela Petit", phone: "+58 412 5552626", businessName: "Patitas de Guaicara", bio: "Baño y corte a domicilio en Guaicara, Caratal y El Palúu. Atención cariñosa para perritos y gatitos de la zona sur de San Félix.", status: "PENDING", city: "San Félix", zoneName: "Guaicara", lat: 8.2270, lng: -62.8170, radiusKm: 10, ratingAvg: 0, ratingCount: 0, badges: "", schedule: scheduleLate },
    { email: "jhon.paluu@petservice.ve", name: "Jhon Caraballo", phone: "+58 424 5552727", businessName: "El Palúu Pet Care", bio: "Pet sitting y paseos en El Palúu y las riberas del Orinoco. Paseos fresquitos al amanecer y cuidado nocturno en tu casa.", status: "VERIFIED", city: "San Félix", zoneName: "El Palúu", lat: 8.2120, lng: -62.8380, radiusKm: 12, ratingAvg: 4.6, ratingCount: 12, badges: "VERIFICADO", schedule: scheduleEarly },
    // Veterinarios y afines (VET) — uno por ciudad
    { email: "adriana.vet@petservice.ve", name: "Dra. Adriana Mendoza", phone: "+58 414 5553131", businessName: "Veterinaria Caroní 24H", bio: "Consultas veterinarias a domicilio en San Félix y zona este de Ciudad Guayana. Consulta general, vacunación, desparasitación y certificados de salud. MV (UCV), colegiada CV-12890.", status: "VERIFIED", city: "San Félix", zoneName: "San Félix Centro", lat: 8.2515, lng: -62.8030, radiusKm: 14, ratingAvg: 4.9, ratingCount: 36, badges: "VERIFICADO,TOP", schedule: scheduleFull },
    { email: "karla.vet@petservice.ve", name: "Dra. Karla Fernández", phone: "+58 412 5553232", businessName: "Vet Unare a Domicilio", bio: "Medicina veterinaria a domicilio en Puerto Ordaz: chequeos, vacunas, desparasitación y cuidados geriátricos en tu casa, sin estrés para tu peludito.", status: "VERIFIED", city: "Puerto Ordaz", zoneName: "Unare", lat: 8.2655, lng: -62.7390, radiusKm: 12, ratingAvg: 4.8, ratingCount: 28, badges: "VERIFICADO,GATOS", schedule: scheduleLate },
    { email: "manuel.vet@petservice.ve", name: "Dr. Manuel Ruiz", phone: "+58 416 5553333", businessName: "VetOrinoco Consultas", bio: "Consultas veterinarias en el casco histórico y Ciudad Bolívar en general. Vacunación, desparasitación, control de peso y primera consulta para cachorros y michis.", status: "VERIFIED", city: "Ciudad Bolívar", zoneName: "Centro Histórico", lat: 8.1245, lng: -63.5470, radiusKm: 10, ratingAvg: 4.7, ratingCount: 19, badges: "VERIFICADO", schedule: scheduleFull },
    { email: "elias.vet@petservice.ve", name: "Dr. Elías Maita", phone: "+58 424 5553434", businessName: "Veterinaria El Toro Upata", bio: "Atención veterinaria a domicilio en Upata y alrededores. Consultas, vacunación anual, desparasitación y orientación para cachorros. Atención honesta y cercana.", status: "VERIFIED", city: "Upata", zoneName: "Upata Centro", lat: 8.0200, lng: -62.4055, radiusKm: 12, ratingAvg: 4.8, ratingCount: 15, badges: "VERIFICADO", schedule: scheduleFull },
    // Ciudad Bolívar
    { email: "yeiner@petservice.ve", name: "Yeiner Salas", phone: "+58 412 5551212", businessName: "Grooming Orinoco", bio: "Peluquería canina y felina en el Casco Histórico de Ciudad Bolívar. Manejo sin estrés y productos dermatológicos.", status: "VERIFIED", city: "Ciudad Bolívar", zoneName: "Centro Histórico", lat: 8.1236, lng: -63.5486, radiusKm: 8, ratingAvg: 4.8, ratingCount: 26, badges: "VERIFICADO,GATOS", schedule: scheduleFull },
    { email: "daniela@petservice.ve", name: "Daniela Ramírez", phone: "+58 414 5551313", businessName: "Angostura Pet Sitting", bio: "Cuidado a domicilio en Vista Hermosa y La Sabanita. Ideal para viajes: visitas 3 veces al día con fotos.", status: "VERIFIED", city: "Ciudad Bolívar", zoneName: "Vista Hermosa", lat: 8.1322, lng: -63.5397, radiusKm: 7, ratingAvg: 4.9, ratingCount: 21, badges: "VERIFICADO,TOP", schedule: scheduleFull },
    { email: "edgar@petservice.ve", name: "Edgar Bermúdez", phone: "+58 416 5551414", businessName: "PetTaxi Angostura", bio: "Traslados de mascotas en Ciudad Bolívar: veterinarias, aeropuerto Tomás de Heres y Mudadero a Puerto Ordaz.", status: "PENDING", city: "Ciudad Bolívar", zoneName: "Paseo Orinoco", lat: 8.1205, lng: -63.5545, radiusKm: 20, ratingAvg: 0, ratingCount: 0, badges: "", schedule: scheduleFull },
    { email: "kellis@petservice.ve", name: "Kellis Fuentes", phone: "+58 424 5551515", businessName: "Patitas del Orinoco", bio: "Baño, corte y spa para perros y gatos en La Sabanita. Atención de una clienta al tiempo: calidad sobre cantidad.", status: "VERIFIED", city: "Ciudad Bolívar", zoneName: "La Sabanita", lat: 8.1097, lng: -63.5419, radiusKm: 9, ratingAvg: 4.7, ratingCount: 14, badges: "VERIFICADO,GATOS", schedule: scheduleLate },
    // Upata
    { email: "oswaldo@petservice.ve", name: "Oswaldo Brito", phone: "+58 412 5551616", businessName: "Paseos El Toro Patú", bio: "Paseos y entrenamiento canino en Upata. Rutas frescas temprano en la mañana con vista al famoso Cerro El Toro.", status: "VERIFIED", city: "Upata", zoneName: "El Cerro (Toro Patú)", lat: 8.0050, lng: -62.4020, radiusKm: 10, ratingAvg: 4.8, ratingCount: 33, badges: "VERIFICADO,TOP", schedule: scheduleEarly },
    { email: "mariana@petservice.ve", name: "Mariana Gutiérrez", phone: "+58 414 5551717", businessName: "Upata Pet Lovers", bio: "Peluquería y pet sitting en el centro de Upata. Nueva en la plataforma, con 4 años de experiencia local.", status: "PENDING", city: "Upata", zoneName: "Upata Centro", lat: 8.0194, lng: -62.4066, radiusKm: 8, ratingAvg: 0, ratingCount: 0, badges: "", schedule: scheduleFull },
  ];

  const prov: Record<string, { id: string; businessName: string; zoneName: string; city: string; userId: string; email: string }> = {};
  for (const p of providersData) {
    const u = await db.user.create({
      data: { email: p.email, name: p.name, phone: p.phone, role: "PROVIDER", passwordHash: pwdClient },
    });
    const pr = await db.provider.create({
      data: {
        userId: u.id, businessName: p.businessName, bio: p.bio, status: p.status,
        city: p.city, zoneName: p.zoneName, lat: p.lat, lng: p.lng, radiusKm: p.radiusKm,
        scheduleJson: p.schedule ?? scheduleFull, ratingAvg: p.ratingAvg, ratingCount: p.ratingCount, badges: p.badges,
      },
    });
    prov[p.email.split("@")[0]] = { id: pr.id, businessName: p.businessName, zoneName: p.zoneName, city: p.city, userId: u.id, email: p.email };
  }

  // ──────────────── Servicios (~30) ────────────────
  const EXTRAS_GROOM = JSON.stringify([
    { name: "Corte de uñas", usd: 3 },
    { name: "Perfume canino", usd: 2 },
    { name: "Limpieza dental", usd: 5 },
    { name: "Desparasitación externa", usd: 4 },
  ]);
  const EXTRAS_WALK = JSON.stringify([
    { name: "Paseo extendido (+30 min)", usd: 4 },
    { name: "Reporte de ruta en vivo", usd: 2 },
  ]);
  const EXTRAS_DELIVERY = JSON.stringify([
    { name: "Entrega express (1 hora)", usd: 3 },
    { name: "Empaque para regalo", usd: 2 },
  ]);

  async function makeSvc(providerKey: string, category: string, name: string, description: string, durationMin: number, priceUsd: number, opts: Partial<{ modality: string; petTypes: string; petSizes: string; extrasJson: string }> = {}) {
    return db.service.create({
      data: {
        providerId: prov[providerKey].id, category, name, description, durationMin, priceUsd,
        modality: opts.modality ?? "DOMICILIO", petTypes: opts.petTypes ?? "PERRO,GATO",
        petSizes: opts.petSizes ?? "S,M,L", extrasJson: opts.extrasJson ?? "[]",
      },
    });
  }

  // Puerto Ordaz
  const svcCarlosBano = await makeSvc("carlos", "GROOMING", "Baño y corte a domicilio", "Baño con shampoo premium, secado, corte de raza o a gusto, cepillado y colonia. Incluye revisión de oídos. Cobertura Alta Vista, Unare y Cachamay.", 60, 18, { extrasJson: EXTRAS_GROOM });
  const svcCarlosSpa = await makeSvc("carlos", "SPA_MOVIL", "Spa completo premium", "Experiencia spa completa: baño hidratante, masaje relajante, mascarilla capilar, corte, uñas y perfume.", 90, 35, { extrasJson: EXTRAS_GROOM });
  const svcCarlosGato = await makeSvc("carlos", "GROOMING", "Baño para gatos", "Baño especializado para gatos con productos sin perfume, secado suave y desmate.", 60, 20, { petTypes: "GATO" });
  await makeSvc("andreina", "GROOMING", "Grooming felino completo", "Baño, corte y cepillado para gatos. Manejo sin estrés con técnicas de sujeción amable.", 60, 22, { petTypes: "GATO", extrasJson: EXTRAS_GROOM });
  await makeSvc("andreina", "GROOMING", "Baño y estilismo pequeño", "Para perros pequeños (S): baño, corte de raza, uñas y lazo o bandana de regalo.", 60, 16, { petSizes: "S", extrasJson: EXTRAS_GROOM });
  const svcLuisFood = await makeSvc("luis", "DELIVERY", "Delivery de comida premium", "Entrega de alimento seco/húmedo para perros y gatos. Marcas: Royal Canin, Pro Plan, Nupec. Entrega en el día en toda Ciudad Guayana.", 45, 5, { extrasJson: EXTRAS_DELIVERY });
  await makeSvc("luis", "DELIVERY", "Delivery de medicinas y accesorios", "Medicinas veterinarias, antipulgas, juguetes y camas. Pedidos confirmados por WhatsApp.", 45, 4, { extrasJson: EXTRAS_DELIVERY });
  const svcMaferDia = await makeSvc("mafer", "PET_SITTING", "Pet sitting por día", "Cuidado en tu hogar en Unare: alimentación, paseos, juegos y fotos/reportes diarios. Ideal para viajes a Ciudad Bolívar o Caracas.", 480, 20);
  await makeSvc("mafer", "PET_SITTING", "Visita de 2 horas", "Visita de acompañamiento: comida, agua fresca, aseo de arenero y mucho cariño.", 120, 10);
  const svcJosePaseo = await makeSvc("jose", "DOG_WALKING", "Paseo individual 45 min", "Paseo uno a uno por el Paseo Caroní y parques de Alta Vista con agua y premios. Foto del paseo incluida.", 45, 8, { petTypes: "PERRO", extrasJson: EXTRAS_WALK });
  await makeSvc("jose", "DOG_WALKING", "Plan semanal (5 paseos)", "Cinco paseos individuales de 45 minutos en la semana, con reporte diario.", 45, 35, { petTypes: "PERRO", extrasJson: EXTRAS_WALK });
  await makeSvc("gaby", "TRAINING", "Sesión de obediencia básica", "Sesión de 90 min: sentado, quieto, caminar con correa. Incluye guía PDF para practicar en casa.", 90, 25, { petTypes: "PERRO" });
  await makeSvc("gaby", "TRAINING", "Consulta de conducta", "Evaluación de problemas de conducta (ansiedad, ladridos, destructividad) y plan de trabajo.", 60, 18, { petTypes: "PERRO,GATO" });
  const svcValeriaMovil = await makeSvc("valeria", "SPA_MOVIL", "Baño móvil integral", "Unidad móvil equipada: baño tibio, secado, cepillado, corte de uñas y perfume. Sin jaulas.", 60, 24, { extrasJson: EXTRAS_GROOM });
  await makeSvc("valeria", "GROOMING", "Corte y baño para perro grande", "Especial para razas grandes (L): deshedding, baño, corte y perfilado.", 90, 32, { petSizes: "L", petTypes: "PERRO", extrasJson: EXTRAS_GROOM });
  await makeSvc("ramon", "DELIVERY", "Delivery exprés Unare/Villa América", "Alimentos, arenas sanitarias y antipulgas con entrega en menos de 90 minutos.", 45, 4, { extrasJson: EXTRAS_DELIVERY });
  await makeSvc("yeimi", "GROOMING", "Baño antipulgas + corte", "Baño con shampoo antipulgas, corte de raza o a gusto y cepillado deshedding.", 75, 16, { extrasJson: EXTRAS_GROOM });
  await makeSvc("yeimi", "GROOMING", "Desmate felino", "Sesión de desmate para gatos de pelo largo, sin sedación y con pausas de juego.", 45, 14, { petTypes: "GATO" });
  // Ciudad Bolívar
  const svcYeinerBano = await makeSvc("yeiner", "GROOMING", "Baño y corte Casco Histórico", "Baño, corte y colonia para perros y gatos en el centro de Ciudad Bolívar. Servicio a domicilio en zonas céntricas.", 60, 15, { extrasJson: EXTRAS_GROOM });
  await makeSvc("yeiner", "SPA_MOVIL", "Spa del Orinoco", "Spa relajante completo con masaje y mascarilla. Ideal para perros grandes después de paseos por el Paseo Orinoco.", 90, 28, { extrasJson: EXTRAS_GROOM });
  const svcDanielaSitting = await makeSvc("daniela", "PET_SITTING", "Pet sitting por día (Angostura)", "Cuidado en tu hogar: 3 visitas diarias, alimentación, aseo y reporte con fotos por WhatsApp.", 480, 18, { petTypes: "PERRO,GATO" });
  await makeSvc("daniela", "PET_SITTING", "Visita express 1 hora", "Visita corta para comida, agua y arenero. Perfecta para jornadas largas de trabajo.", 60, 8, { petTypes: "PERRO,GATO" });
  await makeSvc("kellis", "GROOMING", "Baño y estilismo La Sabanita", "Baño, corte de raza y bandana. Atención personalizada, una mascota a la vez.", 75, 15, { extrasJson: EXTRAS_GROOM });
  await makeSvc("kellis", "GROOMING", "Paquete gato completo", "Baño sin estrés para gatos, desmate, uñas y limpieza de oídos.", 60, 18, { petTypes: "GATO", extrasJson: EXTRAS_GROOM });
  // Upata
  const svcOswaldoPaseo = await makeSvc("oswaldo", "DOG_WALKING", "Paseo fresco por Upata", "Paseo individual temprano (6:00–9:00 a.m.) por zonas frescas de Upata con reporte de ruta.", 45, 6, { petTypes: "PERRO", extrasJson: EXTRAS_WALK });
  await makeSvc("oswaldo", "TRAINING", "Adiestramiento El Toro", "Sesión de obediencia y socialización al pie del Cerro El Toro Patú. Refuerzo positivo.", 90, 20, { petTypes: "PERRO" });

  // San Félix y zonas circunvecinas
  const svcWilmerBano = await makeSvc("wilmer.sf", "GROOMING", "Baño y corte San Félix", "Baño con shampoo premium, corte de raza o a gusto, uñas, oídos y colonia. Cobertura en todo San Félix: Centro Cívico, El Roble y Los Olivos.", 60, 14, { extrasJson: EXTRAS_GROOM });
  await makeSvc("wilmer.sf", "GROOMING", "Baño medicado para piel sensible", "Baño con shampoo dermatológico recetado, ideal para alergias y dermatitis por el clima de Guayana.", 60, 17, { extrasJson: EXTRAS_GROOM });
  const svcYoselinDia = await makeSvc("yoselin", "PET_SITTING", "Pet sitting por día (Los Olivos)", "Cuidado en tu hogar en Los Olivos y Villa Española: 3 visitas diarias, alimentación, arenero y fotos por WhatsApp.", 480, 16, { petTypes: "PERRO,GATO" });
  await makeSvc("yoselin", "PET_SITTING", "Cuidado nocturno", "Permanencia nocturna en tu casa para peluditos con ansiedad o recién operados. Incluye cena y paseo de la noche.", 720, 28, { petTypes: "PERRO,GATO" });
  const svcJesusFood = await makeSvc("jesus.a", "DELIVERY", "Delivery de comida en San Félix", "Alimento seco y húmedo (Royal Canin, Nupec, Vitalcan) entregado en el día en San Félix, El Roble y Los Olivos.", 45, 4, { extrasJson: EXTRAS_DELIVERY });
  await makeSvc("jesus.a", "DELIVERY", "Delivery de arenas y antipulgas", "Arena sanitaria, pipetas, collares antipulgas y medicinas de venta libre. Confirmación por WhatsApp.", 45, 3, { extrasJson: EXTRAS_DELIVERY });
  const svcKeiverPaseo = await makeSvc("keiver", "DOG_WALKING", "Paseo matinal 11 de Abril", "Paseo grupal por la mañana (máx. 3 perros) por 11 de Abril y Dalla Costa, con agua y reporte de ruta.", 40, 6, { petTypes: "PERRO", extrasJson: EXTRAS_WALK });
  await makeSvc("keiver", "DOG_WALKING", "Paseo individual tarde", "Paseo uno a uno en la tarde para perritos nerviosos o que necesitan atención dedicada.", 45, 8, { petTypes: "PERRO", extrasJson: EXTRAS_WALK });
  const svcMileidisMovil = await makeSvc("mileidis", "SPA_MOVIL", "Baño móvil San Félix Este", "Unidad móvil equipada llega a tu casa en Las Américas y San Félix Centro: baño tibio, secado, corte de uñas y perfume.", 60, 20, { extrasJson: EXTRAS_GROOM });
  await makeSvc("freddy", "TRAINING", "Obediencia básica a domicilio", "4 sesiones quincenales en tu casa (Los Tanques, El Niño y alrededores): sentado, quieto, junto y llamado.", 60, 22, { petTypes: "PERRO" });
  await makeSvc("freddy", "TRAINING", "Socialización para cachorros", "Sesión de socialización en parque seguro para cachorros de 2 a 6 meses, con guía para el dueño.", 90, 18, { petTypes: "PERRO" });
  const svcJhonPaseo = await makeSvc("jhon.paluu", "DOG_WALKING", "Paseo amanecer El Palúu", "Paseo al amanecer por las riberas del Orinoco en El Palúu: clima fresco y ruta tranquila con reporte.", 45, 6, { petTypes: "PERRO", extrasJson: EXTRAS_WALK });
  await makeSvc("jhon.paluu", "PET_SITTING", "Visita de cuidado El Palúu", "Visita de 1 hora en El Palúu y Caruachi: comida, agua, aseo y mucho cariño con reporte por WhatsApp.", 60, 8, { petTypes: "PERRO,GATO" });

  // Veterinaria (VET) — consulta, vacunación y afines
  const EXTRAS_VET = JSON.stringify([
    { name: "Libreta sanitaria actualizada", usd: 2 },
    { name: "Control de peso y nutrición", usd: 3 },
  ]);
  const svcAdrianaConsulta = await makeSvc("adriana.vet", "VET", "Consulta veterinaria a domicilio", "Consulta general en tu casa (San Félix y Ciudad Guayana este): evaluación física, temperatura, hidratación y recomendaciones. Incluye libreta sanitaria.", 40, 15, { extrasJson: EXTRAS_VET });
  await makeSvc("adriana.vet", "VET", "Vacunación y desparasitación", "Aplicación de vacunas (múltiple, rabia, refuerzos) y desparasitación interna/externa con registro sanitario. Llevamos la bioterma.", 30, 20, { extrasJson: EXTRAS_VET });
  await makeSvc("adriana.vet", "VET", "Certificado de salud para viaje", "Certificado de salud en regla para viajes nacionales (aeropuerto Tomás de Heres o terminal): revisión completa y firma colegiada.", 30, 25, { extrasJson: EXTRAS_VET });
  const svcKarlaConsulta = await makeSvc("karla.vet", "VET", "Consulta a domicilio Puerto Ordaz", "Consulta general a domicilio en Unare, Alta Vista y alrededores: chequeo completo, control de peso y plan preventivo sin estresar a tu peludito.", 40, 18, { extrasJson: EXTRAS_VET });
  await makeSvc("karla.vet", "VET", "Chequeo geriátrico en casa", "Evaluación integral para peluditos mayores de 8 años: movilidad, cardiorrespiratorio, dolor articular y recomendaciones de cuidado.", 60, 30, { extrasJson: EXTRAS_VET });
  const svcManuelConsulta = await makeSvc("manuel.vet", "VET", "Consulta veterinaria Casco Histórico", "Consulta a domicilio en Ciudad Bolívar: diagnóstico presuntivo, plan de salud y derivación a clínica si el caso lo requiere.", 40, 15, { extrasJson: EXTRAS_VET });
  await makeSvc("manuel.vet", "VET", "Primera consulta de cachorro/michi", "Chequeo completo para cachorros: calendario de vacunas, desparasitación, alimentación y socialización. Con guía impresa para el dueño.", 45, 14, { extrasJson: EXTRAS_VET });
  const svcEliasConsulta = await makeSvc("elias.vet", "VET", "Consulta a domicilio Upata", "Consulta veterinaria en tu casa en Upata Centro, Las Mercedes y La Concepción: evaluación general y plan de salud.", 40, 12, { extrasJson: EXTRAS_VET });
  await makeSvc("elias.vet", "VET", "Vacunación anual Upata", "Refuerzo anual de vacunas con libreta sanitaria al día. Ideal para perritos y michis que odian las clínicas.", 30, 15, { extrasJson: EXTRAS_VET });

  // ──────────────── Reseñas históricas (~40, nombres sintéticos de la región) ────────────────
  const reviewData: { providerKey: string; authorName: string; rating: number; comment: string; tags: string; daysAgo: number; response?: string }[] = [
    { providerKey: "carlos", authorName: "Ana Martínez", rating: 5, comment: "Carlos es un mago con los poodles. Mi Bobby salió precioso y relajado. Puntuales y súper amables.", tags: "PUNTUALIDAD,TRATO,LIMPIEZA", daysAgo: 3, response: "¡Gracias Ana! Bobby siempre es bienvenido 🐩" },
    { providerKey: "carlos", authorName: "Luisa Herrera", rating: 5, comment: "El spa premium vale cada dólar. Mi gata odia los baños y aquí la manejan con una paciencia increíble.", tags: "TRATO,PRECIO", daysAgo: 8 },
    { providerKey: "carlos", authorName: "Pedro Suárez", rating: 4, comment: "Muy buen servicio a domicilio en Alta Vista. Llegó 10 minutos tarde pero el trabajo fue excelente.", tags: "TRATO,LIMPIEZA", daysAgo: 15 },
    { providerKey: "carlos", authorName: "Génesis Rondón", rating: 5, comment: "El mejor grooming de Puerto Ordaz, sin exagerar. Mi schnauzer sale perfecto cada mes.", tags: "LIMPIEZA,TRATO", daysAgo: 21 },
    { providerKey: "andreina", authorName: "Carla Pérez", rating: 5, comment: "Con mis dos gatos fue un amor. Desmate a mi Persa sin traumatizarlo. Recomendadísima en Villa América.", tags: "TRATO,LIMPIEZA", daysAgo: 5 },
    { providerKey: "andreina", authorName: "Omar Blanco", rating: 4, comment: "Buen estilismo, productos de calidad. Volveré seguro.", tags: "PRECIO", daysAgo: 12 },
    { providerKey: "luis", authorName: "Daniela Rojas", rating: 5, comment: "Pedí el alimento a las 10am y a las 11:30 ya estaba en mi casa en Unare. Una salvación con dos perros grandes.", tags: "PUNTUALIDAD,PRECIO", daysAgo: 2, response: "¡Para servirte! 🐕" },
    { providerKey: "luis", authorName: "Rafael Colmenares", rating: 4, comment: "Buen servicio, aunque faltaba un sabor que pedí. Me avisaron y lo solucionaron rápido.", tags: "PUNTUALIDAD", daysAgo: 9 },
    { providerKey: "luis", authorName: "Franklin Cova", rating: 5, comment: "Precios justos en dólares y bolívares, y entregan en todo Puerto Ordaz. Muy confiables.", tags: "PRECIO,PUNTUALIDAD", daysAgo: 17 },
    { providerKey: "mafer", authorName: "Valeria Ruiz", rating: 5, comment: "Me fui de viaje 5 días tranquila: fotos diarias de mi gata feliz. No cambia nada como su casa.", tags: "TRATO,PUNTUALIDAD", daysAgo: 7 },
    { providerKey: "mafer", authorName: "Iván Salazar", rating: 5, comment: "Excelente con gatos nerviosos. Reportes detallados y mucho cariño.", tags: "TRATO,LIMPIEZA", daysAgo: 20 },
    { providerKey: "jose", authorName: "Mariana Ochoa", rating: 5, comment: "Simón adora a José y vuelve feliz y cansado. El reporte de ruta por el Paseo Caroní es un plus genial.", tags: "PUNTUALIDAD,TRATO", daysAgo: 1 },
    { providerKey: "jose", authorName: "Felipe Gómez", rating: 5, comment: "Llevo 3 meses usando el plan semanal. Puntualísimo y mi perro lo espera en la puerta.", tags: "PUNTUALIDAD,PRECIO", daysAgo: 11 },
    { providerKey: "jose", authorName: "Sofía Marín", rating: 4, comment: "Muy buen paseador. A veces se demora un poco entre paseos pero avisa.", tags: "TRATO", daysAgo: 18 },
    { providerKey: "gaby", authorName: "Renzo Di Stefano", rating: 5, comment: "En 3 sesiones mi cachorro ya camina con correa sin jalar. Métodos amables y efectivos.", tags: "TRATO,PRECIO", daysAgo: 10 },
    { providerKey: "valeria", authorName: "Gaby Fernández", rating: 5, comment: "La unidad móvil es espectacular, mi perro grande sale perfecto sin el estrés del viaje.", tags: "LIMPIEZA,TRATO", daysAgo: 4 },
    { providerKey: "valeria", authorName: "Néstor Ríos", rating: 4, comment: "Muy cómodo el servicio en casa. Buen precio para el tamaño de mi perro.", tags: "PRECIO", daysAgo: 14 },
    { providerKey: "ramon", authorName: "José Gregorio M.", rating: 5, comment: "Delivery rapidísimo en Unare. La arena sanitaria llegó bien empaquetada y con bolsita de regalo.", tags: "PUNTUALIDAD", daysAgo: 6 },
    { providerKey: "ramon", authorName: "Priscila Armas", rating: 4, comment: "Buen precio y buena disposición. Recomendado para compras pesadas.", tags: "PRECIO", daysAgo: 13 },
    { providerKey: "yeimi", authorName: "Douglas Ovalles", rating: 5, comment: "El baño antipulgas le vino perfecto a mi perro por el clima de La Llovizna. Sale oliendo riquísimo.", tags: "LIMPIEZA,TRATO", daysAgo: 5 },
    { providerKey: "yeimi", authorName: "Sara Villanueva", rating: 4, comment: "Muy paciente con mi gata de pelo largo. El desmate quedó bueno.", tags: "TRATO", daysAgo: 16 },
    { providerKey: "yeiner", authorName: "María Auxiliadora R.", rating: 5, comment: "Yeiner cuida cada detalle. Mi criollo sale como modelo de comercial en el Casco Histórico.", tags: "LIMPIEZA,TRATO", daysAgo: 3 },
    { providerKey: "yeiner", authorName: "Jhonny Escobar", rating: 5, comment: "Grooming puntual y baratísimo para la calidad. El spa del Orinoco es otro nivel.", tags: "PRECIO,TRATO", daysAgo: 9 },
    { providerKey: "daniela", authorName: "Gabriela Mendoza", rating: 5, comment: "Me fui a Caracas una semana y Mishi feliz en casa. Fotos 3 veces al día. Los mejores de Ciudad Bolívar.", tags: "TRATO,PUNTUALIDAD", daysAgo: 2 },
    { providerKey: "daniela", authorName: "Ángel Colmenares", rating: 5, comment: "Súper responsable. Te dejan el arenero impecable y la casa ordenada.", tags: "LIMPIEZA,TRATO", daysAgo: 12 },
    { providerKey: "kellis", authorName: "Virginia Palacios", rating: 5, comment: "Atención de una clienta a la vez: se nota. Mi shih tzu salió divino.", tags: "LIMPIEZA,TRATO", daysAgo: 4 },
    { providerKey: "kellis", authorName: "Rubén Darío L.", rating: 4, comment: "Muy bueno con gatos. Tuvo paciencia con mi gata gruñona.", tags: "TRATO", daysAgo: 15 },
    { providerKey: "oswaldo", authorName: "Karla Zambrano", rating: 5, comment: "Paseos a las 6am fresquitos en Upata. Rey (mi husky) lo adora y el reporte de ruta es genial.", tags: "PUNTUALIDAD,TRATO", daysAgo: 2 },
    { providerKey: "oswaldo", authorName: "Luis Fernando Peña", rating: 5, comment: "El adiestramiento al pie del Cerro El Toro funcionó de maravilla. Pancho ya obedece sentado y quieto.", tags: "TRATO,PRECIO", daysAgo: 8 },
    { providerKey: "oswaldo", authorName: "Milagros Sánchez", rating: 4, comment: "Muy buen paseador, honesto y puntual. Lo recomiendo en Upata.", tags: "PUNTUALIDAD", daysAgo: 19 },
    // San Félix y zonas circunvecinas
    { providerKey: "wilmer.sf", authorName: "Daniela Fuentes", rating: 5, comment: "Wilmer nos atiende en el Centro Cívico de San Félix. Bolt sale hermoso y el baño medicado le calma la piel. Un crack.", tags: "TRATO,LIMPIEZA", daysAgo: 3, response: "¡Gracias Daniela! Bolt es de mis favoritos 🐾" },
    { providerKey: "wilmer.sf", authorName: "Alexander Rondón", rating: 5, comment: "Baño y corte para mi chihuahua en El Roble. Puntual, barato y súper amable con Papi que es un gritón jaja.", tags: "PUNTUALIDAD,PRECIO", daysAgo: 9 },
    { providerKey: "wilmer.sf", authorName: "Nayeli Vargas", rating: 4, comment: "Muy buen grooming en Los Olivos. Con Brutus (rottweiler) necesito alguien fuerte y Wilmer lo maneja de maravilla.", tags: "TRATO", daysAgo: 16 },
    { providerKey: "yoselin", authorName: "Nayeli Vargas", rating: 5, comment: "Me fui de viaje 4 días y Yoselín mandó fotos 3 veces al día. Nina la ama. Lo mejor de San Félix para gatos.", tags: "TRATO,PUNTUALIDAD", daysAgo: 4 },
    { providerKey: "yoselin", authorName: "Estefanía Colmenarez", rating: 5, comment: "Cuidado nocturno impecable en Dalla Costa. Manteca (mi gatito) quedó feliz y la casa ordenada.", tags: "LIMPIEZA,TRATO", daysAgo: 11 },
    { providerKey: "jesus.a", authorName: "Gabriel Mendoza", rating: 5, comment: "El Nupec de Chispita llegó el mismo día a 11 de Abril. Precios en Bs. claritos y atención por WhatsApp rapidísima.", tags: "PUNTUALIDAD,PRECIO", daysAgo: 2, response: "¡A la orden, Gabriel! 🛵🐾" },
    { providerKey: "jesus.a", authorName: "Ricardo Escalona", rating: 4, comment: "Buen delivery en Guaicara. Faltó la marca que pedí pero me ofrecieron alternativa y rebaja.", tags: "PRECIO", daysAgo: 8 },
    { providerKey: "keiver", authorName: "Gabriel Mendoza", rating: 5, comment: "Keiver pasea a Chispita cada mañana por 11 de Abril. Reporte de ruta y hasta foto con la cuadrilla perruna.", tags: "PUNTUALIDAD,TRATO", daysAgo: 5 },
    { providerKey: "keiver", authorName: "Alexander Rondón", rating: 4, comment: "Buen paseo para Lola en Dalla Costa. A veces llega 10 min tarde pero avisa.", tags: "TRATO", daysAgo: 14 },
    { providerKey: "mileidis", authorName: "Daniela Fuentes", rating: 5, comment: "La unidad móvil llegó hasta mi casa en San Félix Centro. Nina se bañó sin salir del carro… todo sin jaulas. Espectacular.", tags: "LIMPIEZA,TRATO", daysAgo: 6 },
    { providerKey: "mileidis", authorName: "Wuilmer Ferrer", rating: 5, comment: "Probé el spa móvil en Las Américas por recomendación y quedó perfecto. Recomendado en Guayana Este.", tags: "PRECIO,LIMPIEZA", daysAgo: 13 },
    { providerKey: "freddy", authorName: "Nayeli Vargas", rating: 5, comment: "Brutus ya camina con correa doble sin jalar. Freddy enseña con paciencia en Los Tanques.", tags: "TRATO,PRECIO", daysAgo: 7 },
    { providerKey: "jhon.paluu", authorName: "Ricardo Escalona", rating: 5, comment: "Zeus adora los paseos del amanecer en El Palúu. Jhon es puntual, honesto y el reporte de ruta da mucha confianza.", tags: "PUNTUALIDAD,TRATO", daysAgo: 3 },
    { providerKey: "jhon.paluu", authorName: "Gabriel Mendoza", rating: 4, comment: "Buena visita de cuidado en Caruachi cuando viajé a Ciudad Bolívar. Fotos puntuales.", tags: "TRATO", daysAgo: 10 },
  ];
  for (const r of reviewData) {
    await db.review.create({
      data: { providerId: prov[r.providerKey].id, authorName: r.authorName, rating: r.rating, comment: r.comment, tags: r.tags, response: r.response, createdAt: daysFromNow(-r.daysAgo, 15) },
    }).catch(() => null);
  }

  // ──────────────── Reservas demo (~30, distribuidas para KPIs 7 días) ────────────────
  let codeN = 1;
  const nextCode = () => `PS-${String(codeN++).padStart(4, "0")}`;

  async function makeBooking(opts: {
    client: { id: string; name: string }; providerKey: string; serviceId: string; petId: string;
    address: string; when: Date; status: string; priceUsd: number;
    payment?: { method: string; status: string; reference?: string };
    review?: { authorName: string; rating: number; comment: string; tags: string };
    notes?: string; evidence?: string;
  }) {
    const booking = await db.booking.create({
      data: {
        code: nextCode(), clientId: opts.client.id, providerId: prov[opts.providerKey].id, serviceId: opts.serviceId,
        petId: opts.petId, address: opts.address, scheduledAt: opts.when, status: opts.status,
        priceUsd: opts.priceUsd, priceBs: bs(opts.priceUsd), commissionUsd: commission(opts.priceUsd),
        notes: opts.notes, evidenceNote: opts.evidence,
        // Distribución temporal realista para métricas de los últimos 7 días
        createdAt: opts.when,
      },
    });
    if (opts.payment) {
      await db.payment.create({
        data: { bookingId: booking.id, method: opts.payment.method, amountUsd: opts.priceUsd, amountBs: bs(opts.priceUsd), reference: opts.payment.reference, status: opts.payment.status, reconciledBy: opts.payment.status === "VERIFICADO" ? admin.email : null },
      });
    }
    if (opts.review) {
      await db.review.create({
        data: { bookingId: booking.id, providerId: prov[opts.providerKey].id, authorName: opts.review.authorName, rating: opts.review.rating, comment: opts.review.comment, tags: opts.review.tags },
      });
    }
    return booking;
  }

  const addrMaria = "Av. Guayana, Edif. Mirador del Caroní, Piso 4, Alta Vista";
  const addrJorge = "Res. Unare II, Torre B, Apto 12-B, Unare";
  const addrElena = "Calle Apure, Casa #14, Vista Hermosa, Ciudad Bolívar";
  const addrVictor = "Calle Commerce, Casa Colonial #8, Centro Histórico, Ciudad Bolívar";
  const addrGenesis = "Av. 23 de Enero, Res. Villa Sol, Apto 3-C, Upata Centro";
  const addrWuilmer = "Av. Las Americas, C.C. Amerika local 2, Villa América";
  const addrYulimar = "Urb. Las Mercedes, Calle 5, Casa 22, Upata";

  // Historial de María (protagonista del demo)
  const b1 = await makeBooking({
    client: maria, providerKey: "carlos", serviceId: svcCarlosBano.id, petId: luna.id,
    address: addrMaria, when: daysFromNow(-9, 15), status: "COMPLETADA", priceUsd: 21,
    payment: { method: "PAGO_MOVIL", status: "VERIFICADO", reference: "003451892" },
    review: { authorName: "María González", rating: 5, comment: "Luna quedó hermosa y oliendo increíble. Carlos fue puntual y súper cuidadoso con ella.", tags: "PUNTUALIDAD,TRATO,LIMPIEZA" },
    evidence: "Antes: pelo enredado. Después: corte maltés clásico + lazo 🎀",
  });
  await makeBooking({
    client: maria, providerKey: "carlos", serviceId: svcCarlosSpa.id, petId: simon.id,
    address: addrMaria, when: daysFromNow(1, 14), status: "CONFIRMADA", priceUsd: 39,
    payment: { method: "TRANSFERENCIA", status: "VERIFICADO", reference: "TRF-88231-BOD" },
    notes: "Simón es fuerte con la correa, por favor usar la jaula grande.",
  });
  await makeBooking({
    client: maria, providerKey: "jose", serviceId: svcJosePaseo.id, petId: simon.id,
    address: addrMaria, when: daysFromNow(0, 16), status: "EN_CURSO", priceUsd: 10,
    payment: { method: "EFECTIVO", status: "VERIFICADO" },
  });
  await makeBooking({
    client: maria, providerKey: "andreina", serviceId: (await db.service.findFirst({ where: { providerId: prov.andreina.id, name: { contains: "felino" } } }))!.id, petId: mia.id,
    address: addrMaria, when: daysFromNow(3, 15), status: "PENDIENTE_PAGO", priceUsd: 22,
    payment: { method: "PAGO_MOVIL", status: "PENDIENTE", reference: "004128776" },
  });
  await makeBooking({
    client: maria, providerKey: "luis", serviceId: svcLuisFood.id, petId: luna.id,
    address: addrMaria, when: daysFromNow(-3, 13), status: "COMPLETADA", priceUsd: 53,
    payment: { method: "ZELLE", status: "VERIFICADO", reference: "Z-10432" },
    review: { authorName: "María González", rating: 5, comment: "El Royal Canin de Luna llegó en menos de una hora. Excelente delivery.", tags: "PUNTUALIDAD,PRECIO" },
  });
  await makeBooking({
    client: maria, providerKey: "carlos", serviceId: svcCarlosBano.id, petId: simon.id,
    address: addrMaria, when: daysFromNow(-13, 16), status: "COMPLETADA", priceUsd: 19,
    payment: { method: "EFECTIVO", status: "VERIFICADO" },
    review: { authorName: "María González", rating: 4, comment: "Muy buen baño de Simón. Llegó un poquito tarde por la lluvia de Guayana.", tags: "TRATO" },
  });

  // Jorge (Puerto Ordaz, Unare)
  await makeBooking({
    client: jorge, providerKey: "carlos", serviceId: svcCarlosGato.id, petId: (await makePet(jorge, "Copito", "GATO", "Persa", "S")).id, address: addrJorge, when: daysFromNow(-2, 11), status: "COMPLETADA", priceUsd: 20, payment: { method: "ZELLE", status: "VERIFICADO", reference: "Z-9921" },
    review: { authorName: "Jorge Ramírez", rating: 5, comment: "Manejo impecable de Copito. 100% recomendado para gatos.", tags: "TRATO,LIMPIEZA" },
  });
  await makeBooking({
    client: jorge, providerKey: "jose", serviceId: svcJosePaseo.id, petId: thor.id, address: addrJorge, when: daysFromNow(-1, 9), status: "COMPLETADA", priceUsd: 10, payment: { method: "EFECTIVO", status: "VERIFICADO" },
    review: { authorName: "Jorge Ramírez", rating: 5, comment: "Thor volvió feliz. Excelente servicio.", tags: "PUNTUALIDAD" },
  });
  await makeBooking({
    client: jorge, providerKey: "luis", serviceId: (await db.service.findFirst({ where: { providerId: prov.luis.id, name: { contains: "medicinas" } } }))!.id, petId: nala.id, address: addrJorge, when: daysFromNow(0, 12), status: "CONFIRMADA", priceUsd: 48, payment: { method: "BINANCE", status: "PENDIENTE", reference: "TX-7A2F991C" },
  });
  await makeBooking({
    client: jorge, providerKey: "carlos", serviceId: svcCarlosBano.id, petId: nala.id, address: addrJorge, when: daysFromNow(2, 10), status: "PENDIENTE_PAGO", priceUsd: 21,
  });
  await makeBooking({
    client: jorge, providerKey: "mafer", serviceId: svcMaferDia.id, petId: thor.id, address: addrJorge, when: daysFromNow(5, 14), status: "CONFIRMADA", priceUsd: 20, payment: { method: "TRANSFERENCIA", status: "VERIFICADO", reference: "TRF-45120-Mercantil" },
  });
  await makeBooking({
    client: jorge, providerKey: "carlos", serviceId: svcCarlosBano.id, petId: nala.id, address: addrJorge, when: daysFromNow(-4, 16), status: "CANCELADA", priceUsd: 19, payment: { method: "EFECTIVO", status: "PENDIENTE" },
  });
  await makeBooking({
    client: jorge, providerKey: "valeria", serviceId: svcValeriaMovil.id, petId: thor.id, address: addrJorge, when: daysFromNow(-6, 10), status: "COMPLETADA", priceUsd: 28, payment: { method: "PAGO_MOVIL", status: "VERIFICADO", reference: "002874451" },
    review: { authorName: "Jorge Ramírez", rating: 5, comment: "Bruno... digo, Thor salió como estrella de TV. La unidad móvil es impresionante.", tags: "LIMPIEZA,TRATO" },
  });

  // Elena y Víctor (Ciudad Bolívar)
  await makeBooking({
    client: elena, providerKey: "yeiner", serviceId: svcYeinerBano.id, petId: coco.id, address: addrElena, when: daysFromNow(-5, 15), status: "COMPLETADA", priceUsd: 17, payment: { method: "PAGO_MOVIL", status: "VERIFICADO", reference: "005512203" },
    review: { authorName: "Elena Salazar", rating: 5, comment: "Coco quedó precioso y huele delicioso. Yeiner muy cuidadoso en el Casco Histórico.", tags: "TRATO,LIMPIEZA" },
  });
  await makeBooking({
    client: elena, providerKey: "daniela", serviceId: svcDanielaSitting.id, petId: mishi.id, address: addrElena, when: daysFromNow(1, 8), status: "CONFIRMADA", priceUsd: 18, payment: { method: "PAGO_MOVIL", status: "VERIFICADO", reference: "005512901" },
    notes: "Mishi sale al patio, por favor cerrar bien la reja después de las visitas.",
  });
  await makeBooking({
    client: elena, providerKey: "kellis", serviceId: (await db.service.findFirst({ where: { providerId: prov.kellis.id, name: { contains: "gato" } } }))!.id, petId: mishi.id, address: addrElena, when: daysFromNow(-8, 14), status: "COMPLETADA", priceUsd: 18, payment: { method: "TRANSFERENCIA", status: "VERIFICADO", reference: "TRF-77210-BOD" },
    review: { authorName: "Elena Salazar", rating: 4, comment: "Mishi bien atendido con tanto pelo. Volveré cada 2 meses.", tags: "TRATO" },
  });
  await makeBooking({
    client: victor, providerKey: "yeiner", serviceId: (await db.service.findFirst({ where: { providerId: prov.yeiner.id, category: "SPA_MOVIL" } }))!.id, petId: rocky.id, address: addrVictor, when: daysFromNow(0, 10), status: "EN_CURSO", priceUsd: 28, payment: { method: "EFECTIVO", status: "VERIFICADO" },
  });
  await makeBooking({
    client: victor, providerKey: "kellis", serviceId: (await db.service.findFirst({ where: { providerId: prov.kellis.id, category: "GROOMING", name: { contains: "estilismo" } } }))!.id, petId: rocky.id, address: addrVictor, when: daysFromNow(4, 15), status: "PENDIENTE_PAGO", priceUsd: 15,
  });

  // Wuilmer, Génesis y Yulimar (mixto)
  await makeBooking({
    client: wuilmer, providerKey: "valeria", serviceId: (await db.service.findFirst({ where: { providerId: prov.valeria.id, name: { contains: "grande" } } }))!.id, petId: beya.id, address: addrWuilmer, when: daysFromNow(-7, 11), status: "COMPLETADA", priceUsd: 32, payment: { method: "BINANCE", status: "VERIFICADO", reference: "TX-9912ABEF" },
    review: { authorName: "Wuilmer Ferrer", rating: 5, comment: "La dóberman salió con un brillo increíble. Equipo móvil de primera.", tags: "LIMPIEZA,PUNTUALIDAD" },
  });
  await makeBooking({
    client: wuilmer, providerKey: "yeimi", serviceId: (await db.service.findFirst({ where: { providerId: prov.yeimi.id, name: { contains: "Desmate" } } }))!.id, petId: pelusa.id, address: addrWuilmer, when: daysFromNow(2, 16), status: "CONFIRMADA", priceUsd: 14, payment: { method: "PAGO_MOVIL", status: "VERIFICADO", reference: "001122334" },
  });
  await makeBooking({
    client: genesis, providerKey: "oswaldo", serviceId: svcOswaldoPaseo.id, petId: pancho.id, address: addrGenesis, when: daysFromNow(-1, 10), status: "COMPLETADA", priceUsd: 8, payment: { method: "EFECTIVO", status: "VERIFICADO" },
    review: { authorName: "Génesis Marín", rating: 5, comment: "Pancho volvió feliz del paseo fresco. Oswaldo es un sol de persona.", tags: "TRATO,PUNTUALIDAD" },
  });
  await makeBooking({
    client: genesis, providerKey: "oswaldo", serviceId: (await db.service.findFirst({ where: { providerId: prov.oswaldo.id, category: "TRAINING" } }))!.id, petId: pancho.id, address: addrGenesis, when: daysFromNow(3, 9), status: "PENDIENTE_PAGO", priceUsd: 20,
  });
  await makeBooking({
    client: yulimar, providerKey: "oswaldo", serviceId: svcOswaldoPaseo.id, petId: rey.id, address: addrYulimar, when: daysFromNow(0, 11), status: "CONFIRMADA", priceUsd: 10, payment: { method: "ZELLE", status: "VERIFICADO", reference: "Z-55871" },
    notes: "Rey jala mucho en la correa, tratar de ir por la calle 5.",
  });
  await makeBooking({
    client: yulimar, providerKey: "yeimi", serviceId: (await db.service.findFirst({ where: { providerId: prov.yeimi.id, category: "GROOMING", name: { contains: "antipulgas" } } }))!.id, petId: kira.id, address: addrYulimar, when: daysFromNow(-2, 15), status: "COMPLETADA", priceUsd: 16, payment: { method: "PAGO_MOVIL", status: "RECHAZADO", reference: "009988771" },
  });
  await makeBooking({
    client: yulimar, providerKey: "carlos", serviceId: svcCarlosSpa.id, petId: kira.id, address: addrYulimar, when: daysFromNow(-10, 14), status: "COMPLETADA", priceUsd: 35, payment: { method: "PAGO_MOVIL", status: "VERIFICADO", reference: "001998234" },
    review: { authorName: "Yulimar Rondón", rating: 4, comment: "Muy completo, llegó un poco tarde por la avenida Guayana pero valió la pena.", tags: "PRECIO" },
  });
  await makeBooking({
    client: wuilmer, providerKey: "ramon", serviceId: (await db.service.findFirst({ where: { providerId: prov.ramon.id } }))!.id, petId: beya.id, address: addrWuilmer, when: daysFromNow(-4, 12), status: "COMPLETADA", priceUsd: 44, payment: { method: "EFECTIVO", status: "VERIFICADO" },
    review: { authorName: "Wuilmer Ferrer", rating: 5, comment: "El Concentrado de Beya llegó rapidísimo. Buenísimo para compras pesadas.", tags: "PUNTUALIDAD" },
  });
  await makeBooking({
    client: maria, providerKey: "mafer", serviceId: (await db.service.findFirst({ where: { providerId: prov.mafer.id, name: { contains: "Visita" } } }))!.id, petId: mia.id, address: addrMaria, when: daysFromNow(6, 14), status: "CONFIRMADA", priceUsd: 10, payment: { method: "TRANSFERENCIA", status: "PENDIENTE", reference: "TRF-90331-Activo" },
  });

  // ── San Félix y zonas circunvecinas (protagonistas del nuevo demo) ──
  const addrDanielaSf = "Calle Cumaná, Edif. Centro Cívico Residencias, Piso 2, San Félix Centro";
  const addrAlexander = "Av. Manuel Piar, Res. El Roble II, Torre 1, Apto 8-A, El Roble";
  const addrNayeli = "Calle Los Lirios, Casa #21, Los Olivos";
  const addrGabriel = "Sector 11 de Abril, Calle Principal, Casa 45, frente a la cancha";
  const addrEstefania = "Av. Dalla Costa, Sector Los Alpes, Casa 12, Dalla Costa";
  const addrRicardo = "Vía Guaicara, Sector La Lagunita, Casa 7, Guaicara";

  const bSf1 = await makeBooking({
    client: danielaSf, providerKey: "wilmer.sf", serviceId: svcWilmerBano.id, petId: bolt.id,
    address: addrDanielaSf, when: daysFromNow(-2, 10), status: "COMPLETADA", priceUsd: 16,
    payment: { method: "PAGO_MOVIL", status: "VERIFICADO", reference: "007781233" },
    review: { authorName: "Daniela Fuentes", rating: 5, comment: "Bolt quedó hermoso y con la piel calmada gracias al shampoo. Wilmer es el mejor de San Félix.", tags: "TRATO,LIMPIEZA,PUNTUALIDAD" },
    evidence: "Antes: pelo enredado y piel irritada. Después: corte border collie + baño medicado 🐾",
  });
  await makeBooking({
    client: danielaSf, providerKey: "mileidis", serviceId: svcMileidisMovil.id, petId: nina.id,
    address: addrDanielaSf, when: daysFromNow(2, 9), status: "CONFIRMADA", priceUsd: 20,
    payment: { method: "TRANSFERENCIA", status: "VERIFICADO", reference: "TRF-77341-Activo" },
    notes: "Nina se asusta con el secador, pedir secado suave con toalla.",
  });
  await makeBooking({
    client: alexander, providerKey: "wilmer.sf", serviceId: svcWilmerBano.id, petId: papi.id,
    address: addrAlexander, when: daysFromNow(-8, 11), status: "COMPLETADA", priceUsd: 14,
    payment: { method: "EFECTIVO", status: "VERIFICADO" },
    review: { authorName: "Alexander Rondón", rating: 5, comment: "Papi salió oliendo riquísimo y con su bandanita. Excelente precio en El Roble.", tags: "PRECIO,TRATO" },
  });
  await makeBooking({
    client: alexander, providerKey: "keiver", serviceId: svcKeiverPaseo.id, petId: lola.id,
    address: addrAlexander, when: daysFromNow(0, 14), status: "EN_CURSO", priceUsd: 6,
    payment: { method: "PAGO_MOVIL", status: "VERIFICADO", reference: "007790451" },
  });
  await makeBooking({
    client: nayeli, providerKey: "yoselin", serviceId: svcYoselinDia.id, petId: nina.id,
    address: addrNayeli, when: daysFromNow(3, 8), status: "CONFIRMADA", priceUsd: 16,
    payment: { method: "ZELLE", status: "VERIFICADO", reference: "Z-77120" },
    notes: "Nina se esconde bajo la cama; dejar la puerta del cuarto abierta.",
  });
  await makeBooking({
    client: nayeli, providerKey: "freddy", serviceId: (await db.service.findFirst({ where: { providerId: prov.freddy.id, name: { contains: "Obediencia" } } }))!.id, petId: brutus.id,
    address: addrNayeli, when: daysFromNow(-4, 15), status: "COMPLETADA", priceUsd: 22,
    payment: { method: "PAGO_MOVIL", status: "VERIFICADO", reference: "007732100" },
    review: { authorName: "Nayeli Vargas", rating: 5, comment: "Primera sesión de Brutus en Los Tanques: ya responde al llamado. Freddy es un maestro.", tags: "TRATO,PRECIO" },
  });
  await makeBooking({
    client: gabriel, providerKey: "jesus.a", serviceId: svcJesusFood.id, petId: chispita.id,
    address: addrGabriel, when: daysFromNow(-1, 12), status: "COMPLETADA", priceUsd: 38,
    payment: { method: "PAGO_MOVIL", status: "VERIFICADO", reference: "007765522" },
    review: { authorName: "Gabriel Mendoza", rating: 5, comment: "El Nupec de Chispita llegó a 11 de Abril en menos de dos horas. Precios claros en Bs.", tags: "PUNTUALIDAD,PRECIO" },
  });
  await makeBooking({
    client: gabriel, providerKey: "keiver", serviceId: svcKeiverPaseo.id, petId: chispita.id,
    address: addrGabriel, when: daysFromNow(1, 7), status: "PENDIENTE_PAGO", priceUsd: 6,
  });
  await makeBooking({
    client: estefania, providerKey: "yoselin", serviceId: (await db.service.findFirst({ where: { providerId: prov.yoselin.id, name: { contains: "nocturno" } } }))!.id, petId: manteca.id,
    address: addrEstefania, when: daysFromNow(-10, 19), status: "COMPLETADA", priceUsd: 28,
    payment: { method: "BINANCE", status: "VERIFICADO", reference: "TX-77AB32CD" },
    review: { authorName: "Estefanía Colmenarez", rating: 5, comment: "Cuidado nocturno para Manteca en Dalla Costa: fotos a cada rato y cero preocupaciones.", tags: "TRATO,LIMPIEZA" },
  });
  await makeBooking({
    client: estefania, providerKey: "mileidis", serviceId: svcMileidisMovil.id, petId: manteca.id,
    address: addrEstefania, when: daysFromNow(4, 10), status: "PENDIENTE_PAGO", priceUsd: 20,
    payment: { method: "PAGO_MOVIL", status: "PENDIENTE", reference: "007798814" },
  });
  await makeBooking({
    client: ricardo, providerKey: "jhon.paluu", serviceId: svcJhonPaseo.id, petId: zeus.id,
    address: addrRicardo, when: daysFromNow(-3, 7), status: "COMPLETADA", priceUsd: 6,
    payment: { method: "EFECTIVO", status: "VERIFICADO" },
    review: { authorName: "Ricardo Escalona", rating: 5, comment: "Zeus volvió feliz y cansado del paseo del amanecer en El Palúu. Servicio de 10.", tags: "PUNTUALIDAD,TRATO" },
  });
  await makeBooking({
    client: ricardo, providerKey: "jesus.a", serviceId: (await db.service.findFirst({ where: { providerId: prov["jesus.a"].id, name: { contains: "arenas" } } }))!.id, petId: zeus.id,
    address: addrRicardo, when: daysFromNow(5, 11), status: "CONFIRMADA", priceUsd: 21, payment: { method: "PAGO_MOVIL", status: "VERIFICADO", reference: "007800129" },
    notes: "Traer la arena grande (12 kg), la reja es verde.",
  });
  await makeBooking({
    client: danielaSf, providerKey: "jhon.paluu", serviceId: (await db.service.findFirst({ where: { providerId: prov["jhon.paluu"].id, name: { contains: "Visita" } } }))!.id, petId: bolt.id,
    address: addrDanielaSf, when: daysFromNow(-6, 13), status: "CANCELADA", priceUsd: 8, payment: { method: "EFECTIVO", status: "PENDIENTE" },
  });

  // ──────────────── Notificaciones (log WhatsApp simulado) ────────────────
  await db.notification.createMany({
    data: [
      { userId: maria.id, channel: "WHATSAPP", template: "CONFIRMACION_RESERVA", body: `🐾 PetService VE: ¡Hola María! Tu reserva ${b1.code} (Baño y corte para Luna) fue COMPLETADA. ¡Gracias por confiar en Pet Spa VIP! ¿Nos ayudas con una reseña? → petservice.ve`, status: "LEIDO", createdAt: daysFromNow(-9, 16) },
      { userId: maria.id, channel: "WHATSAPP", template: "PAGO_VERIFICADO", body: `✅ PetService VE: Pago verificado para tu reserva ${b1.code} ($21 / Bs. ${bs(21)}). ¡Todo listo!`, status: "LEIDO", createdAt: daysFromNow(-9, 15) },
      { userId: maria.id, channel: "WHATSAPP", template: "RECORDATORIO_24H", body: `⏰ PetService VE: Mañana a las 10:00am llega Pet Spa VIP para el Spa completo de Simón (PS-0002). Confirma respondiendo SI.`, status: "ENTREGADO", createdAt: daysFromNow(0, 13) },
      { userId: maria.id, channel: "WHATSAPP", template: "ESTADO_PEDIDO", body: `🚶 PetService VE: José (Paseos Felices Caroní) inició el paseo de Simón. ¡Disfruta el reporte de ruta!`, status: "ENVIADO", createdAt: daysFromNow(0, 16) },
      { userId: maria.id, channel: "INAPP", template: "BIENVENIDA", body: "¡Bienvenida a PetService VE! Explora prestadores verificados cerca de ti en Alta Vista, Puerto Ordaz. 🐾", status: "ENVIADO", createdAt: daysFromNow(-10, 9) },
      { userId: jorge.id, channel: "WHATSAPP", template: "PAGO_EN_REVISION", body: `🧾 PetService VE: Recibimos tu pago por Binance para PS-0013 (Bs. ${bs(48)}). Te confirmamos tras la verificación.`, status: "ENVIADO", createdAt: daysFromNow(0, 12) },
      { userId: carlosAdminNotificationUserId(prov.carlos.userId), channel: "WHATSAPP", template: "NUEVA_RESERVA", body: `📅 PetService VE: Nueva reserva confirmada para Pet Spa VIP — Spa completo premium (Simón, mestizo). ${daysFromNow(1, 14).toISOString().slice(0, 10)} 10:00am.`, status: "ENVIADO", createdAt: daysFromNow(0, 12) },
      { userId: prov.jose.userId, channel: "WHATSAPP", template: "NUEVA_RESERVA", body: `📅 PetService VE: Paseo individual 45 min hoy 12:00pm (Simón). Dirección: Av. Guayana, Alta Vista.`, status: "ENVIADO", createdAt: daysFromNow(0, 10) },
      { userId: admin.id, channel: "INAPP", template: "RECORDATORIO_ADMIN", body: "🛡️ Hay 5 prestadores en verificación (PetTaxi Guayana, PetTaxi Angostura, Upata Pet Lovers, PetTaxi Dalla Costa y Patitas de Guaicara) y pagos por conciliar.", status: "ENVIADO", createdAt: daysFromNow(0, 9) },
      { userId: danielaSf.id, channel: "WHATSAPP", template: "CONFIRMACION_RESERVA", body: `🐾 PetService VE: ¡Hola Daniela! Tu reserva ${bSf1.code} (Baño y corte San Félix para Bolt) fue COMPLETADA. ¡Gracias por confiar en Grooming Caroní San Félix! ¿Nos ayudas con una reseña? → petservice.ve`, status: "LEIDO", createdAt: daysFromNow(-2, 11) },
      { userId: prov["wilmer.sf"].userId, channel: "WHATSAPP", template: "NUEVA_RESERVA", body: `📅 PetService VE: Nueva reserva confirmada para Grooming Caroní San Félix — Spa móvil (Nina, bombay). Dirección: Calle Cumaná, San Félix Centro.`, status: "ENVIADO", createdAt: daysFromNow(0, 11) },
      { userId: gabriel.id, channel: "WHATSAPP", template: "ESTADO_PEDIDO", body: `🛵 PetService VE: Delivery Animal SF va en camino con el Nupec de Chispita hacia 11 de Abril. Tiempo estimado: 45 min.`, status: "ENTREGADO", createdAt: daysFromNow(-1, 12) },
      { userId: alexander.id, channel: "INAPP", template: "BIENVENIDA", body: "¡Bienvenido a PetService VE! Explora prestadores verificados cerca de ti en El Roble, San Félix. 🐾", status: "ENVIADO", createdAt: daysFromNow(-12, 9) },
    ],
  });

  console.log("✅ Seed completado — Estado Bolívar (Puerto Ordaz · San Félix · Ciudad Bolívar · Upata):");
  console.log(`   - Usuarios: ${await db.user.count()} | Mascotas: ${await db.pet.count()}`);
  console.log(`   - Prestadores: ${await db.provider.count()} | Servicios: ${await db.service.count()}`);
  console.log(`   - Reservas: ${await db.booking.count()} | Reseñas: ${await db.review.count()}`);
  console.log(`   - Notificaciones: ${await db.notification.count()}`);
}

/** helper local para el log de notificación del prestador carlos */
function carlosAdminNotificationUserId(userId: string): string {
  return userId;
}
