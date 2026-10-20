import type { NextConfig } from "next";

const securityHeaders = [
  // Protecciones del navegador.
  // NOTA: no enviamos X-Frame-Options: DENY porque la app corre embebida en el
  // preview del sandbox (iframe). CSP frame-ancestors permite padres HTTPS
  // (panel/pestaña del preview) y bloquea embebido desde HTTP inseguro.
  { key: "Content-Security-Policy", value: "frame-ancestors https: http://localhost:* http://127.0.0.1:*" },
  { key: "X-Content-Type-Options", value: "nosniff" }, // anti MIME-sniffing
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Incluye la DB demo sembrada dentro del bundle en serverless (Vercel).
  // En tiempo de ejecución se copia a /tmp para permitir escrituras de demo
  // (ver src/lib/db.ts). En producción real usar DB externa (docs/despliegue.md).
  outputFileTracingIncludes: {
    "/**": ["./data/demo-seed.db"],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
