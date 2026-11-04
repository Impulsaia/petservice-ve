/**
 * PetService VE — Firulais 🐕 MODO BÁSICO (determinista, sin LLM)
 *
 * Se usa cuando el LLM no está disponible en producción (la API interna de
 * Z-AI solo es alcanzable desde la red Z-AI; hasta que se configure una
 * clave pública sk-). En lugar de mostrar "problemita técnico", responde con
 * información REAL de la plataforma detectando la intención de la pregunta:
 * ciudades, precios, reserva, pagos, veterinaria, adopción, alimentos/Polar,
 * grooming, contacto humano, etc.
 *
 * El FAQ curado (FirulaisEntry + matchFirulais) corre ANTES; esto es la
 * última línea de defensa para preguntas sin match.
 */
import { SUPPORT_WHATSAPP, SUPPORT_WHATSAPP_WA } from "./constants";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const has = (q: string, words: string[]) => words.some((w) => q.includes(w));

/** Ciudades con cobertura activa (datos reales del catálogo) */
const CIUDADES = [
  "Puerto Ordaz", "San Félix", "Ciudad Bolívar", "Upata",
  "Barquisimeto", "Caracas", "Maracaibo", "Maturín", "Barcelona",
  "Puerto La Cruz", "El Tigre", "Mérida", "Maracay", "Barinas", "Guanare",
  "Porlamar", "San Cristóbal", "La Guaira",
];

/**
 * Respuesta determinista según intención. Siempre útil, nunca "error".
 */
export function basicFirulaisReply(rawQuestion: string): string {
  const q = norm(rawQuestion);

  // ── Salud / emergencia ────────────────────────────────────────────────
  if (has(q, ["enferm", "emergencia", "urgente", "urgencia", "veneno", "accidente", "sangre", "convulsion", "no come", "vomita", "diarre"])) {
    return `🐾 Si tu peludito está delicado, lo mejor es una CONSULTA VETERINARIA cuanto antes. En PetService VE hay veterinarios a domicilio en varias ciudades — toca la categoría Veterinaria 🩺 en el buscador y agenda la visita más cercana. Si es una emergencia grave (veneno, accidente, convulsiones), ve directamente a una clínica presencial. ¿Te ayudo con algo más? Escríbenos al WhatsApp ${SUPPORT_WHATSAPP}.`;
  }
  if (has(q, ["veterinar", "vacuna", "desparasit", "consulta", "veterinario", "veterinaria", "certificado de salud"])) {
    return `🩺 Contamos con VETERINARIA a domicilio: consultas, vacunación, desparasitación y certificados de salud. Para encontrar uno cerca: usa el buscador de la página principal (GPS 📍 o ciudad + sector), filtra por la categoría Veterinaria y revisa precios y reseñas en cada ficha. ¿Quieres que te oriente con la reserva? También puedes escribirnos al WhatsApp ${SUPPORT_WHATSAPP}.`;
  }

  // ── Adoptar / refugios ────────────────────────────────────────────────
  if (has(q, ["adopt", "refugio", "rescat", "cachorro gratis", "gatito gratis", "hogar para un"])) {
    return `❤️ ¡Qué lindo querer adoptar! Tenemos refugios y rescatistas verificados con visitas y adopciones responsables coordinadas por WhatsApp. Busca la categoría Adopción 🏕️ en el buscador, elige la ciudad y toca un refugio: su ficha tiene el flujo de contacto para coordinar visita. Adopta, no compres 🐶🐱.`;
  }

  // ── Alimentos / Polar ────────────────────────────────────────────────
  if (has(q, ["polar", "supercan", "super can", "dogourmet", "champ", "don kat", "oh mai", "perrarina", "aliment", "comida para", "comidita", "croquetas", "concetro", "concentrado"])) {
    return `🥣 ¡Sí! Tenemos prestadores de ALIMENTOS con delivery, y los que venden productos Empresas Polar tienen la insignia especial «Polar» 🏅: SuperCan (cachorros 0–1 año y adultos en 2/4/18 kg), Dogourmet, Champ's (18% proteína, saco 20 kg), Don Kat (gatos, 31% proteína) y Oh Mai Gat! (gatos, 32% proteína). Filtra por la categoría Alimentos en el buscador y pregunta precios y entrega por WhatsApp en la ficha del prestador.`;
  }

  // ── Precios ──────────────────────────────────────────────────────────
  if (has(q, ["precio", "cuesta", "costo", "cuanto", "tarifa", "vale", "barato", "economico"])) {
    return `💰 Cada prestador publica sus precios en USD y su equivalente en bolívares a la tasa del día. Toca una ficha y verás el detalle por servicio (baño, consulta, paseo, delivery…). Como los precios los fija cada prestador, lo más rápido es comparar 2–3 fichas cercanas o preguntar directo por su WhatsApp. ¿Buscas algún servicio en particular?`;
  }

  // ── Pagos ────────────────────────────────────────────────────────────
  if (has(q, ["pago movil", "pago movil", "transferencia", "zelle", "binance", "usdt", "efectivo", "metodo de pago", "formas de pago", "pagar"])) {
    return `💳 Aceptamos: Pago Móvil (Banco de Venezuela), transferencia (BOD), Zelle (pagos@petservice.ve), Binance Pay/USDT y efectivo contra entrega. El flujo es simple: reservas el servicio, pagas, subes la referencia y el admin la concilia; el dinero se libera al prestador cuando el servicio se completa. ¿Te ayudo con una reserva?`;
  }

  // ── Reserva / cómo funciona ──────────────────────────────────────────
  if (has(q, ["reserv", "agendar", "cita", "turno", "apartar", "como funciona", "uso la app", "contratar"])) {
    return `📅 Reservar es facilísimo: 1️⃣ Busca prestadores con GPS 📍 o elige tu ciudad y sector. 2️⃣ Toca la ficha que te guste y revisa servicios, precios y reseñas. 3️⃣ Dale a «Reservar ahora», elige servicio, mascota, dirección y horario. 4️⃣ Paga con Pago Móvil, transferencia, Zelle, Binance o efectivo y sube la referencia. ¡Listo, a la orden! 🐾`;
  }

  // ── Cancelar / reprogramar ───────────────────────────────────────────
  if (has(q, ["cancelar", "anular", "reprogramar", "cambiar mi cita", "reembolso", "devolv"])) {
    return `🔄 ¿Necesitas cambiar algo de tu reserva? Desde tu perfil puedes ver tus reservas y avisar al prestador por WhatsApp. Para cancelaciones o reembolsos, escríbenos al WhatsApp ${SUPPORT_WHATSAPP} con tu número de reserva y lo resolvemos rapidito.`;
  }

  // ── Grooming / peluquería / paseo / taxi / pet sitting ───────────────
  if (has(q, ["grooming", "peluquer", "banito", "bañito", "banio", "bano", "corte", "estetica canina", "spa"])) {
    return `💈 Tenemos peluquería y spa canino/felino a domicilio: baño, corte, corte de uñas, limpieza de oídos y más. Usa el buscador con la categoría Peluquería y compara precios y reseñas. ¿En qué ciudad estás?`;
  }
  if (has(q, ["paseo", "pasear", "dog walker", "caminar"])) {
    return `🦮 Paseos a domicilio con prestadores verificados: busca la categoría Paseos en tu ciudad, revisa horarios y precios, y reserva desde la ficha. Tu peludito lo agradece 🐶.`;
  }
  if (has(q, ["pet taxi", "taxi", "transporte", "llevar al vet", "trasladar"])) {
    return `🚕 Pet taxi disponible: transporte para llevar a tu mascota al veterinario, a la peluquería o donde necesites. Busca la categoría Pet taxi en el buscador de tu ciudad.`;
  }
  if (has(q, ["pet sitting", "hospedaje", "cuidado a domicilio", "cuando viajo", "viajo", "cuiden a mi", "cuidado de mi"])) {
    return `🏡 Pet sitting: cuidadores verificados que atienden a tu peludito en tu casa o en la suya mientras viajas o trabajas. Busca la categoría Pet sitting en tu ciudad y revisa reseñas antes de reservar.`;
  }

  // ── Ciudades / cobertura ─────────────────────────────────────────────
  if (has(q, ["ciudad", "ciudades", "cobertura", "donde estan", "en que lugares", "maturin", "el tigre", "barcelona", "puerto la cruz", "caracas", "maracaibo", "barquisimeto", "puerto ordaz", "san felix", "ciudad bolivar", "upata", "merida", "maracay", "guanare", "porlamar", "san cristobal", "la guaira", "barinas"])) {
    const mencionadas = CIUDADES.filter((c) => q.includes(norm(c)));
    const lista = mencionadas.length
      ? `En ${mencionadas.join(" y ")} sí tenemos prestadores ✅`
      : `Cobertura activa: ${CIUDADES.slice(0, 10).join(", ")} y más ✅`;
    return `🗺️ Estamos en toda Venezuela 🇻🇪. ${lista} — usa el botón de ciudad (arriba, junto al GPS) para ver prestadores con sus sectores, o activa tu ubicación para buscar cerca. Si tu ciudad aparece como «Próximamente», escríbenos al WhatsApp ${SUPPORT_WHATSAPP} y te avisamos cuando abramos.`;
  }

  // ── Ser prestador ────────────────────────────────────────────────────
  if (has(q, ["prestador", "trabajar", "ofrecer mis servicios", "registrarme como", "unirme", "soy veterinario", "soy peluquero", "ganar dinero"])) {
    return `🐾 ¡Quiero ser prestador! Regístrate en la plataforma como prestador o escríbenos directo al WhatsApp ${SUPPORT_WHATSAPP} con tu nombre, ciudad y servicio que ofreces: te ayudamos a montar tu perfil verificado y empiezas a recibir clientes de tu zona.`;
  }

  // ── Horarios ─────────────────────────────────────────────────────────
  if (has(q, ["horario", "hora de atencion", "atienden", "abierto", "24 horas", "domingo", "feriado"])) {
    return `🕐 La plataforma recibe reservas 24/7. Cada prestador muestra su horario en su ficha (muchos trabajan lunes a sábado y varios atienden domingos). ¿Te ayudo a encontrar alguien disponible en tu zona?`;
  }

  // ── Contacto humano / soporte ────────────────────────────────────────
  if (has(q, ["humano", "persona", "soporte", "ayuda real", "hablar con", "whatsapp", "telefono", "contacto", "correo", "email"])) {
    return `💬 ¡Claro! Te atiende gente de carne y hueso 🐕: WhatsApp ${SUPPORT_WHATSAPP} o correo impulsaia@gmail.com. Estamos a la orden.`;
  }

  // ── Saludo / quién eres ──────────────────────────────────────────────
  if (has(q, ["hola", "buenas", "buenos dias", "buenas tardes", "buenas noches", "chamo", "quien eres", "que eres", "firulais", "que puedes hacer", "ayuda"])) {
    return `🐾 ¡Hola! Soy Firulais, el asistente de PetService VE. Puedo orientarte con: servicios y precios, cómo reservar, métodos de pago, veterinaria a domicilio 🩺, adopciones ❤️ y alimentos (¡incluidos los Polar: SuperCan, Dogourmet, Champ's, Don Kat, Oh Mai Gat!) 🥣. ¿Qué necesitas para tu peludito?`;
  }

  // ── Default: útil, honesto y con salida humana ───────────────────────
  return `🐾 Soy Firulais de PetService VE. Puedo ayudarte con servicios, precios, reservas, pagos, veterinaria a domicilio, adopciones y alimentos (¡incluidas las marcas Polar!) 🥣. Mientras sigo aprendiendo, si tu pregunta es muy específica escríbenos al WhatsApp ${SUPPORT_WHATSAPP} y te atendemos al instante. También puedes explorar prestadores verificados cerca de ti con el buscador de la página principal 📍.`;
}

/** Enlace wa.me preformado (por si el UI lo necesita) */
export function supportWaLink(text = "Hola PetService VE 🐾"): string {
  return `https://wa.me/${SUPPORT_WHATSAPP_WA}?text=${encodeURIComponent(text)}`;
}
