/**
 * PetService VE — Seed de la mega-actualización (Task 19-a)
 *
 * Idempotente: puede ejecutarse N veces sin duplicar (upserts por claves únicas
 * y re-cálculo de agregados CRM desde los bookings).
 *
 * Añade:
 *  1. ~27 ciudades de TODA Venezuela (incluye las 4 con prestadores, con el
 *     string EXACTO de Provider.city)
 *  2. Sectores reales (8-12) para las 4 ciudades con prestadores
 *  3. Backfill de CrmContact desde los bookings existentes
 *  4. ~14 entradas de conocimiento de Firulais 🐕
 *
 * Uso: bun scripts/seed-upgrade.ts
 */
import { PrismaClient } from "@prisma/client";
import { normalizeKeywords } from "../src/lib/petservice/firulais";

const db = new PrismaClient();

// ────────────────────────── 1) Ciudades de Venezuela ──────────────────────────
// name DEBE coincidir EXACTO con Provider.city cuando existan prestadores.
const CITIES: { name: string; state: string; lat: number; lng: number }[] = [
  { name: "Puerto Ordaz", state: "Bolívar", lat: 8.2834, lng: -62.7454 },
  { name: "San Félix", state: "Bolívar", lat: 8.2472, lng: -62.8111 },
  { name: "Ciudad Bolívar", state: "Bolívar", lat: 8.1222, lng: -63.5498 },
  { name: "Upata", state: "Bolívar", lat: 8.0194, lng: -62.4066 },
  { name: "Caracas", state: "Distrito Capital", lat: 10.4806, lng: -66.9036 },
  { name: "Los Teques", state: "Miranda", lat: 10.3439, lng: -66.05 },
  { name: "La Guaira", state: "La Guaira", lat: 10.6, lng: -66.9333 },
  { name: "Valencia", state: "Carabobo", lat: 10.1621, lng: -68.0077 },
  { name: "Maracay", state: "Aragua", lat: 10.2469, lng: -67.5958 },
  { name: "Barquisimeto", state: "Lara", lat: 10.0678, lng: -69.3467 },
  { name: "Maracaibo", state: "Zulia", lat: 10.6545, lng: -71.6431 },
  { name: "Mérida", state: "Mérida", lat: 8.5897, lng: -71.1561 },
  { name: "San Cristóbal", state: "Táchira", lat: 7.7669, lng: -72.225 },
  { name: "Barinas", state: "Barinas", lat: 8.6226, lng: -70.2075 },
  { name: "Guanare", state: "Portuguesa", lat: 9.0417, lng: -69.7419 },
  { name: "San Carlos", state: "Cojedes", lat: 9.6614, lng: -68.5867 },
  { name: "San Felipe", state: "Yaracuy", lat: 10.3389, lng: -68.7411 },
  { name: "Trujillo", state: "Trujillo", lat: 9.3667, lng: -70.4333 },
  { name: "Barcelona", state: "Anzoátegui", lat: 10.1333, lng: -64.7 },
  { name: "Puerto La Cruz", state: "Anzoátegui", lat: 10.139, lng: -64.611 },
  { name: "Cumaná", state: "Sucre", lat: 10.4539, lng: -64.1767 },
  { name: "Maturín", state: "Monagas", lat: 9.7457, lng: -63.1832 },
  { name: "Porlamar", state: "Nueva Esparta", lat: 10.9619, lng: -63.8491 },
  { name: "Coro", state: "Falcón", lat: 11.4045, lng: -69.6734 },
  { name: "Punto Fijo", state: "Falcón", lat: 11.6964, lng: -70.1969 },
  { name: "San Fernando de Apure", state: "Apure", lat: 7.8939, lng: -67.4736 },
  { name: "San Juan de los Morros", state: "Guárico", lat: 9.9333, lng: -66.35 },
  { name: "Puerto Ayacucho", state: "Amazonas", lat: 5.6639, lng: -67.6236 },
  { name: "Tucupita", state: "Delta Amacuro", lat: 9.0575, lng: -62.0453 },
];

// ────────────────────────── 2) Sectores por ciudad ──────────────────────────
// Solo para las ciudades CON prestadores. cityName = valor EXACTO de Provider.city.
const SECTORS: Record<string, { name: string; zone: string; lat: number; lng: number }[]> = {
  "Puerto Ordaz": [
    { name: "Alta Vista", zone: "NORTE", lat: 8.2934, lng: -62.7454 },
    { name: "Vista al Sol", zone: "NORTE", lat: 8.301, lng: -62.735 },
    { name: "Cumbre de Curagua", zone: "NORTE", lat: 8.306, lng: -62.76 },
    { name: "Los Mangos", zone: "NORTE", lat: 8.295, lng: -62.7687 },
    { name: "Centro", zone: "CENTRO", lat: 8.282, lng: -62.738 },
    { name: "PDVSA La Estancia", zone: "CENTRO", lat: 8.278, lng: -62.742 },
    { name: "El Roble", zone: "ESTE", lat: 8.288, lng: -62.728 },
    { name: "Cachamay", zone: "ESTE", lat: 8.2735, lng: -62.7245 },
    { name: "Unare", zone: "SUR", lat: 8.2646, lng: -62.7403 },
    { name: "Villa Colombia", zone: "SUR", lat: 8.2752, lng: -62.7657 },
    { name: "Villa América", zone: "OESTE", lat: 8.2808, lng: -62.7715 },
    { name: "La Llovizna", zone: "SUR", lat: 8.2608, lng: -62.7312 },
  ],
  "San Félix": [
    { name: "Centro", zone: "CENTRO", lat: 8.2506, lng: -62.8047 },
    { name: "Cachipo", zone: "NORTE", lat: 8.26, lng: -62.796 },
    { name: "Los Olivos", zone: "NORTE", lat: 8.2646, lng: -62.8176 },
    { name: "Los Tanques", zone: "NORTE", lat: 8.26, lng: -62.799 },
    { name: "El Roble", zone: "CENTRO", lat: 8.255, lng: -62.793 },
    { name: "Villa Española", zone: "OESTE", lat: 8.2576, lng: -62.8118 },
    { name: "Las Américas", zone: "OESTE", lat: 8.2472, lng: -62.8146 },
    { name: "El Silencio", zone: "SUR", lat: 8.243, lng: -62.802 },
    { name: "11 de Abril", zone: "SUR", lat: 8.24, lng: -62.805 },
    { name: "La Cruz", zone: "SUR", lat: 8.2446, lng: -62.799 },
    { name: "Dalla Costa", zone: "SUR", lat: 8.233, lng: -62.809 },
    { name: "Corobore", zone: "OESTE", lat: 8.238, lng: -62.81 },
  ],
  "Ciudad Bolívar": [
    { name: "Centro Histórico", zone: "CENTRO", lat: 8.1236, lng: -63.5486 },
    { name: "Paseo Orinoco", zone: "CENTRO", lat: 8.1205, lng: -63.5545 },
    { name: "Andrés Eloy Blanco", zone: "ESTE", lat: 8.115, lng: -63.525 },
    { name: "Vista Hermosa", zone: "NORTE", lat: 8.1322, lng: -63.5397 },
    { name: "La Coromoto", zone: "NORTE", lat: 8.142, lng: -63.533 },
    { name: "Marhuanta", zone: "NORTE", lat: 8.15, lng: -63.52 },
    { name: "La Sabanita", zone: "SUR", lat: 8.1097, lng: -63.5419 },
    { name: "Agua Salada", zone: "SUR", lat: 8.098, lng: -63.53 },
    { name: "Los Rastrojos", zone: "SUR", lat: 8.09, lng: -63.525 },
  ],
  Upata: [
    { name: "Centro", zone: "CENTRO", lat: 8.0194, lng: -62.4066 },
    { name: "La Llovizna", zone: "CENTRO", lat: 8.024, lng: -62.402 },
    { name: "Las Delicias", zone: "NORTE", lat: 8.029, lng: -62.398 },
    { name: "Las Mercedes", zone: "NORTE", lat: 8.0258, lng: -62.3995 },
    { name: "El Samán", zone: "NORTE", lat: 8.028, lng: -62.41 },
    { name: "La Campiña", zone: "SUR", lat: 8.016, lng: -62.401 },
    { name: "Los Colorados", zone: "SUR", lat: 8.011, lng: -62.397 },
    { name: "Villa Rosa", zone: "OESTE", lat: 8.023, lng: -62.412 },
    { name: "Ojo de Agua", zone: "OESTE", lat: 8.015, lng: -62.414 },
    { name: "La Concepción", zone: "SUR", lat: 8.01, lng: -62.412 },
  ],
};

// ────────────────────────── 3) Firulais 🐕 — base de conocimiento ──────────────────────────
// Keywords ya normalizadas (minúsculas, sin acentos). El matching las normaliza igual.
const FIRULAIS: { question: string; answer: string; keywords: string }[] = [
  {
    question: "Hola, ¿quién eres?",
    keywords: "hola,buenas,hey,saludos,buenas tardes,buenas noches,buenos dias,que tal",
    answer:
      "¡Hola, chamo! 🐕 Soy **Firulais**, el asistente de PetService VE. Te puedo ayudar con: servicios y precios, cobertura por ciudad 🇻🇪, cómo reservar, métodos de pago (USD y Bs.) y cómo registrarte como prestador. ¿Qué necesitas?",
  },
  {
    question: "¿Qué es PetService VE?",
    keywords: "que es petservice,plataforma,marketplace,como funciona,de que va,pet service",
    answer:
      "PetService VE es el marketplace venezolano de servicios a domicilio para mascotas 🐾: grooming, veterinaria 🩺, delivery de alimentos y medicinas, pet sitting, paseos, adiestramiento, pet taxi y spa móvil. Todo con prestadores verificados, pagos en USD o Bs. y agenda en línea.",
  },
  {
    question: "¿A qué ciudades llegan? (cobertura)",
    keywords: "cobertura,cubren,cobran,ciudades,zonas,llegan,donde estan,expansion,toda venezuela",
    answer:
      "¡Buenas noticias! Empezamos en Guayana (Puerto Ordaz, San Félix, Ciudad Bolívar y Upata) y **estamos expandiendo a toda Venezuela** 🇻🇪. En la sección de **Ciudades** del marketplace ves la lista completa con cuántos prestadores hay en cada una. ¿Quieres saber si llegamos a tu ciudad? Pregúntame por su nombre.",
  },
  {
    question: "¿Cómo hago una reserva?",
    keywords: "reservar,reserva,agendar,cita,contratar,solicitar,pedir un servicio,turno",
    answer:
      "Reservar es facilísimo: 1️⃣ busca el prestador que te guste, 2️⃣ toca **Reservar ahora**, 3️⃣ elige servicio, mascota, dirección y horario, 4️⃣ paga con Pago Móvil, transferencia, Zelle, Binance o efectivo y sube la referencia. ¡Listo! El prestador confirma y llega a tu casa 🏠🐾",
  },
  {
    question: "¿Qué métodos de pago aceptan? (Pago Móvil, USD y Bs.)",
    keywords: "pago movil,pagomovil,metodos de pago,pagar,transferencia,zelle,binance,efectivo,pagos,dolares,bolivares,usd,precio en bolivares",
    answer:
      "Aceptamos 💳 **Pago Móvil** (Banco de Venezuela), 🏦 transferencia (BOD), 💵 **Zelle**, 🪙 **Binance Pay/USDT** y efectivo contra entrega. Los precios se muestran en **USD y Bs.** a la tasa del día, y el dinero se libera al prestador cuando el servicio se completa (escrow lógico).",
  },
  {
    question: "¿Cuánto cuestan los servicios?",
    keywords: "precio,precios,cuanto cuesta,costo,tarifa,cuanto vale,cuanto sale,barato,caro",
    answer:
      "Los precios los pone cada prestador y se muestran en USD con su equivalente en Bs. 💰 Referencia: un baño para perro pequeño ronda $12–18 y una consulta veterinaria ~$15–25. Toca cualquier tarjeta del marketplace para ver el detalle, los extras y la duración exacta.",
  },
  {
    question: "¿Cómo los contacto? (WhatsApp y soporte humano)",
    keywords: "whatsapp,telefono,contacto,numero,llamar,comunicarme,hablar con humano,soporte,atencion al cliente",
    answer:
      "Puedes hablar con un humano al **WhatsApp +58 412 555 0000** 📱 (8am–6pm). También, aquí en el chat, toca el ícono de teléfono ☎️ para ver las opciones de soporte. ¡A la orden!",
  },
  {
    question: "¿Hay veterinarias en San Félix o Puerto Ordaz?",
    keywords: "veterinaria,veterinario,vet,vacunas,consulta veterinaria,desparasitacion,san felix,puerto ordaz,guayana,certificado de salud",
    answer:
      "¡Claro que sí! 🩺 Tenemos veterinarios verificados **a domicilio** en San Félix, Puerto Ordaz, Ciudad Bolívar y Upata: consultas, vacunación, desparasitación y certificados de salud. Busca la categoría **Veterinaria** en el marketplace y agenda la consulta.",
  },
  {
    question: "¿Hacen grooming a domicilio?",
    keywords: "grooming,bano,bano para perro,bano de gato,peluqueria,pelu,peluqueria canina,a domicilio,corte de pelo",
    answer:
      "¡Así es! 🛁 El grooming es **100% a domicilio**: el prestador llega con todo su equipo (los spa móviles llevan hasta agua tibia 😎). Baño, corte, corte de uñas, limpieza de oídos… Filtra por la categoría **Grooming** y tu zona para ver quién te atiende hoy.",
  },
  {
    question: "¿Cuál es el horario de atención?",
    keywords: "horario,horas,atencion,abren,cierran,cuando atienden,24 horas,disponibilidad,los domingos",
    answer:
      "La plataforma opera **24/7** ⏰: puedes reservar a cualquier hora. Cada prestador publica su horario en su perfil (la mayoría trabaja 8am–6pm). Al reservar, el calendario solo te deja elegir los horarios libres del prestador.",
  },
  {
    question: "¿Cómo cancelo una reserva? (reembolsos)",
    keywords: "cancelar,cancelacion,reembolso,devolucion,anular,me arrepenti",
    answer:
      "Tranquilo 😌: puedes cancelar desde **Mis Reservas**. Política: con **más de 24h** de anticipación = reembolso total; con menos de 24h = 50%. El equipo concilia el pago y te avisa por notificación.",
  },
  {
    question: "¿Cómo me registro como prestador?",
    keywords: "prestador,registrarme como,ofrecer servicios,trabajar,proveedor,ser parte,dar servicios,ganar dinero,publicar negocio",
    answer:
      "¡Genial que quieras sumarte! 🐾 En la pantalla de login elige **Registrarse → Prestador**, coloca los datos de tu negocio (nombre, ciudad, zona) y quedas en verificación. En 24–48h el equipo verifica tu identidad y apareces en el marketplace. ¡El registro es gratis!",
  },
  {
    question: "¿Llegan a Maracaibo, Valencia, Caracas…?",
    keywords: "llegan a,atencion en,disponible en,maracaibo,valencia,caracas,barquisimeto,merida,maturin,perto la cruz,otra ciudad,mi ciudad",
    answer:
      "Estamos expandiéndonos a toda Venezuela 🇻🇪 ¡paso a paso! En la sección **Ciudades** del marketplace ves la lista completa y cuántos prestadores hay en cada una. Si tu ciudad aparece con 0 prestadores, ¡ávisanos! Estamos llegando 🚀",
  },
  {
    question: "¿Qué hago en una emergencia veterinaria?",
    keywords: "emergencia,urgencia,accidente,envenenado,no respira,grave,urgente,se cayo,mordio,sangrando",
    answer:
      "Si tu mascota tiene una emergencia 🚨 contacta **de inmediato** a una veterinaria de la plataforma (categoría Veterinaria) o a la clínica más cercana. Firulais no es sustituto de un profesional: no diagnostica ni receta, pero puede ayudarte a encontrar un vet disponible ya. ¡Fuerza! 🐾",
  },
];

// ────────────────────────── Ejecución ──────────────────────────

async function seedCities() {
  for (const c of CITIES) {
    await db.city.upsert({
      where: { name_state: { name: c.name, state: c.state } },
      update: { lat: c.lat, lng: c.lng },
      create: c,
    });
  }
  console.log(`✅ Ciudades: ${CITIES.length} (upsert)`);
}

async function seedSectors() {
  let total = 0;
  for (const [cityName, sectors] of Object.entries(SECTORS)) {
    for (const s of sectors) {
      await db.sector.upsert({
        where: { cityName_name: { cityName, name: s.name } },
        update: { zone: s.zone, lat: s.lat, lng: s.lng },
        create: { cityName, ...s },
      });
      total++;
    }
  }
  console.log(`✅ Sectores: ${total} en ${Object.keys(SECTORS).length} ciudades (upsert)`);
}

async function backfillCrm() {
  // Agrupa los bookings por (providerId, clientId) — solo reservas no canceladas
  const bookings = await db.booking.findMany({
    where: { status: { not: "CANCELADA" } },
    select: {
      providerId: true,
      clientId: true,
      priceUsd: true,
      scheduledAt: true,
      client: { select: { name: true, phone: true, email: true } },
      pet: { select: { name: true, species: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });

  const groups = new Map<string, typeof bookings>();
  for (const b of bookings) {
    const key = `${b.providerId}::${b.clientId}`;
    const arr = groups.get(key) ?? [];
    arr.push(b);
    groups.set(key, arr);
  }

  let created = 0;
  let updated = 0;
  for (const [key, list] of groups) {
    const [providerId, userId] = key.split("::");
    const last = list[list.length - 1];
    const totalVisits = list.length;
    const totalSpentUsd = Math.round(list.reduce((a, b) => a + b.priceUsd, 0) * 100) / 100;
    const lastVisitAt = last.scheduledAt;
    // ≥3 visitas o gasto alto ($120+) → VIP; el resto, ACTIVO
    const status = totalVisits >= 3 || totalSpentUsd >= 120 ? "VIP" : "ACTIVO";

    const existing = await db.crmContact.findFirst({ where: { providerId, userId } });
    if (existing) {
      // Re-cálculo de agregados; respeta notas y datos editados a mano
      await db.crmContact.update({
        where: { id: existing.id },
        data: {
          totalVisits,
          totalSpentUsd,
          lastVisitAt,
          // Un contacto INACTIVO marcado a mano no se re-activa automáticamente
          status: existing.status === "INACTIVO" || existing.status === "NUEVO" ? status : existing.status,
          name: last.client.name,
          phone: last.client.phone,
          petName: last.pet?.name ?? existing.petName,
          petType: last.pet?.species ?? existing.petType,
          updatedAt: new Date(),
        },
      });
      updated++;
    } else {
      await db.crmContact.create({
        data: {
          providerId,
          userId,
          name: last.client.name,
          phone: last.client.phone,
          email: last.client.email,
          petName: last.pet?.name ?? null,
          petType: last.pet?.species ?? null,
          status,
          source: "RESERVA",
          totalVisits,
          totalSpentUsd,
          lastVisitAt,
        },
      });
      created++;
    }
  }
  console.log(`✅ CRM: ${created} contactos creados, ${updated} actualizados (backfill de ${bookings.length} reservas)`);
}

async function seedFirulais() {
  let created = 0;
  let updated = 0;
  for (const e of FIRULAIS) {
    const existing = await db.firulaisEntry.findFirst({ where: { question: e.question } });
    if (existing) {
      await db.firulaisEntry.update({
        where: { id: existing.id },
        data: { answer: e.answer, keywords: normalizeKeywords(e.keywords), updatedAt: new Date() },
      });
      updated++;
    } else {
      await db.firulaisEntry.create({
        data: { question: e.question, answer: e.answer, keywords: normalizeKeywords(e.keywords) },
      });
      created++;
    }
  }
  console.log(`✅ Firulais: ${created} entradas creadas, ${updated} actualizadas`);
}

async function main() {
  console.log("🐾 PetService VE — seed-upgrade (Task 19-a)");
  await seedCities();
  await seedSectors();
  await backfillCrm();
  await seedFirulais();

  // Verificación rápida
  const [cities, sectors, contacts, entries] = await Promise.all([
    db.city.count(),
    db.sector.count(),
    db.crmContact.count(),
    db.firulaisEntry.count(),
  ]);
  console.log(`📊 Resumen DB → cities:${cities} sectors:${sectors} crmContacts:${contacts} firulaisEntries:${entries}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error("❌ seed-upgrade falló:", e);
    await db.$disconnect();
    process.exit(1);
  });
