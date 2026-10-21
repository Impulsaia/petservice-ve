/**
 * Negocios REALES de mascotas en sectores solicitados por usuarios:
 * Core 8, Gran Sabana, Guamo, Villa Bahía, Río Negro, Minifincas, Toro Muerto
 * (Puerto Ordaz) + aledañas de San Félix y Ciudad Bolívar.
 *
 * Fuente: investigación web (Facebook/Instagram/directorios públicos
 * GuayanaLocal, GuiaSaludyVida, Cylex, Ubicaquí, Infoguía, Todainfo, Guiazona)
 * + geocodificación Nominatim (© OpenStreetMap contributors).
 * Coordenadas estimadas marcadas con conf: "est" (centro del sector).
 * Los teléfonos provienen de las publicaciones públicas del propio negocio.
 */

export interface RealZoneRow {
  id: string;
  name: string;
  kind: "VET" | "TIENDA" | "GROOMING";
  city: "Puerto Ordaz" | "San Félix" | "Ciudad Bolívar";
  address: string;
  phones: string[];
  instagram?: string;
  facebook?: string;
  website?: string;
  lat: number;
  lng: number;
  conf: "geocode" | "sector" | "est";
  source: string;
}

export const REAL_ZONE_ROWS: RealZoneRow[] = [
  // ───────── Puerto Ordaz — sectores este/sur ─────────
  {
    id: "perolero-core8",
    name: "El Perolero Core 8",
    kind: "TIENDA",
    city: "Puerto Ordaz",
    address: "Sector Core 8, Unare, Puerto Ordaz",
    phones: ["+58 412-2021035", "+58 414-8834838"],
    facebook: "El Perolero Puerto Ordaz Core 8",
    lat: 8.268,
    lng: -62.743,
    conf: "sector",
    source: "Facebook (página oficial de la sede Core 8)",
  },
  {
    id: "cev-buganvilla",
    name: "CEV — Clínica de Especialidades Veterinarias",
    kind: "VET",
    city: "Puerto Ordaz",
    address: "C.C. Buganvilla, Puerto Ordaz",
    phones: [],
    instagram: "@ceveterinariapoz",
    lat: 8.266,
    lng: -62.735,
    conf: "est",
    source: "GuayanaLocal + Instagram (@ceveterinariapoz)",
  },
  {
    id: "coquetitos-petshop",
    name: "Coquetitos Pet Shop",
    kind: "TIENDA",
    city: "Puerto Ordaz",
    address: "C.C. Caroní Plaza, Puerto Ordaz",
    phones: [],
    lat: 8.2681,
    lng: -62.7544,
    conf: "geocode",
    source: "GuayanaLocal",
  },
  {
    id: "sion-petshop",
    name: "Sion Pet Shop",
    kind: "TIENDA",
    city: "Puerto Ordaz",
    address: "Av. Paseo Caroní, Puerto Ordaz",
    phones: [],
    lat: 8.2818,
    lng: -62.7583,
    conf: "geocode",
    source: "GuayanaLocal",
  },
  {
    id: "crazy-pets-orinokia",
    name: "Crazy Pets (C.C. Orinokia)",
    kind: "TIENDA",
    city: "Puerto Ordaz",
    address: "Orinokia Mall, Av. Las Américas, Puerto Ordaz",
    phones: [],
    facebook: "Crazy Pets Orinokia",
    lat: 8.2925,
    lng: -62.7444,
    conf: "geocode",
    source: "Facebook (Crazy Pets Orinokia)",
  },
  {
    id: "paticas-estetica",
    name: "PATICAS — Estética de Mascotas",
    kind: "GROOMING",
    city: "Puerto Ordaz",
    address: "Calle Ventuari, N° 63, Puerto Ordaz",
    phones: ["+58 424-9713238"],
    facebook: "Paticas PetShop",
    lat: 8.279,
    lng: -62.769,
    conf: "est",
    source: "Facebook + GuíaSaludyVida",
  },
  {
    id: "dogspital-pzo",
    name: "DOGSPITAL Clínica Veterinaria",
    kind: "VET",
    city: "Puerto Ordaz",
    address: "Puerto Ordaz (dirección exacta por WhatsApp)",
    phones: ["+58 424-9299390"],
    lat: 8.283,
    lng: -62.752,
    conf: "est",
    source: "GuíaSaludyVida + GuayanaLocal",
  },
  {
    id: "vet-caroni-cylex",
    name: "Clínica Veterinaria Caroní",
    kind: "VET",
    city: "Puerto Ordaz",
    address: "Puerto Ordaz (dirección exacta por WhatsApp)",
    phones: ["+58 286-9222578"],
    lat: 8.2755,
    lng: -62.7565,
    conf: "est",
    source: "Cylex Venezuela",
  },
  {
    id: "hospital-vet-santa-rosa",
    name: "Hospital Veterinario Santa Rosa",
    kind: "VET",
    city: "Puerto Ordaz",
    address: "Urb. Santa Rosa, Puerto Ordaz",
    phones: [],
    lat: 8.2588,
    lng: -62.7836,
    conf: "geocode",
    source: "Instagram (Hospital Veterinario Santa Rosa)",
  },
  {
    id: "las-teodokildas",
    name: "Clínica Veterinaria Las Teodokildas",
    kind: "VET",
    city: "Puerto Ordaz",
    address: "Av. Guarapiche, Urb. Río Yocoima, Puerto Ordaz",
    phones: [],
    lat: 8.2817,
    lng: -62.7508,
    conf: "geocode",
    source: "GuayanaLocal + Waze",
  },
  {
    id: "inces-altavista",
    name: "Centro Veterinario Integral INCES Alta Vista",
    kind: "VET",
    city: "Puerto Ordaz",
    address: "Sede INCES, Alta Vista, Puerto Ordaz",
    phones: [],
    lat: 8.2934,
    lng: -62.7454,
    conf: "sector",
    source: "Prensa local (jornadas de atención veterinaria Misión Nevado/INCES)",
  },
  // ───────── San Félix y aledañas ─────────
  {
    id: "agropeluqueria-nr",
    name: "Agropeluquería N.R.",
    kind: "GROOMING",
    city: "San Félix",
    address: "San Félix (dirección exacta por WhatsApp)",
    phones: [],
    lat: 8.2435,
    lng: -62.7995,
    conf: "est",
    source: "Todainfo",
  },
  {
    id: "agro-chirica",
    name: "Agro Avícola Chirica C.A.",
    kind: "TIENDA",
    city: "San Félix",
    address: "Calle El Tablazo / Av. Manuel Piar, San Félix",
    phones: [],
    lat: 8.245,
    lng: -62.802,
    conf: "est",
    source: "Infoguía + Cylex + GuayanaLocal",
  },
  {
    id: "perolero-sf",
    name: "El Perolero San Félix",
    kind: "TIENDA",
    city: "San Félix",
    address: "San Félix (sede Perolero)",
    phones: ["+58 426-6166852"],
    facebook: "El Perolero de Guayana PZO & San Félix",
    lat: 8.2415,
    lng: -62.8075,
    conf: "est",
    source: "Facebook (página oficial)",
  },
  {
    id: "vet-los-olivos",
    name: "Clínica Veterinaria Los Olivos",
    kind: "VET",
    city: "San Félix",
    address: "Sector Los Olivos, San Félix",
    phones: ["+58 286-9291751"],
    lat: 8.2646,
    lng: -62.8176,
    conf: "sector",
    source: "Cylex Venezuela",
  },
  {
    id: "mascotas-felices-sf",
    name: "Consultorio Veterinario Mascotas Felices C.A.",
    kind: "VET",
    city: "San Félix",
    address: "Av. Baralt, San Félix",
    phones: ["+58 416-9002487", "+58 412-3688709"],
    lat: 8.247,
    lng: -62.805,
    conf: "est",
    source: "Guiazona",
  },
  // ───────── Ciudad Bolívar ─────────
  {
    id: "perolero-cb",
    name: "El Perolero Ciudad Bolívar",
    kind: "TIENDA",
    city: "Ciudad Bolívar",
    address: "Ciudad Bolívar (sede Perolero)",
    phones: ["+58 414-9927700", "+58 424-9288829"],
    facebook: "El Perolero de Ciudad Bolívar",
    lat: 8.1225,
    lng: -63.5475,
    conf: "est",
    source: "Facebook (página oficial)",
  },
  {
    id: "mascotisima-cb",
    name: "Mascotísima Pet Shop",
    kind: "TIENDA",
    city: "Ciudad Bolívar",
    address: "Ciudad Bolívar",
    phones: [],
    instagram: "@mascotisima",
    lat: 8.1295,
    lng: -63.5525,
    conf: "est",
    source: "Instagram (MASCOTISIMA PET SHOP · Ciudad Bolívar)",
  },
];
