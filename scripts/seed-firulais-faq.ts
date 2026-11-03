/**
 * PetService VE — Siembra de la base de conocimiento de Firulais 🐕
 * (modelo FirulaisEntry: FAQ determinista que responde ANTES del LLM).
 *
 * Importante en producción: el LLM interno no es alcanzable desde Vercel, así
 * que esta FAQ es la primera línea de atención. Entradas curadas, tono
 * venezolano, sin promesas que la plataforma no cumpla.
 *
 * Idempotente: dedupe por pregunta normalizada. Uso: bun scripts/seed-firulais-faq.ts
 */
import { db } from "@/lib/db";
import { normalizeEs } from "@/lib/petservice/firulais";

interface Entry {
  question: string;
  answer: string;
  keywords: string;
}

const WA = "+58 424 9526402";

const ENTRIES: Entry[] = [
  {
    question: "¿Quién eres? ¿Qué es PetService VE?",
    answer:
      "🐾 ¡Hola! Soy Firulais, el asistente de PetService VE: el marketplace venezolano de servicios a domicilio para mascotas. Conectamos dueños de peluditos con prestadores verificados: veterinaria, peluquería, paseos, pet sitting, pet taxi, delivery de alimentos y adopción responsable. ¿Qué necesitas hoy?",
    keywords: "quien eres, que es petservice, firulais, asistente, que haces, hola, buenas, que puedes hacer",
  },
  {
    question: "¿Qué servicios ofrece la plataforma?",
    answer:
      "🐾 Ofrecemos: peluquería y spa canino/felino 💈, paseos 🦮, pet sitting 🏡, pet taxi 🚕, delivery de alimentos y medicinas 🚚, veterinaria a domicilio 🩺 (consultas, vacunación, desparasitación, certificados de salud) y adopción responsable ❤️. Todo con prestadores verificados y reseñas reales.",
    keywords: "servicios, que ofrecen, categorias, peluqueria, paseos, pet sitting, pet taxi, delivery, veterinaria, adopcion",
  },
  {
    question: "¿En qué ciudades tienen cobertura?",
    answer:
      "🗺️ Operamos en toda Venezuela 🇻🇪 con prestadores verificados en: Puerto Ordaz, San Félix, Ciudad Bolívar, Upata, Barquisimeto, Caracas, Maracaibo, Maturín, Barcelona, Puerto La Cruz, El Tigre, Mérida, Maracay, Barinas, Guanare, Porlamar, San Cristóbal y La Guaira. Toca el botón de ciudad (junto al GPS 📍) para ver prestadores por ciudad y sector. ¿Cuál es tu ciudad?",
    keywords: "ciudades, cobertura, donde estan, en que lugares, atienden en, maturin, el tigre, barcelona, puerto la cruz, caracas, maracaibo, barquisimeto, puerto ordaz, san felix, ciudad bolivar, upata, merida, porlamar, san cristobal, la guaira, maracay, barinas, guanare",
  },
  {
    question: "¿Cómo reservo un servicio?",
    answer:
      "📅 Reservar es facilísimo: 1️⃣ Busca prestadores con GPS 📍 o elige ciudad y sector. 2️⃣ Toca la ficha que te guste y revisa servicios, precios y reseñas. 3️⃣ Dale a «Reservar ahora» y elige servicio, mascota, dirección, horario y método de pago. 4️⃣ Sube la referencia de pago y ¡listo! El prestador confirma por WhatsApp.",
    keywords: "reservar, como reservo, agendar, cita, turno, apartar, como funciona, contratar, pedir servicio",
  },
  {
    question: "¿Qué métodos de pago aceptan?",
    answer:
      "💳 Aceptamos: Pago Móvil (Banco de Venezuela), transferencia (BOD), Zelle (pagos@petservice.ve), Binance Pay/USDT y efectivo contra entrega. Reservas, pagas, subes la referencia y el admin la concilia. El dinero se libera al prestador cuando el servicio se completa: tu pago está protegido.",
    keywords: "pago movil, metodos de pago, formas de pago, transferencia, zelle, binance, usdt, efectivo, como pago, pagar",
  },
  {
    question: "¿Cuánto cuestan los servicios? ¿Qué precios tienen?",
    answer:
      "💰 Cada prestador publica sus precios en USD y en bolívares a la tasa del día (BCV) en su ficha. Para comparar: busca en tu zona, abre 2–3 fichas y revisa el precio por servicio (baño, consulta, paseo, delivery…). Si un negocio aún no publica tarifas, pregúntale directo por su WhatsApp. ¿Buscas algún servicio en específico?",
    keywords: "precio, precios, cuanto cuesta, cuanto vale, tarifa, tarifas, costo, barato, economico, cuento",
  },
  {
    question: "¿Puedo cancelar o reprogramar una reserva?",
    answer:
      `🔄 Sí. Desde tu perfil ves tus reservas y puedes avisar al prestador por WhatsApp. Para cancelaciones o reembolsos escríbenos al WhatsApp ${WA} con tu número de reserva y lo resolvemos rapidito.`,
    keywords: "cancelar, cancelacion, anular, reprogramar, cambiar mi cita, reembolso, devolucion, me arrepenti",
  },
  {
    question: "¿Cómo funciona la adopción? ¿Hay refugios?",
    answer:
      "❤️ ¡Adoptar es lo más lindo! Tenemos refugios y rescatistas verificados con flujos de visita y adopción coordinada por WhatsApp. Busca la categoría Adopción en el buscador, elige tu ciudad y toca el refugio: su ficha te guía paso a paso para conocer a los peluditos disponibles. Adopta, no compres 🐶🐱.",
    keywords: "adoptar, adopcion, refugio, refugios, rescatista, rescatados, cachorro gratis, gatito gratis, hogar para un perro, mascotas en adopcion",
  },
  {
    question: "¿Hay veterinaria a domicilio? ¿Vacunas y desparasitación?",
    answer:
      "🩺 Sí: veterinaria a domicilio con consultas, vacunación, desparasitación y certificados de salud. Busca con la categoría Veterinaria en tu ciudad, revisa precios y reseñas y reserva la visita. Si tu mascota está muy delicada, ve a una clínica presencial de inmediato.",
    keywords: "veterinaria, veterinario, consulta, consulta veterinaria, vacuna, vacunas, vacunacion, desparasitacion, desparasitar, certificado de salud, medico veterinario",
  },
  {
    question: "Mi mascota está enferma, es una emergencia",
    answer:
      `🐾 Si tu peludito está delicado, agenda una CONSULTA VETERINARIA cuanto antes (categoría Veterinaria 🩺 en el buscador). Ante señales graves —veneno, accidente, convulsiones, dificultad para respirar— ve directo a una clínica presencial: los minutos cuentan. ¿Te ayudo a encontrar un vet cerca? También puedes escribirnos al WhatsApp ${WA}.`,
    keywords: "emergencia, urgencia, urgente, enfermo, enferma, envenenado, veneno, accidente, convulsiones, vomita, diarrea, no come, no camina, sangre",
  },
  {
    question: "¿Venden alimentos Polar? SuperCan, Dogourmet, Champ's, Don Kat, Oh Mai Gat!",
    answer:
      "🥣 ¡Sí! Los prestadores de Alimentos que venden productos Empresas Polar tienen la insignia «Polar» 🏅 en su ficha: SuperCan (cachorros 0–1 año y adultos, 2/4/18 kg), Dogourmet, Champ's (económico, 18% proteína, saco 20 kg), Don Kat (gatos, 31% proteína) y Oh Mai Gat! (gatos, 32% proteína). Filtra por la categoría Alimentos y pregunta por WhatsApp el precio del día y el delivery.",
    keywords: "polar, supercan, super can, dogourmet, champs, champ s, don kat, oh mai gat, ohmaigat, alimentos polar, empresas polar",
  },
  {
    question: "¿Tienen delivery de comida o perrarinas para mascotas?",
    answer:
      "🚚 ¡Claro! Prestadores de Alimentos con perrarinas, gatarinas y accesorios con entrega a domicilio en tu ciudad. Busca la categoría Alimentos 🥣, elige tu ciudad/sector y pregunta precios y horarios de entrega por WhatsApp en la ficha. Los que venden marcas Polar llevan la insignia «Polar» 🏅.",
    keywords: "alimentos, alimento, comida, perrarina, perrarinas, gatarina, croquetas, concentrado, delivery de comida, comida para perro, comida para gato, pet shop, tienda de mascotas",
  },
  {
    question: "¿Hacen peluquería canina o baño a domicilio?",
    answer:
      "💈 ¡Sí! Peluquería y spa canino/felino a domicilio: baño, corte de pelo, corte de uñas, limpieza de oídos y paquetes de estética. Busca la categoría Peluquería en tu ciudad, compara precios y reseñas y reserva. Tu peludito saldrá guapetón 🐶✨.",
    keywords: "peluqueria, peluqueria canina, grooming, bano, banito, banho, corte de pelo, corte, estetica canina, spa, cortar uñas, limpiar oidos",
  },
  {
    question: "¿Hay paseos de perros?",
    answer:
      "🦮 ¡Sí! Paseos con prestadores verificados: busca la categoría Paseos en tu ciudad, revisa horarios, precios y reseñas, y reserva desde la ficha. Puedes programar paseos recurrentes hablando directo con el prestador.",
    keywords: "paseo, paseos, pasear, dog walker, caminar, paseo de perros, sacar a mi perro",
  },
  {
    question: "¿Tienen pet taxi o transporte de mascotas?",
    answer:
      "🚕 Sí, pet taxi: transporte seguro para llevar a tu mascota al veterinario, a la peluquería o a donde necesites. Busca la categoría Pet taxi en el buscador de tu ciudad y reserva desde la ficha.",
    keywords: "pet taxi, taxi, transporte, trasladar, llevar al veterinario, llevar a la mascota, mudanza con mascota",
  },
  {
    question: "¿Quién cuida a mi mascota mientras viajo? ¿Pet sitting?",
    answer:
      "🏡 Pet sitting: cuidadores verificados que atienden a tu peludito en tu casa o en la suya mientras viajas o trabajas. Busca la categoría Pet sitting, revisa reseñas y reserva con la tranquilidad de que el pago se libera al completar el servicio.",
    keywords: "pet sitting, hospedaje, cuidador, cuidado a domicilio, cuando viajo, viajo, cuiden a mi mascota, guarderia canina, hotel para mascotas",
  },
  {
    question: "¿Qué horarios de atención manejan?",
    answer:
      "🕐 La plataforma recibe reservas 24/7. Cada prestador publica su horario en la ficha (muchos atienden lunes a sábado y varios domingos y feriados). ¿Te ayudo a encontrar alguien disponible en tu zona?",
    keywords: "horario, horarios, hora de atencion, atienden, abierto, 24 horas, domingos, feriados, sabados",
  },
  {
    question: "Quiero hablar con una persona / soporte humano",
    answer:
      `💬 ¡Claro! Te atendemos de carne y hueso 🐕: WhatsApp ${WA} o correo impulsaia@gmail.com. Cuéntanos qué necesitas y lo resolvemos al instante.`,
    keywords: "humano, persona real, soporte, ayuda real, hablar con alguien, whatsapp, telefono, contacto, correo, email, reclamacion, queja",
  },
  {
    question: "Soy prestador, ¿cómo me registro para ofrecer servicios?",
    answer:
      `🐾 ¡Bienvenido! Para publicar tu perfil verificado: regístrate como prestador en la plataforma o escríbenos al WhatsApp ${WA} con tu nombre, ciudad y servicio (peluquería, veterinaria, transporte, alimentos…). Te ayudamos a montar tu catálogo con precios y empiezas a recibir clientes de tu zona.`,
    keywords: "prestador, registrarme como prestador, trabajar, ofrecer mis servicios, unirme, soy veterinario, soy peluquero, ganar dinero, publicar mi negocio",
  },
  {
    question: "¿Cómo busco prestadores cerca de mí? ¿Cómo funciona el GPS?",
    answer:
      "📍 Facilísimo: toca el botón de ubicación (GPS) en la barra de búsqueda y permite el acceso a tu ubicación; te mostramos prestadores verificados ordenados por cercanía con la distancia exacta en cada ficha. También puedes elegir tu ciudad y sector manualmente, o buscar por nombre del negocio.",
    keywords: "gps, cerca de mi, ubicacion, buscar cerca, como busco, mas cercano, distancia, sectores, barrio",
  },
  {
    question: "¿Qué mascotas atienden? ¿Perros y gatos?",
    answer:
      "🐶🐱 Atendemos perros y gatos (¡y varios prestadores también aves, roedores y peces!). En cada ficha verás las mascotas que acepta el prestador. Para otros animalitos, consulta directo por WhatsApp con el prestador.",
    keywords: "perros, gatos, michi, que mascotas, acepta, conejos, aves, hamster, peces, otras mascotas",
  },
  {
    question: "¿Cómo funcionan las reseñas? ¿Es seguro pagar?",
    answer:
      "⭐ Las reseñas solo las puede dejar quien recibió el servicio pagado: son opiniones reales. Y tu pago está protegido: el dinero se libera al prestador únicamente cuando el servicio se completa. Si algo sale mal, escríbenos al WhatsApp y revisamos tu caso.",
    keywords: "resenas, reseñas, estrellas, calificacion, seguro, confianza, estafa, proteccion, escrow, como se que es confiable",
  },
];

async function main() {
  const existing = await db.firulaisEntry.findMany({ select: { id: true, question: true } });
  const existingNorm = new Set(existing.map((e) => normalizeEs(e.question)));

  let created = 0;
  for (const e of ENTRIES) {
    if (existingNorm.has(normalizeEs(e.question))) {
      console.log(`↩️  ya existe: ${e.question.slice(0, 50)}`);
      continue;
    }
    await db.firulaisEntry.create({ data: e });
    created++;
    console.log(`✅ ${e.question.slice(0, 60)}`);
  }
  console.log(`\n═══ ${created} nuevas · ${ENTRIES.length - created} ya existían ═══`);
  process.exit(0);
}

main();
