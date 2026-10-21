/**
 * PetService VE — Constantes de negocio (es-VE)
 */

export type CategoryKey =
  | "GROOMING"
  | "DELIVERY"
  | "PET_SITTING"
  | "DOG_WALKING"
  | "TRAINING"
  | "PET_TAXI"
  | "SPA_MOVIL"
  | "VET";

export interface CategoryMeta {
  key: CategoryKey;
  label: string;
  tagline: string;
  emoji: string;
  /** clases tailwind para chip activo */
  chip: string;
  soft: string; // fondo suave para iconos
  iconColor: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { key: "GROOMING", label: "Peluquería", tagline: "Baño y corte a domicilio", emoji: "✂️", chip: "bg-teal-600 text-white", soft: "bg-teal-100 dark:bg-teal-900/40", iconColor: "text-teal-700 dark:text-teal-300" },
  { key: "DELIVERY", label: "Delivery", tagline: "Comida y medicinas", emoji: "🛵", chip: "bg-orange-500 text-white", soft: "bg-orange-100 dark:bg-orange-900/40", iconColor: "text-orange-600 dark:text-orange-300" },
  { key: "PET_SITTING", label: "Pet Sitting", tagline: "Cuidado en tu casa", emoji: "🏡", chip: "bg-amber-500 text-white", soft: "bg-amber-100 dark:bg-amber-900/40", iconColor: "text-amber-600 dark:text-amber-300" },
  { key: "DOG_WALKING", label: "Paseos", tagline: "Dog walking feliz", emoji: "🦮", chip: "bg-emerald-600 text-white", soft: "bg-emerald-100 dark:bg-emerald-900/40", iconColor: "text-emerald-700 dark:text-emerald-300" },
  { key: "TRAINING", label: "Adiestramiento", tagline: "Obediencia y conducta", emoji: "🎓", chip: "bg-rose-500 text-white", soft: "bg-rose-100 dark:bg-rose-900/40", iconColor: "text-rose-600 dark:text-rose-300" },
  { key: "PET_TAXI", label: "Pet Taxi", tagline: "Transporte seguro", emoji: "🚕", chip: "bg-yellow-500 text-white", soft: "bg-yellow-100 dark:bg-yellow-900/40", iconColor: "text-yellow-600 dark:text-yellow-300" },
  { key: "SPA_MOVIL", label: "Spa Móvil", tagline: "Baño en la puerta", emoji: "🛁", chip: "bg-fuchsia-500 text-white", soft: "bg-fuchsia-100 dark:bg-fuchsia-900/40", iconColor: "text-fuchsia-600 dark:text-fuchsia-300" },
  { key: "VET", label: "Veterinaria", tagline: "Consulta, vacunas y más", emoji: "🩺", chip: "bg-violet-600 text-white", soft: "bg-violet-100 dark:bg-violet-900/40", iconColor: "text-violet-700 dark:text-violet-300" },
];

export function categoryMeta(key: string): CategoryMeta {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[0];
}

// ─────────────── Zonas de búsqueda (Estado Bolívar, Venezuela) ───────────────

export interface Zone {
  name: string;
  city: string;
  lat: number;
  lng: number;
}

export const CITIES = [
  { name: "Puerto Ordaz", emoji: "🏭", tagline: "Ciudad Guayana · Río Caroní" },
  { name: "San Félix", emoji: "🌆", tagline: "Alma oriental de Ciudad Guayana" },
  { name: "Ciudad Bolívar", emoji: "🌉", tagline: "Capital histórica del Orinoco" },
  { name: "Upata", emoji: "⛰️", tagline: "La ciudad del Cerro El Toro" },
] as const;

export const ZONES: Zone[] = [
  // Puerto Ordaz (municipio Caroní — orilla oeste del Caroní)
  { name: "Alta Vista", city: "Puerto Ordaz", lat: 8.2934, lng: -62.7454 },
  { name: "Unare", city: "Puerto Ordaz", lat: 8.2646, lng: -62.7403 },
  { name: "Villa América", city: "Puerto Ordaz", lat: 8.2808, lng: -62.7715 },
  { name: "Los Mangos", city: "Puerto Ordaz", lat: 8.2950, lng: -62.7687 },
  { name: "Villa Colombia", city: "Puerto Ordaz", lat: 8.2752, lng: -62.7657 },
  { name: "Cachamay", city: "Puerto Ordaz", lat: 8.2735, lng: -62.7245 },
  { name: "La Llovizna", city: "Puerto Ordaz", lat: 8.2608, lng: -62.7312 },
  // Sectores suroeste de Puerto Ordaz (coords = suburbios OSM verificados vía Overpass)
  { name: "Core 8", city: "Puerto Ordaz", lat: 8.22855, lng: -62.82539 }, // Urb. Gran Sabana (Core 8)
  { name: "Gran Sabana", city: "Puerto Ordaz", lat: 8.2266, lng: -62.8278 },
  { name: "Guamo", city: "Puerto Ordaz", lat: 8.27478, lng: -62.78208 }, // El Guamo
  { name: "Villa Bahía", city: "Puerto Ordaz", lat: 8.24032, lng: -62.79117 },
  { name: "Río Negro", city: "Puerto Ordaz", lat: 8.26626, lng: -62.74637 },
  { name: "Minifincas", city: "Puerto Ordaz", lat: 8.253, lng: -62.737 }, // sin mapeo OSM: estimación
  { name: "Toro Muerto", city: "Puerto Ordaz", lat: 8.26806, lng: -62.72681 },
  { name: "Santa Rosa", city: "Puerto Ordaz", lat: 8.25999, lng: -62.76068 }, // Lomas de Santa Rosa
  // San Félix (orilla ESTE del Caroní — coords verificados al Este; el puente está junto a la represa Macagua)
  { name: "San Félix Centro", city: "San Félix", lat: 8.3696, lng: -62.66454 }, // Calle Bolívar, Pquia. Simón Bolívar
  { name: "Chirica", city: "San Félix", lat: 8.34754, lng: -62.64713 },
  { name: "El Roble", city: "San Félix", lat: 8.35404, lng: -62.67028 },
  { name: "Los Olivos", city: "San Félix", lat: 8.34454, lng: -62.66113 },
  { name: "Villa Española", city: "San Félix", lat: 8.34454, lng: -62.66113 },
  { name: "Las Américas", city: "San Félix", lat: 8.34154, lng: -62.66463 },
  { name: "11 de Abril", city: "San Félix", lat: 8.35054, lng: -62.64713 },
  { name: "Dalla Costa", city: "San Félix", lat: 8.34117, lng: -62.68045 }, // Av. Dalla Costa (Este)
  { name: "Los Tanques", city: "San Félix", lat: 8.34754, lng: -62.66813 },
  { name: "El Niño", city: "San Félix", lat: 8.35054, lng: -62.65063 },
  { name: "La Cruz", city: "San Félix", lat: 8.34754, lng: -62.66813 },
  { name: "Guaicara", city: "San Félix", lat: 8.35354, lng: -62.64713 },
  { name: "Caratal", city: "San Félix", lat: 8.28821, lng: -62.58243 }, // Pquia. Yocoima
  { name: "Caruachi", city: "San Félix", lat: 8.35054, lng: -62.64713 },
  { name: "El Palúu", city: "San Félix", lat: 8.34754, lng: -62.66463 },
  // Ciudad Bolívar (municipio Heres)
  { name: "Centro Histórico", city: "Ciudad Bolívar", lat: 8.1236, lng: -63.5486 },
  { name: "Vista Hermosa", city: "Ciudad Bolívar", lat: 8.1322, lng: -63.5397 },
  { name: "La Sabanita", city: "Ciudad Bolívar", lat: 8.1097, lng: -63.5419 },
  { name: "Paseo Orinoco", city: "Ciudad Bolívar", lat: 8.1205, lng: -63.5545 },
  { name: "La Coromoto", city: "Ciudad Bolívar", lat: 8.1420, lng: -63.5330 },
  // Upata (municipio Piar)
  { name: "Upata Centro", city: "Upata", lat: 8.0194, lng: -62.4066 },
  { name: "Las Mercedes", city: "Upata", lat: 8.0258, lng: -62.3995 },
  { name: "La Concepción", city: "Upata", lat: 8.0100, lng: -62.4120 },
  { name: "El Cerro (Toro Patú)", city: "Upata", lat: 8.0050, lng: -62.4020 },
];

export const DEMO_LOCATIONS = ZONES;

// ─────────────── Cuentas demo (login de prueba) ───────────────

export interface DemoAccount {
  role: Role3;
  label: string;
  name: string;
  email: string;
  password: string;
  emoji: string;
  desc: string;
  chip: string;
}

export type Role3 = "CLIENT" | "PROVIDER" | "ADMIN";

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: "CLIENT", label: "Cliente", name: "María González", email: "maria@demo.ve", password: "demo1234", emoji: "👩", desc: "Reserva y paga servicios para sus 3 mascotas en Puerto Ordaz", chip: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300" },
  { role: "PROVIDER", label: "Prestador", name: "Ponme Guapo", email: "ponmeguapo@petservice.ve", password: "ponme1234", emoji: "🧑‍🎨", desc: "Dueño de Peluquería Canina Ponme Guapo · Puerto Ordaz · negocio real ✅", chip: "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300" },
  { role: "ADMIN", label: "Administrador", name: "Admin PetService", email: "admin@petservice.ve", password: "admin1234", emoji: "🛡️", desc: "Verifica prestadores, concilia pagos y ve métricas globales", chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" },
];

// ─────────────── Métodos de pago (Venezuela) ───────────────

export interface PaymentMethodMeta {
  key: string;
  label: string;
  desc: string;
  needsReference: boolean;
  refLabel: string;
  placeholder: string;
  emoji: string;
}

export const PAYMENT_METHODS: PaymentMethodMeta[] = [
  { key: "PAGO_MOVIL", label: "Pago Móvil", desc: "Banco de Venezuela · 0102 · RIF J-50123456-7", needsReference: true, refLabel: "N° de referencia (últimos 4+ dígitos)", placeholder: "Ej: 003451892", emoji: "📱" },
  { key: "TRANSFERENCIA", label: "Transferencia", desc: "BOD · Cta. Corriente 0116 0001 22 3345678901 · PetService VE C.A.", needsReference: true, refLabel: "N° de transferencia", placeholder: "Ej: TRF-88231-BOD", emoji: "🏦" },
  { key: "ZELLE", label: "Zelle", desc: "pagos@petservice.ve — PetService VE LLC", needsReference: true, refLabel: "Confirmación / comprobante", placeholder: "Ej: Z-9921", emoji: "💠" },
  { key: "BINANCE", label: "Binance Pay / USDT", desc: "Red BEP20 · ID 987654321 · (sin comisión de red)", needsReference: true, refLabel: "TXID de la transacción", placeholder: "Ej: 0x7A2F991C…", emoji: "🪙" },
  { key: "EFECTIVO", label: "Efectivo", desc: "Contra entrega — el prestador confirma al recibir", needsReference: false, refLabel: "", placeholder: "", emoji: "💵" },
];

export function paymentMeta(key: string): PaymentMethodMeta {
  return PAYMENT_METHODS.find((p) => p.key === key) ?? PAYMENT_METHODS[0];
}

// ─────────────── Estados ───────────────

export const BOOKING_STATUS: Record<string, { label: string; chip: string; dot: string; desc: string }> = {
  PENDIENTE_PAGO: { label: "Pendiente de pago", chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300", dot: "bg-amber-500", desc: "Esperando registro o verificación del pago" },
  CONFIRMADA: { label: "Confirmada", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300", dot: "bg-emerald-500", desc: "Pago verificado, servicio agendado" },
  EN_CURSO: { label: "En curso", chip: "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300", dot: "bg-orange-500", desc: "El servicio está sucediendo ahora" },
  COMPLETADA: { label: "Completada", chip: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300", dot: "bg-teal-500", desc: "Servicio finalizado con éxito" },
  CANCELADA: { label: "Cancelada", chip: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300", dot: "bg-rose-400", desc: "Reserva cancelada" },
};

export const PAYMENT_STATUS: Record<string, { label: string; chip: string }> = {
  PENDIENTE: { label: "Por verificar", chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" },
  VERIFICADO: { label: "Verificado", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" },
  RECHAZADO: { label: "Rechazado", chip: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
};

export const PROVIDER_STATUS: Record<string, { label: string; chip: string }> = {
  PENDING: { label: "En verificación", chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" },
  VERIFIED: { label: "Verificado", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" },
  REJECTED: { label: "Rechazado", chip: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
  SUSPENDED: { label: "Suspendido", chip: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
};

export const NOTIF_STATUS: Record<string, { label: string; chip: string }> = {
  ENVIADO: { label: "Enviado", chip: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  ENTREGADO: { label: "Entregado", chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" },
  LEIDO: { label: "Leído", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" },
  PROGRAMADO: { label: "Programado", chip: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300" },
};

// ─────────────── Reseñas ───────────────

export const REVIEW_TAGS = [
  { key: "PUNTUALIDAD", label: "⏰ Puntualidad" },
  { key: "TRATO", label: "❤️ Trato" },
  { key: "PRECIO", label: "💰 Precio" },
  { key: "LIMPIEZA", label: "✨ Limpieza" },
];

export const PET_SIZES: Record<string, string> = { S: "Pequeño", M: "Mediano", L: "Grande" };
export const PET_SPECIES: Record<string, string> = { PERRO: "🐕 Perro", GATO: "🐈 Gato", OTRO: "🐾 Otro" };

export const CANCEL_POLICY = {
  fullRefundHours: 24,
  partialPct: 50,
};
