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
  poweredByHeader: false, // no exponer X-Powered-By: Next.js
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Nota: la DB demo viaja embebida en el código (src/lib/petservice/demoDb.ts)
  // y se escribe en /tmp en serverless — ver src/lib/db.ts. No depende del
  // file-tracing (inconsistente entre builds remotos y vercel build local).
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
