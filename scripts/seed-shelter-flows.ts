/**
 * PetService VE — Flujo de contacto personalizado de REFUGIOS y ADOPCIÓN
 *
 * Cada organización de rescate recibe su menú tipo chatbot de WhatsApp
 * (como el de Firulais) para coordinar VISITAS y ADOPCIONES:
 *  - Menú principal: adoptar · visitar · voluntariado/donaciones ·
 *    reportar un rescatado · contacto
 *  - Acciones de WhatsApp (si tienen teléfono) o enlace (Instagram/Facebook/web)
 *  - Acción de reserva interna cuando el refugio tiene servicio agendable
 *    (la visita queda en su calendario del panel, como pre-agenda)
 *
 * Idempotente: sobreescribe bookingFlowJson de los prestadores source="SHELTER".
 * Uso:  bun scripts/seed-shelter-flows.ts
 * Luego: bun scripts/gen-demo-db.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasourceUrl: `file:${process.cwd()}/db/custom.db`, log: ["error"] });

// ───────────────────── Config por organización (datos verificados 30-a) ─────────────────────

interface ShelterCfg {
  match: string;
  tagline: string;
  visitBody: string[];
  visitService?: string; // nombre EXACTO del servicio agendable para visitas
  adoptService?: string; // nombre EXACTO del servicio de entrevista de adopción
  volunteerBody: string[];
  contactBody: string[];
  hours: string;
  instagram?: string;
  facebook?: string;
  website?: string;
}

const CFGS: ShelterCfg[] = [
  {
    match: "Fundaproba",
    tagline: "Fundación Protectora de Animales · 17+ años rescatando perritos en Puerto Ordaz (Minifincas).",
    visitBody: [
      "La seguridad de la manada es primero: la dirección exacta del refugio se comparte al confirmar tu cita.",
      "La visita dura aprox. 1 hora: conocerás a los perritos rescatados, podrás pasearlos y traer donaciones si quieres.",
      "Coordinamos de lunes a sábado, previa cita.",
    ],
    visitService: "Visita al refugio · Voluntariado y donaciones",
    volunteerBody: [
      "Aceptamos alimento balanceado, antipulgas, medicinas, mantas y ayuda económica.",
      "También necesitamos hogares temporales: ¡abre tu casa a un rescatado por unas semanas!",
    ],
    contactBody: [
      "📍 Refugio en el municipio Caroní (dirección reservada por seguridad · difusión y eventos: Av. Paseo Caroní, Los Samanes).",
      "🕐 Visitas coordinadas por WhatsApp (previa cita).",
    ],
    instagram: "https://www.instagram.com/fundaproba",
    facebook: "https://www.facebook.com/Fundaproba",
  },
  {
    match: "Patitas de la Calle",
    tagline: "16 años de rescates en Ciudad Bolívar: más de 100 peludos esperan familia responsable.",
    visitBody: [
      "No tenemos sede fija: rescatamos en Casco Histórico, La Sabanita, Perimetral y casas de voluntarios.",
      "Los encuentros con los peludos se coordinan en eventos y puntos de encuentro, previa conversación por Instagram.",
    ],
    adoptService: "Proceso de adopción responsable",
    volunteerBody: [
      "Somos 100% voluntarios: se necesita ayuda con tránsitos, traslados, jornadas de vacunación y difusión.",
      "Aceptamos alimento, medicinas y aportes para veterinaria.",
    ],
    contactBody: [
      "📍 Sin sede fija · rescates en Ciudad Bolívar (Casco Histórico, La Sabanita, Perimetral).",
      "🕐 Coordinación por Instagram / WhatsApp de voluntarios.",
    ],
    instagram: "https://www.instagram.com/patitasdelacalle_voluntarios",
  },
  {
    match: "Misión Nevado",
    tagline: "Misión social de bienestar animal del estado Bolívar: adopciones y jornadas de esterilización.",
    visitBody: [
      "Trabajamos con jornadas y campañas programadas en San Félix y Puerto Ordaz.",
      "Escríbenos para conocernos en la próxima jornada o coordinar una visita a nuestros espacios de cuidado.",
    ],
    adoptService: "Proceso de adopción responsable",
    volunteerBody: [
      "Únete a las jornadas de esterilización, vacunación y cuidado de animales comunitarios.",
      "Aceptamos insumos veterinarios y alimento.",
    ],
    contactBody: [
      "📍 Atención comunitaria en San Félix y Puerto Ordaz.",
      "🕐 Campañas y jornadas programadas.",
    ],
    instagram: "https://www.instagram.com/nevadobolivar",
    facebook: "https://www.facebook.com/p/Misi%C3%B3n-Nevado-Bol%C3%ADvar-100064325034354",
  },
  {
    match: "Hogar Temporal Patitas a Salvo",
    tagline: "Hogar temporal (foster) en Urb. Caura: recibimos perritos pequeños y gatos mientras encuentran familia.",
    visitBody: [
      "Estamos en Urb. Caura, junto al Polideportivo de Venalum (Puerto Ordaz).",
      "Recibimos con cita previa: agenda aquí y te confirmamos la hora.",
      "Capacidad limitada (foster familiar): ideal para conocer a los peludos en un ambiente de casa.",
    ],
    visitService: "Hogar temporal para rescatados",
    volunteerBody: [
      "La mejor ayuda es convertirse en hogar temporal: un puente entre el rescate y la adopción.",
      "Aceptamos alimento, arena para gatos, antipulgas y mantas.",
    ],
    contactBody: [
      "📍 Urb. Caura, junto al Polideportivo de Venalum, Puerto Ordaz.",
      "🕐 Coordinación previa cita (red Patitas a Salvo Venezuela).",
    ],
    website: "https://patitasasalvovenezuela.org/refugios",
  },
  {
    match: "Santuario Luna",
    tagline: "Santuario de gran capacidad cerca de Caracas: 200+ animales rescatados en rehabilitación y adopción.",
    visitBody: [
      "Nos ubicamos en Vía Tazón (Maitana), área metropolitana de Caracas.",
      "Las visitas se coordinan con la red Patitas a Salvo Venezuela, previa cita.",
      "Conocerás a gatos, perritos y tortugas en proceso de rehabilitación.",
    ],
    visitService: "Visita al refugio · Voluntariado y donaciones",
    volunteerBody: [
      "Se necesitan voluntarios para limpieza, enriquecimiento, alimentación y eventos de adopción.",
      "Aceptamos alimento (gato y perro), arena, medicinas y aportes económicos.",
    ],
    contactBody: [
      "📍 Vía Tazón, Maitana, Edo. Miranda (área metropolitana de Caracas).",
      "🕐 Visitas coordinadas por la red Patitas a Salvo.",
    ],
    website: "https://patitasasalvovenezuela.org/refugios",
  },
];

// ───────────────────── Constructor del flow ─────────────────────

type FlowNode = {
  title?: string;
  body?: string[];
  footer?: string;
  options?: { label: string; target: string }[];
  actions?: { type: string; label: string; serviceName?: string; message?: string; url?: string }[];
};

function buildFlow(cfg: ShelterCfg): string {
  const name = cfg.match;

  // Canal de contacto principal: WhatsApp si hay teléfono publicado en el flow
  // (se inyecta al final con el teléfono real del prestador), o enlaces a redes.
  const links: FlowNode["actions"] = [];
  if (cfg.instagram) links.push({ type: "link", label: "📸 Síguenos en Instagram", url: cfg.instagram });
  if (cfg.facebook) links.push({ type: "link", label: "📘 Nuestro Facebook", url: cfg.facebook });
  if (cfg.website) links.push({ type: "link", label: "🌐 Página web", url: cfg.website });

  const nodes: Record<string, FlowNode> = {
    root: {
      title: "¡Bienvenido! 🐾",
      body: [cfg.tagline, "¿En qué podemos ayudarte hoy?"],
      options: [
        { label: "🏡 Quiero adoptar", target: "adopcion" },
        { label: "🚪 Coordinar una visita", target: "visita" },
        { label: "🤝 Voluntariado y donaciones", target: "voluntariado" },
        { label: "🆘 Reportar un rescatado / dar en adopción", target: "reportar" },
        { label: "📞 Contacto y horarios", target: "contacto" },
      ],
      footer: "En cualquier momento puedes volver al menú principal con el botón 🏠 Menú.",
    },

    adopcion: {
      title: "🏡 ADOPCIÓN RESPONSABLE",
      body: [
        "¡Gracias por dar el paso más bonito! ❤️",
        "Nuestro proceso:",
        "1. Cuéntanos qué peludo buscas y cómo es tu hogar.",
        "2. Te enviamos la ficha de los peludos disponibles y una breve entrevista.",
        "3. Nos conocemos: visita y convivencia previa.",
        "4. Firma del acuerdo de tenencia responsable.",
        "5. Seguimiento durante el primer mes.",
        "Requisitos: ser mayor de edad, espacio seguro (ventanas y balcones protegidos), tiempo y compromiso de por vida.",
      ],
      ...(cfg.adoptService
        ? {
            actions: [
              { type: "book", label: "Agendar entrevista de adopción", serviceName: cfg.adoptService },
              { type: "contact-adopt", label: "Postular para adoptar 🏡" },
            ],
          }
        : {
            actions: [{ type: "contact-adopt", label: "Postular para adoptar 🏡" }],
          }),
    },

    visita: {
      title: "🚪 VISITAS",
      body: [...cfg.visitBody, "Agenda aquí y te confirmamos la fecha por el canal de contacto."],
      ...(cfg.visitService
        ? {
            actions: [
              { type: "book", label: "Agendar mi visita", serviceName: cfg.visitService },
              { type: "contact-visit", label: "Coordinar por contacto directo" },
            ],
          }
        : {
            actions: [{ type: "contact-visit", label: "Coordinar mi visita 🚪" }],
          }),
    },

    voluntariado: {
      title: "🤝 VOLUNTARIADO Y DONACIONES",
      body: ["¡Manos y corazones siempre hacen falta! 🐾", ...cfg.volunteerBody],
      actions: [{ type: "contact-volunteer", label: "Quiero ayudar 🤝" }],
    },

    reportar: {
      title: "🆘 REPORTAR UN RESCATADO / DAR EN ADOPCIÓN",
      body: [
        "¿Encontraste un peludo o necesitas reubicar a uno?",
        "Envíanos en un solo mensaje:",
        "1. Lugar exacto donde está el animalito.",
        "2. Su condición (salud, tamaño aprox., temperamento).",
        "3. Una foto si es posible.",
        "Te respondemos para coordinar el rescate o sumarlo a la red.",
      ],
      actions: [{ type: "contact-report", label: "Enviar reporte 🆘" }],
    },

    contacto: {
      title: `📞 CONTACTO — ${name.toUpperCase()}`,
      body: [...cfg.contactBody, "Un humano del equipo te responderá por el canal que elijas."],
      actions: links.length > 0 ? [{ type: "contact-generic", label: "Escribir al equipo 💬" }, ...links] : [{ type: "contact-generic", label: "Escribir al equipo 💬" }],
    },
  };

  return JSON.stringify({ version: 1, rootId: "root", title: `🐾 ${name}`, subtitle: cfg.tagline, buttonLabel: "🏡 Visitas y adopciones", nodes });
}

// ───────────────────── Ejecución ─────────────────────

async function main() {
  const providers = await db.provider.findMany({ where: { source: "SHELTER" }, include: { user: true, services: true } });
  if (providers.length === 0) throw new Error("No hay prestadores source=SHELTER");

  for (const provider of providers) {
    const cfg = CFGS.find((c) => provider.businessName.includes(c.match));
    if (!cfg) {
      console.log(`⚠️ Sin config para "${provider.businessName}" — omitido`);
      continue;
    }

    // El flujo usa WhatsApp real cuando el prestador tiene teléfono;
    // los marcadores contact-* se reemplazan por la acción del canal real.
    const phone = provider.user.phone;
    const fallbackUrl = cfg.instagram ?? cfg.facebook ?? cfg.website;

    const waMessage: Record<string, string> = {
      "contact-adopt": "Hola! 🏡 Quiero adoptar un peludo. Mi nombre es ______, vivo en ______ (ciudad/zona) y busco ______ (perro/gato). Mi hogar tiene ______ (espacio).",
      "contact-visit": "Hola! 🚪 Quiero coordinar una visita. Día preferido: ______, hora: ______. Somos ______ personas.",
      "contact-volunteer": "Hola! 🤝 Quiero ser voluntario/a o hacer una donación. Puedo ayudar con ______.",
      "contact-report": "Hola! 🆘 Reporto un peludo: está en ______ (lugar exacto), su condición es ______. Adjunto foto.",
      "contact-generic": "Hola! 👋 Los contacto desde PetService VE 🐾",
    };

    let flowJson = buildFlow(cfg);
    const flow = JSON.parse(flowJson) as { nodes: Record<string, FlowNode> };
    for (const node of Object.values(flow.nodes)) {
      node.actions = node.actions?.map((a) => {
        if (a.type === "contact-generic") {
          return phone ? { ...a, type: "whatsapp", label: "Escribir por WhatsApp 💬", message: waMessage["contact-generic"] } : { ...a, type: "link", url: a.url ?? fallbackUrl ?? undefined };
        }
        if (a.type.startsWith("contact-")) {
          if (phone) return { type: "whatsapp", label: a.label, message: waMessage[a.type] ?? waMessage["contact-generic"] };
          return { type: "link", label: a.label, url: fallbackUrl };
        }
        return a;
      });
    }
    flowJson = JSON.stringify(flow);

    await db.provider.update({
      where: { id: provider.id },
      data: { bookingFlowJson: flowJson },
    });

    const servicesList = provider.services.map((s) => s.name).join(" | ");
    console.log(`✅ ${provider.businessName}: flow (${flowJson.length} B) [canal: ${phone ? "WhatsApp" : fallbackUrl ? "enlace" : "sin canal"}] [servicios: ${servicesList}]`);
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
