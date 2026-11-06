import { db, ensureDbReady } from "@/lib/db";
import {
  CATEGORIES,
  SITE_URL,
  SUPPORT_WHATSAPP,
  SUPPORT_WHATSAPP_WA,
  SUPPORT_EMAIL,
} from "@/lib/petservice/constants";

/**
 * Bloque SEO/GEO server-rendered (se ve en el HTML SIN JavaScript):
 * los crawlers de IA (GPTBot, ClaudeBot, PerplexityBot) y Google leen esto
 * directamente, además de los datos estructurados JSON-LD.
 *
 * Los números (ciudades/prestadores) se consultan de la base de datos real:
 * nada de cifras inventadas. Si la DB no está disponible (p. ej. durante el
 * build), se usa un respaldo aproximado para no romper la página.
 */

interface CityStat {
  name: string;
  state: string;
  count: number;
}

interface SeoData {
  cities: CityStat[];
  totalActive: number;
  verified: number;
}

/** Respaldo (nov 2025) por si la DB no responde en prerender */
const FALLBACK: SeoData = {
  cities: [
    { name: "Barcelona", state: "Anzoátegui", count: 7 },
    { name: "El Tigre", state: "Anzoátegui", count: 14 },
    { name: "Puerto La Cruz", state: "Anzoátegui", count: 28 },
    { name: "Maracay", state: "Aragua", count: 1 },
    { name: "Barinas", state: "Barinas", count: 3 },
    { name: "Ciudad Bolívar", state: "Bolívar", count: 11 },
    { name: "Puerto Ordaz", state: "Bolívar", count: 59 },
    { name: "San Félix", state: "Bolívar", count: 15 },
    { name: "Upata", state: "Bolívar", count: 11 },
    { name: "Caracas", state: "Distrito Capital", count: 45 },
    { name: "La Guaira", state: "La Guaira", count: 0 },
    { name: "Barquisimeto", state: "Lara", count: 10 },
    { name: "Maturín", state: "Monagas", count: 22 },
    { name: "Mérida", state: "Mérida", count: 1 },
    { name: "Porlamar", state: "Nueva Esparta", count: 1 },
    { name: "Guanare", state: "Portuguesa", count: 1 },
    { name: "San Cristóbal", state: "Táchira", count: 2 },
    { name: "Maracaibo", state: "Zulia", count: 13 },
  ],
  totalActive: 244,
  verified: 244,
};

async function fetchSeoData(): Promise<SeoData> {
  try {
    await ensureDbReady();
    const [cities, group, verified] = await Promise.all([
      db.city.findMany({ where: { active: true }, orderBy: [{ state: "asc" }, { name: "asc" }] }),
      db.provider.groupBy({
        by: ["city"],
        _count: { city: true },
        where: { status: { not: "SUSPENDED" } },
      }),
      db.provider.count({ where: { status: "VERIFIED" } }),
    ]);
    const counts = new Map(group.map((g) => [g.city, g._count.city]));
    return {
      cities: cities.map((c) => ({ name: c.name, state: c.state, count: counts.get(c.name) ?? 0 })),
      totalActive: [...counts.values()].reduce((a, b) => a + b, 0),
      verified,
    };
  } catch {
    return FALLBACK;
  }
}

/** FAQ compartida entre el HTML visible y el JSON-LD (deben ser idénticas) */
function buildFaqs(data: SeoData) {
  const activas = data.cities.filter((c) => c.count > 0);
  const listaCiudades = activas.length
    ? activas.map((c) => c.name).join(", ")
    : data.cities.map((c) => c.name).join(", ");
  return [
    {
      q: "¿Qué es PetService VE?",
      a: `PetService VE es el marketplace venezolano de servicios para mascotas a domicilio: reúne comercios y profesionales 100% reales y verificados de peluquería canina y felina, veterinaria, delivery de alimentos y medicinas, pet sitting, paseos, adiestramiento, pet taxi, spa móvil, refugios y adopción en ${data.cities.length} ciudades de Venezuela.`,
    },
    {
      q: "¿Es gratis usar PetService VE como dueño de mascota?",
      a: "Sí. Buscar, comparar y reservar es gratis para los dueños de mascotas: pagas directamente al prestador el precio acordado, en bolívares o dólares, sin comisiones ocultas. La tasa del día se toma del Banco Central de Venezuela (BCV).",
    },
    {
      q: "¿En qué ciudades de Venezuela está disponible?",
      a: `Hoy hay ${data.totalActive} servicios activos de ${data.verified} comercios verificados en ${listaCiudades}. El directorio cubre ${data.cities.length} ciudades del país y se incorporan nuevas ciudades y prestadores cada semana.`,
    },
    {
      q: "¿Cómo reservo un servicio para mi mascota?",
      a: "Elige tu ciudad y sector, busca el servicio (puedes usar la búsqueda con IA Firulais), compara prestadores verificados con reseñas y reserva. El pago se registra en la app con Pago Móvil, transferencia, Zelle, Binance o efectivo, y el prestador lo confirma. Todo el seguimiento llega por WhatsApp.",
    },
    {
      q: "¿Cómo se verifican los prestadores?",
      a: "Cada negocio pasa por una revisión manual del equipo de PetService VE: se comprueba que el comercio, el teléfono y sus redes sociales existan y sean coherentes antes de publicarlo. Solo entonces recibe la insignia «Verificado». No se aceptan comercios ficticios ni datos inventados.",
    },
    {
      q: "¿Venden alimentos para mascotas (perrarinas)?",
      a: "Sí. La categoría Alimentos incluye comercios que venden perrarinas y comida para gatos a domicilio, con productos de Empresas Polar: SuperCan (cachorros y adultos, bolsas de 2, 4 y 18 kg), Dogourmet y Champ's para perros; Don Kat (31% proteína) y Oh Mai Gat! (32% proteína triple) para gatos.",
    },
    {
      q: "Tengo un negocio de mascotas, ¿cómo me registro?",
      a: `Escríbenos por WhatsApp al ${SUPPORT_WHATSAPP} o al correo ${SUPPORT_EMAIL}. El registro es gratuito: verificamos tu comercio y tus servicios aparecen ante los clientes de tu ciudad, con tu panel de reservas y CRM de clientes incluido.`,
    },
  ];
}

export async function SeoContent() {
  const data = await fetchSeoData();
  const faqs = buildFaqs(data);
  const activas = data.cities.filter((c) => c.count > 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "PetService VE",
        url: SITE_URL,
        logo: `${SITE_URL}/og-petservice.jpg`,
        description:
          "Marketplace venezolano de servicios para mascotas a domicilio con comercios reales y verificados.",
        email: SUPPORT_EMAIL,
        areaServed: { "@type": "Country", name: "Venezuela" },
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer service",
          telephone: "+58-424-9526402",
          url: `https://wa.me/${SUPPORT_WHATSAPP_WA}`,
          availableLanguage: ["es"],
        },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "PetService VE",
        alternateName: "PetService Venezuela",
        inLanguage: "es-VE",
        publisher: { "@id": `${SITE_URL}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE_URL}/?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "OfferCatalog",
        "@id": `${SITE_URL}/#catalog`,
        name: "Servicios para mascotas a domicilio",
        provider: { "@id": `${SITE_URL}/#organization` },
        areaServed: { "@type": "Country", name: "Venezuela" },
        itemListElement: CATEGORIES.map((c) => ({
          "@type": "Offer",
          itemOffered: {
            "@type": "Service",
            name: `${c.label} para mascotas`,
            description: c.tagline,
            areaServed: { "@type": "Country", name: "Venezuela" },
          },
        })),
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <section aria-label="Sobre PetService VE" className="mt-12 border-t border-border/60 pt-10">
      {/* Preconnect: acelera los tiles del mapa (React 19 los hoistea al <head>) */}
      <link rel="preconnect" href="https://tile.openstreetmap.org" />
      <link rel="dns-prefetch" href="https://tile.openstreetmap.org" />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr]">
        {/* ── Columna izquierda: qué es + categorías + ciudades ── */}
        <div>
          <h2 className="font-display text-2xl font-black tracking-tight">
            PetService VE — el directorio de servicios para mascotas de Venezuela 🇻🇪
          </h2>
          <div className="mt-3 space-y-2.5 text-sm leading-relaxed text-muted-foreground">
            <p>
              <strong className="text-foreground">PetService VE</strong> es el marketplace
              venezolano de servicios para mascotas <strong className="text-foreground">a domicilio</strong>:
              peluquería canina y felina, veterinaria, delivery de alimentos y medicinas, pet
              sitting, paseos, adiestramiento, pet taxi, spa móvil, refugios y adopción responsable.
              Todos los comercios del directorio son <strong className="text-foreground">reales y
              verificados</strong> por nuestro equipo — nada de negocios ficticios.
            </p>
            <p>
              Hoy contamos con{" "}
              <strong className="text-foreground">
                {data.totalActive} servicios activos de {data.verified} comercios verificados
              </strong>{" "}
              en {activas.length} ciudades del país, con mapa OpenStreetMap, precios en USD y
              bolívares (tasa BCV automática), pagos por Pago Móvil, transferencia, Zelle, Binance
              o efectivo, y soporte humano por WhatsApp.
            </p>
          </div>

          {/* Categorías */}
          <h3 className="mt-6 font-display text-base font-extrabold">
            Categorías de servicio ({CATEGORIES.length})
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <li key={c.key}>
                <a
                  href={`/?cat=${c.key}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  title={`${c.label} para mascotas a domicilio — ${c.tagline}`}
                >
                  <span aria-hidden>{c.emoji}</span>
                  {c.label}
                </a>
              </li>
            ))}
          </ul>

          {/* Ciudades */}
          <h3 className="mt-6 font-display text-base font-extrabold">
            Ciudades con prestadores ({data.cities.length} en toda Venezuela)
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {data.cities.map((c) => (
              <li key={`${c.state}-${c.name}`}>
                <a
                  href={`/?ciudad=${encodeURIComponent(c.name)}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  title={`${c.count > 0 ? `${c.count} prestadores` : "Próximamente"} — ${c.name}, estado ${c.state}`}
                >
                  {c.name}
                  <span className="text-[10px] font-bold text-primary/80">
                    {c.count > 0 ? `· ${c.count}` : "· pronto"}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Columna derecha: FAQ (visible y para IA) ── */}
        <div>
          <h2 id="faq-title" className="font-display text-2xl font-black tracking-tight">
            Preguntas frecuentes
          </h2>
          <div className="mt-3 space-y-2">
            {faqs.map((f, i) => (
              <details
                key={i}
                className="group rounded-2xl border border-border/60 bg-card/60 px-4 py-3 open:bg-card"
                open={i === 0}
              >
                <summary className="cursor-pointer list-none text-sm font-bold marker:hidden [&::-webkit-details-marker]:hidden">
                  <span className="mr-1.5 text-primary" aria-hidden>
                    ❓
                  </span>
                  {f.q}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
