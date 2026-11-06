import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Nunito } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/petservice/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { SITE_URL } from "@/lib/petservice/constants";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "PetService VE — Servicios para mascotas a domicilio en Venezuela",
    template: "%s · PetService VE",
  },
  description:
    "Servicios para mascotas a domicilio en toda Venezuela: peluquería, veterinaria, alimentos (SuperCan, Dogourmet, Don Kat), pet sitting, paseos y pet taxi. Comercios reales verificados, pago en Bs. o USD y atención por WhatsApp.",
  keywords: [
    "servicios para mascotas Venezuela",
    "marketplace mascotas Venezuela",
    "peluquería canina a domicilio",
    "veterinaria a domicilio Venezuela",
    "grooming mascotas",
    "alimentos para perros Venezuela",
    "alimentos para gatos Venezuela",
    "perrarinas Venezuela",
    "SuperCan",
    "Dogourmet",
    "Champ's",
    "Don Kat",
    "Oh Mai Gat",
    "Empresas Polar mascotas",
    "pet sitting Venezuela",
    "paseos de perros",
    "adiestramiento canino",
    "pet taxi",
    "spa móvil mascotas",
    "refugios de mascotas",
    "adopción de mascotas Venezuela",
    "Puerto Ordaz",
    "San Félix",
    "Ciudad Bolívar",
    "Upata",
    "Caracas",
    "Maracaibo",
    "Barquisimeto",
    "Maturín",
    "Puerto La Cruz",
  ],
  alternates: {
    canonical: "/",
    languages: { "es-VE": "/" },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "/favicon.svg",
  },
  category: "pets",
  openGraph: {
    title: "PetService VE — Tu mascota feliz, sin salir de casa 🐾",
    description:
      "Peluquería, veterinaria, alimentos y más, a domicilio en Venezuela. Comercios reales verificados · Pago en Bs. o USD · Atención por WhatsApp.",
    url: "/",
    siteName: "PetService VE",
    locale: "es_VE",
    type: "website",
    images: [
      {
        url: "/og-petservice.jpg",
        width: 1200,
        height: 630,
        alt: "PetService VE — servicios para mascotas a domicilio en Venezuela",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PetService VE — Servicios para mascotas a domicilio en Venezuela",
    description:
      "Peluquería, veterinaria, alimentos y más, a domicilio en Venezuela. Comercios reales verificados · Pago en Bs. o USD · WhatsApp.",
    images: ["/og-petservice.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0E7C7B",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-VE" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${nunito.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          {children}
          <Toaster richColors position="top-center" toastOptions={{ classNames: { toast: "font-sans" } }} />
        </ThemeProvider>
      </body>
    </html>
  );
}
