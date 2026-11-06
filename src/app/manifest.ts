import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PetService VE — Servicios para mascotas a domicilio en Venezuela",
    short_name: "PetService VE",
    description:
      "Marketplace venezolano de servicios para mascotas a domicilio: peluquería, veterinaria, alimentos, pet sitting, paseos y más. Comercios reales verificados.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0E7C7B",
    lang: "es-VE",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
