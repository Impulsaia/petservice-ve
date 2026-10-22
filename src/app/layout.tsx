import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Nunito } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/petservice/theme-provider";
import { Toaster } from "@/components/ui/sonner";

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
  title: "PetService VE — Servicios a domicilio para mascotas",
  description:
    "Marketplace venezolano de peluquería, veterinaria a domicilio, delivery, pet sitting, paseos, adiestramiento y pet taxi. Prestadores verificados, pago en Bs. o USD y atención por WhatsApp.",
  keywords: ["mascotas", "Venezuela", "grooming", "peluquería canina", "veterinaria a domicilio", "vacunación mascotas", "pet sitting", "delivery", "pet taxi", "estado Bolívar", "Puerto Ordaz", "San Félix"],
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "PetService VE",
    description: "Tu mascota feliz en casa: prestadores verificados en toda Venezuela 🐾",
    siteName: "PetService VE",
    type: "website",
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
