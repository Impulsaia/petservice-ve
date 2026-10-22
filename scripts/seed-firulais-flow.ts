/**
 * PetService VE — Flujo de agenda personalizada de FIRULAIS PELUQUERÍA & SPA PZO
 *
 * Transcribe el guion oficial del negocio (menú tipo chatbot de WhatsApp) al
 * sistema de flujos personalizados de la plataforma:
 *  - Promueve el negocio a source="MANUAL" (los reseed/fusiones nunca lo tocan)
 *  - Etiqueta "Nuevo prestador" por 30 días
 *  - Instagram real + fichas de servicio con precios reales
 *  - bookingFlowJson completo (menús, submenús, fichas, cotización, contacto)
 *
 * Uso:  bun scripts/seed-firulais-flow.ts
 * Luego:  bun scripts/gen-demo-db.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasourceUrl: `file:${process.cwd()}/db/custom.db`, log: ["error"] });

// ───────────────────── Servicios reales (tabla de precios del negocio) ─────────────────────

const SERVICES = [
  {
    name: "Servicio Flash (pequeña/mediana)",
    priceUsd: 8,
    durationMin: 45,
    petSizes: "S,M",
    modality: "PICKUP",
    description:
      "Baño y secado rápido para un toque de frescura inmediata. Duración aproximada: 45 minutos. En nuestro local de Villa Alianza. Pago en divisas o en bolívares a tasa oficial BCV.",
  },
  {
    name: "Servicio Flash (raza grande)",
    priceUsd: 10,
    durationMin: 45,
    petSizes: "L",
    modality: "PICKUP",
    description:
      "Baño y secado rápido para un toque de frescura inmediata (incluye recargo por tamaño). Duración aproximada: 45 minutos. En nuestro local de Villa Alianza.",
  },
  {
    name: "Servicio Sencillo (pequeña/mediana)",
    priceUsd: 11,
    durationMin: 75,
    petSizes: "S,M",
    modality: "PICKUP",
    description:
      "Incluye baño, secado, deslanado, corte de puntas, limpieza de oídos y corte de uñas. En nuestro local de Villa Alianza. Pago en divisas o bolívares a tasa BCV.",
  },
  {
    name: "Servicio Sencillo (raza grande)",
    priceUsd: 13,
    durationMin: 75,
    petSizes: "L",
    modality: "PICKUP",
    description:
      "Incluye baño, secado, deslanado, corte de puntas, limpieza de oídos y corte de uñas (recargo por tamaño). En nuestro local de Villa Alianza.",
  },
  {
    name: "Mantenimiento Completo + Firulais Móvil (pequeña/mediana)",
    priceUsd: 20,
    durationMin: 120,
    petSizes: "S,M",
    modality: "DOMICILIO",
    description:
      "Incluye recolección y retorno a domicilio, baño, secado, deslanado, corte de raza o estilizado, peinado, perfumado, limpieza de orejas y corte de uñas. Válido en la parroquia Cachamay y áreas céntricas de Puerto Ordaz.",
  },
  {
    name: "Mantenimiento Completo + Firulais Móvil (raza grande)",
    priceUsd: 25,
    durationMin: 120,
    petSizes: "L",
    modality: "DOMICILIO",
    description:
      "Incluye recolección y retorno a domicilio, baño, secado, deslanado, corte de raza o estilizado, peinado, perfumado, limpieza de orejas y corte de uñas. Válido en Cachamay y áreas céntricas de Puerto Ordaz.",
  },
] as const;

// ───────────────────── Flujo personalizado (guion oficial) ─────────────────────

const FICHA_PAGO = "💵 Pago en divisas o en bolívares a tasa oficial BCV.";

const flow = {
  version: 1,
  rootId: "root",
  title: "🐾 FIRULAIS PELUQUERÍA & SPA PZO",
  subtitle: "Baños, cortes y estética canina y felina en Villa Alianza, Puerto Ordaz.",
  nodes: {
    root: {
      title: "¡Bienvenido! 🐾",
      body: ["Selecciona el tamaño de tu mascota:"],
      options: [
        { label: "🐶 Raza pequeña", target: "small" },
        { label: "🐕 Raza mediana", target: "medium" },
        { label: "🐕‍🦺 Raza grande", target: "large" },
        { label: "🚗 Firulais Móvil (buscamos y llevamos a tu mascota)", target: "movil" },
        { label: "📅 Agendar cita", target: "cita" },
        { label: "📞 Hablar con un asesor", target: "asesor" },
        { label: "🐱 Mi mascota es gato", target: "gatos" },
      ],
      footer: "En cualquier momento puedes volver al inicio con el botón 🏠 Menú.",
    },
    small: {
      title: "🐶 SERVICIOS PARA RAZA PEQUEÑA",
      options: [
        { label: "✂️ Servicio Flash – $8", target: "f11" },
        { label: "🛁 Servicio Sencillo – $11", target: "f12" },
        { label: "🚗 Mantenimiento Completo + Firulais Móvil – $20", target: "f13" },
      ],
    },
    medium: {
      title: "🐕 SERVICIOS PARA RAZA MEDIANA",
      options: [
        { label: "✂️ Servicio Flash – $8", target: "f11" },
        { label: "🛁 Servicio Sencillo – $11", target: "f12" },
        { label: "🚗 Mantenimiento Completo + Firulais Móvil – $20", target: "f13" },
      ],
    },
    large: {
      title: "🐕‍🦺 SERVICIOS PARA RAZA GRANDE",
      options: [
        { label: "✂️ Servicio Flash – $10 (incluye recargo por tamaño)", target: "f31" },
        { label: "🛁 Servicio Sencillo – $13 (incluye recargo por tamaño)", target: "f32" },
        { label: "🚗 Mantenimiento Completo + Firulais Móvil – $25", target: "f33" },
      ],
    },
    f11: {
      title: "✂️ SERVICIO FLASH – $8",
      body: [
        "Baño y secado rápido para un toque de frescura inmediata.",
        "⏱️ Duración aproximada: 45 minutos.",
        "📍 En nuestro local de Villa Alianza.",
        FICHA_PAGO,
      ],
      actions: [
        { type: "book", label: "Agendar Servicio Flash", serviceName: "Servicio Flash (pequeña/mediana)" },
        { type: "whatsapp", label: "¿Costo con transporte a domicilio?", message: "Hola Firulais 👋 Quiero saber el costo con transporte a domicilio (Firulais Móvil) del Servicio Flash ($8)." },
      ],
    },
    f12: {
      title: "🛁 SERVICIO SENCILLO – $11",
      body: [
        "Incluye: baño, secado, deslanado, corte de puntas, limpieza de oídos y corte de uñas.",
        "📍 En nuestro local de Villa Alianza.",
        FICHA_PAGO,
      ],
      actions: [
        { type: "book", label: "Agendar Servicio Sencillo", serviceName: "Servicio Sencillo (pequeña/mediana)" },
        { type: "whatsapp", label: "¿Costo con transporte a domicilio?", message: "Hola Firulais 👋 Quiero saber el costo con transporte a domicilio (Firulais Móvil) del Servicio Sencillo ($11)." },
      ],
    },
    f13: {
      title: "🚗 MANTENIMIENTO COMPLETO + FIRULAIS MÓVIL – $20",
      body: [
        "Incluye recolección y retorno a domicilio, baño, secado, deslanado, corte de raza o estilizado, peinado, perfumado, limpieza de orejas y corte de uñas.",
        "📍 Válido en la parroquia Cachamay y áreas céntricas de Puerto Ordaz.",
        FICHA_PAGO,
      ],
      actions: [
        { type: "book", label: "Agendar Mantenimiento Completo", serviceName: "Mantenimiento Completo + Firulais Móvil (pequeña/mediana)" },
        { type: "whatsapp", label: "Calcular costo de transporte", message: "Hola Firulais 👋 Quiero el Mantenimiento Completo + Firulais Móvil ($20). Mi mascota es raza ______ y estoy en la zona ______." },
      ],
    },
    f31: {
      title: "✂️ SERVICIO FLASH – $10",
      body: [
        "Baño y secado rápido para un toque de frescura inmediata.",
        "⏱️ Duración aproximada: 45 minutos.",
        "📍 En nuestro local de Villa Alianza.",
        FICHA_PAGO,
      ],
      actions: [
        { type: "book", label: "Agendar Servicio Flash", serviceName: "Servicio Flash (raza grande)" },
        { type: "whatsapp", label: "¿Costo con transporte a domicilio?", message: "Hola Firulais 👋 Quiero saber el costo con transporte a domicilio (Firulais Móvil) del Servicio Flash para raza grande ($10)." },
      ],
    },
    f32: {
      title: "🛁 SERVICIO SENCILLO – $13",
      body: [
        "Incluye: baño, secado, deslanado, corte de puntas, limpieza de oídos y corte de uñas.",
        "📍 En nuestro local de Villa Alianza.",
        FICHA_PAGO,
      ],
      actions: [
        { type: "book", label: "Agendar Servicio Sencillo", serviceName: "Servicio Sencillo (raza grande)" },
        { type: "whatsapp", label: "¿Costo con transporte a domicilio?", message: "Hola Firulais 👋 Quiero saber el costo con transporte a domicilio (Firulais Móvil) del Servicio Sencillo para raza grande ($13)." },
      ],
    },
    f33: {
      title: "🚗 MANTENIMIENTO COMPLETO + FIRULAIS MÓVIL – $25",
      body: [
        "Incluye recolección y retorno a domicilio, baño, secado, deslanado, corte de raza o estilizado, peinado, perfumado, limpieza de orejas y corte de uñas.",
        "📍 Válido en la parroquia Cachamay y áreas céntricas de Puerto Ordaz.",
        FICHA_PAGO,
      ],
      actions: [
        { type: "book", label: "Agendar Mantenimiento Completo", serviceName: "Mantenimiento Completo + Firulais Móvil (raza grande)" },
        { type: "whatsapp", label: "Calcular costo de transporte", message: "Hola Firulais 👋 Quiero el Mantenimiento Completo + Firulais Móvil ($25). Mi mascota es raza ______ y estoy en la zona ______." },
      ],
    },
    movil: {
      title: "🚗 FIRULAIS MÓVIL – RECOLECCIÓN Y RETORNO",
      body: ["Pasamos a buscar a tu mascota a domicilio y la regresamos al terminar el servicio. Válido en toda la zona de Puerto Ordaz."],
      options: [
        { label: "🐶 Pequeño/Mediano – Mantenimiento completo + móvil – $20", target: "f13" },
        { label: "🐕‍🦺 Grande – Mantenimiento completo + móvil – $25", target: "f33" },
        { label: "🚙 Solo traslado (cotizar) – desde $5 por trayecto", target: "cotizar" },
      ],
    },
    cotizar: {
      title: "🚙 COTIZACIÓN DE TRASLADO",
      body: [
        "El costo del Firulais Móvil fuera de la zona base (Cachamay y centro de Puerto Ordaz) o para servicios individuales se cotiza aparte, desde $5 por trayecto.",
        "Indícanos la raza de tu mascota y la zona exacta donde te encuentras para ayudarte a calcular el costo estimado del transporte.",
      ],
      actions: [
        { type: "whatsapp", label: "📝 Cotizar mi traslado ahora", message: "Hola Firulais 👋 Quiero cotizar un traslado (Firulais Móvil). Raza de mi mascota: ______. Zona exacta: ______." },
      ],
    },
    cita: {
      title: "📅 AGENDAR CITA",
      body: [
        "Atendemos de lunes a sábado a partir de las 9:00 AM, previa cita.",
        "Envíanos en un solo mensaje:",
        "1. Nombre y raza de tu mascota",
        "2. Servicio que deseas",
        "3. Día y hora preferida",
        "4. Zona donde te encuentras (si deseas Firulais Móvil)",
        "Un asesor te confirmará la disponibilidad.",
        "📲 Instagram: @firulaisspa.pzo",
      ],
      actions: [
        { type: "book", label: "Agendar aquí mismo 🐾", selectService: true },
        { type: "whatsapp", label: "Enviar mis datos por WhatsApp", message: "Hola Firulais 👋 Quiero agendar una cita. Mi mascota: ______ (raza ______). Servicio: ______. Día y hora preferida: ______. Zona: ______." },
      ],
    },
    asesor: {
      title: "📞 CONTACTO FIRULAIS",
      body: [
        "📍 Villa Alianza, Puerto Ordaz, Edo. Bolívar",
        "📲 Instagram: @firulaisspa.pzo",
        "🕘 Lunes a sábado desde las 9:00 AM (previa cita)",
        FICHA_PAGO,
        "🚗 Firulais Móvil en toda la zona de Puerto Ordaz",
        "Escríbenos por aquí y un asesor te atenderá.",
      ],
      actions: [
        { type: "whatsapp", label: "Hablar con un asesor", message: "Hola Firulais 👋 Quiero hablar con un asesor." },
      ],
    },
    gatos: {
      title: "🐱 SERVICIOS PARA GATOS",
      body: [
        "También atendemos a los michis con baño, cepillado y estética felina.",
        "Cuéntanos qué necesita tu gato (tamaño y tipo de pelaje) y un asesor te dará el precio y la disponibilidad.",
        "📲 Instagram: @firulaisspa.pzo",
      ],
      actions: [
        { type: "whatsapp", label: "Consultar por WhatsApp", message: "Hola Firulais 👋 Mi mascota es un gato 🐱, necesita: ______ (tamaño y tipo de pelaje: ______)." },
      ],
    },
  },
};

// ───────────────────── Ejecución ─────────────────────

async function main() {
  // El negocio real tiene DOS listados ("Furulais PZO" manual del dueño y
  // "Firulais Spa PZO" importado de OSM) — ambos reciben el mismo flujo.
  const providers = await db.provider.findMany({
    where: { businessName: { contains: "rulais" } },
    include: { services: true, user: true },
  });
  if (providers.length === 0) throw new Error("No se encontró el prestador Firulais");

  for (const provider of providers) {
  // 1) Negocio real del usuario: protegido + etiqueta Nuevo + redes + WhatsApp
  await db.provider.update({
    where: { id: provider.id },
    data: {
      source: "MANUAL",
      newUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      instagram: "https://instagram.com/firulaisspa.pzo",
      bookingFlowJson: JSON.stringify(flow),
      bio:
        "🐾 FIRULAIS PELUQUERÍA & SPA PZO — Baños, cortes y estética canina y felina en Villa Alianza, Puerto Ordaz. Firulais Móvil en toda la zona. Lunes a sábado desde las 9:00 AM (previa cita). Pago en divisas o bolívares a tasa BCV.",
    },
  });
  // Teléfono del user = canal WhatsApp del negocio (el flow es WhatsApp-first)
  if (!provider.user.phone) {
    await db.user.update({ where: { id: provider.userId }, data: { phone: "+58 414 5551909" } });
  }

  // 2) Servicios reales (sin duplicar si ya existen por nombre)
  for (const s of SERVICES) {
    const existing = await db.service.findFirst({
      where: { providerId: provider.id, name: s.name },
    });
    if (existing) {
      await db.service.update({
        where: { id: existing.id },
        data: {
          category: "GROOMING",
          description: s.description,
          durationMin: s.durationMin,
          priceUsd: s.priceUsd,
          modality: s.modality,
          petTypes: "PERRO",
          petSizes: s.petSizes,
          active: true,
        },
      });
    } else {
      await db.service.create({
        data: {
          providerId: provider.id,
          category: "GROOMING",
          name: s.name,
          description: s.description,
          durationMin: s.durationMin,
          priceUsd: s.priceUsd,
          modality: s.modality,
          petTypes: "PERRO",
          petSizes: s.petSizes,
          active: true,
        },
      });
    }
  }

  console.log(`✅ ${provider.businessName}: flow JSON (${JSON.stringify(flow).length} B) + ${SERVICES.length} servicios`);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
