# 🚀 PetService VE — Checklist de lanzamiento oficial con dominio propio

> **Propósito**: guía paso a paso para el día del lanzamiento oficial, cuando se compre un
> dominio pago (ej. `petserviceve.com`). Creado el 2026-02 (post Task 38: SEO/GEO).
> **Estado actual**: MVP en `https://petservice-ve.vercel.app` con bases SEO/GEO ya puestas
> (JSON-LD, llms.txt, sitemap, robots.txt, OG image, deep-links `?q/?ciudad/?cat`).
> **Regla de uso**: marcar cada casilla al completarla. No saltarse la Fase 3 (redirects 301).

---

## 📋 Inventario exacto de URLs a cambiar (auditoría del 2026-02)

Todas las apariciones hardcodeadas de `petservice-ve.vercel.app` en el repo:

| # | Archivo | Qué hay que tocar |
|---|---------|-------------------|
| 1 | `src/app/layout.tsx` (const `SITE_URL`) | `metadataBase`, canonical, hreflang `es-VE`, Open Graph, Twitter card |
| 2 | `src/app/sitemap.ts` (const `SITE_URL`) | URL del sitemap |
| 3 | `src/components/petservice/SeoContent.tsx` (const `SITE_URL`) | JSON-LD `@graph` completo (Organization, WebSite, OfferCatalog, FAQPage) |
| 4 | `public/robots.txt` | Comentario (línea 1) + línea `Sitemap:` (línea 54) |
| 5 | `public/llms.txt` | 8 referencias: descripción (línea 5), contacto (línea 65), 3 endpoints API (69–71), 2 links finales (75–76) |
| 6 | `public/og-petservice.jpg` | ⚠️ La imagen tiene el pill "petservice-ve.vercel.app" **horneado en píxeles** → regenerar |
| 7 | `src/components/petservice/AdminPanel.tsx` (~línea 855) | Texto admin: restricción referrer de la API key de Google Maps (agregar nuevo dominio, **no quitar** el viejo) |
| 8 | `scripts/geocode-zones.ts` (línea 7) | User-Agent del script de research (baja prioridad) |

**Sin cambios necesarios** (verificado): `src/app/manifest.ts` (todo relativo), enlaces
`wa.me` (solo números de teléfono), `vercel.json` (solo cron BCV).

**Recomendación previa (se puede hacer antes de comprar el dominio)**: refactorizar las 3
constantes `SITE_URL` a una sola fuente con variable de entorno:

```ts
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://petservice-ve.vercel.app";
```

Así el día del lanzamiento solo se define `NEXT_PUBLIC_SITE_URL` en Vercel → Settings →
Environment Variables, sin tocar código.

---

## Fase 0 — Comprar el dominio

- [ ] Elegir nombre. Opciones a verificar disponibilidad:
  - `petserviceve.com` / `petservice-ve.com` (.com, internacional)
  - `petservice.com.ve` / `petservice.ve` (venezolano, vía **NIC.VE / CENIT** — ⚠️ puede
    requerir **RIF** y el trámite es más lento; consultar precios vigentes en nic.ve)
- [ ] Registrar en Namecheap, Cloudflare Registrar o similar (~$10–15/año el .com;
    Cloudflare cobra a costo y incluye WHOIS privacy gratis).
- [ ] Activar **auto-renovación** (evita perder el dominio por olvido).
- [ ] Contratarlo mínimo 2 años (leve señal de confianza para buscadores).
- [ ] Activar WHOIS privacy (protege datos personales del registro).

## Fase 1 — DNS + Vercel

- [ ] Vercel → Proyecto → Settings → Domains → "Add" el nuevo dominio.
- [ ] En el registrador, crear los registros que Vercel indique (los estándar):
  - `A` record para el dominio raíz → `76.76.21.21`
  - `CNAME` para `www` → `cname.vercel-dns.com`
- [ ] Elegir **dominio canónico** (recomendado: `www.` como principal por flexibilidad de
  DNS; el raíz debe redirigir al elegido — Vercel lo ofrece con un clic).
- [ ] Esperar propagación DNS (minutos a horas) y confirmar **SSL automático** (candado
  en el navegador).
- [ ] Confirmar que el sitio carga 100% con el nuevo dominio.

## Fase 2 — Cambiar URLs en el código (una sola vez)

- [ ] Refactor `SITE_URL` a `NEXT_PUBLIC_SITE_URL` (ver recomendación arriba) **o** editar
  las 3 constantes directamente (`layout.tsx`, `sitemap.ts`, `SeoContent.tsx`).
- [ ] Actualizar `public/robots.txt` (comentario + línea `Sitemap:`).
- [ ] Actualizar `public/llms.txt` (8 referencias — buscar/reemplazar el dominio viejo).
- [ ] **Regenerar `public/og-petservice.jpg`** con el nuevo dominio en el pill:
  - Generar arte con z-ai image CLI (tamaño debe ser múltiplo de 32: `1344x768` funciona;
    `1440x720` es rechazado por la API).
  - Recortar a `1200x630` con sharp y componer el texto/pill (mismo flujo de la Task 38).
- [ ] `AdminPanel.tsx`: agregar el nuevo dominio a la lista sugerida de referrers de la
  API key de Google Maps (dejar también el viejo durante la transición).
- [ ] (Opcional) `scripts/geocode-zones.ts` User-Agent.
- [ ] Deploy a Vercel y verificar: `view-source:` del sitio muestra el nuevo dominio en
  canonical, JSON-LD y hreflang.

## Fase 3 — Redirecciones 301 del dominio viejo (CRÍTICO, no saltarse)

Preserva cualquier equity SEO acumulado bajo `petservice-ve.vercel.app`:

- [ ] Agregar en `vercel.json`:

```json
{
  "crons": [ { "path": "/api/cron/rate", "schedule": "20 20 * * *" } ],
  "redirects": [
    {
      "source": "/(.*)",
      "has": [{ "type": "host", "value": "petservice-ve.vercel.app" }],
      "destination": "https://www.NUEVODOMINIO.com/$1",
      "permanent": true
    }
  ]
}
```

- [ ] Verificar con `curl -sI https://petservice-ve.vercel.app` → debe responder
  `301` hacia el nuevo dominio (si Vercel no aplica el host-condition al subdominio
  vercel.app, hacer el redirect en el Dashboard → Domains o documentar la limitación).
- [ ] **Mantener el dominio viejo activo mínimo 6–12 meses** (los buscadores tardan en
  transferir señales; nunca dejar morir el redirect).

## Fase 4 — Search Console + Bing (con dominio propio)

- [ ] En Search Console, crear propiedad tipo **Dominio** (ahora sí es posible: usa TXT
  en el DNS del dominio propio, cubre www/apex/http/https de una vez).
- [ ] Verificar con el registro TXT que Google indique.
- [ ] Enviar el sitemap: `https://www.NUEVODOMINIO.com/sitemap.xml`.
- [ ] Inspección de URL → *Solicitar indexación* de la página principal.
- [ ] **Change of Address**: con la propiedad vieja (URL prefix del vercel.app) y la nueva
  (Domain) verificadas, usar la herramienta de cambio de dirección para acelerar la
  migración de señales.
- [ ] **Bing Webmaster Tools**: importar sitio + datos desde Search Console en un clic.
  Vale la pena: el buscador de ChatGPT usa el índice de Bing.
- [ ] (Opcional, GEO) **IndexNow**: crear archivo de clave en `public/` y enviar URLs a
  Bing/Naver/Yandex para indexación instantánea.

## Fase 5 — Contenido: el momento de las landing pages por ciudad

El dominio estable es el disparador ideal para convertir la SPA en URLs indexables
(discutido en Task 39 — técnicamente ya somos capaces de hacerlo):

- [ ] Implementar `src/app/ciudad/[slug]/page.tsx` con `generateStaticParams` (18 ciudades
  reales) + `generateMetadata` + ISR (`revalidate = 3600`): una URL indexable por ciudad,
  server-rendered (los bots de IA no ejecutan JS).
- [ ] JSON-LD por ciudad (`Service`/`ItemList` con conteos reales de prestadores).
- [ ] Expandir `sitemap.ts` con las 18 URLs (y futuras `/categoria/[slug]`).
- [ ] Agregar links internos desde la home (los chips de ciudad de `SeoContent.tsx` ya
  enlazan `/?ciudad=X` → cambiarlos a `/ciudad/slug`).
- [ ] Opcional: también pueden implementarse **antes** del lanzamiento; el valor de
  indexación se materializa igual cuando el dominio propio esté en producción.

## Fase 6 — Post-lanzamiento (primera semana)

- [ ] **Email profesional** con el dominio (Zoho Mail gratis / Google Workspace ~$6/mes):
  reemplaza `impulsaia@gmail.com` como contacto oficial → actualizar `llms.txt` y
  JSON-LD `contactPoint` si aplica.
- [ ] **Google Business Profile**: crear/verificar el perfil del negocio (aparece en
  búsquedas locales y Maps).
- [ ] **Analítica real**: Vercel Analytics (incluido) + GA4 o Plausible para embudo.
- [ ] **Uptime**: UptimeRobot u similar (gratis) contra `/api/cities` como health check.
- [ ] Actualizar WhatsApp Business, bio de redes y material con el nuevo dominio.
- [ ] Monitoreo 2 semanas en Search Console: cobertura (indexadas/no indexadas + razones),
  consultas, Core Web Vitals. Un dominio nuevo tarda **semanas** en mostrar datos: normal.

---

## 💰 Resumen de costos estimados

| Ítem | Costo |
|---|---|
| Dominio .com | ~$10–15/año (nic.ve: consultar vigencia) |
| Search Console / Bing Webmaster | $0 |
| SSL (Vercel) / redirects 301 | $0 (incluido) |
| Vercel Analytics / UptimeRobot | $0 (planes básicos) |
| GA4 | $0 · Plausible ~$9/mes (opcional) |
| Email profesional | $0 (Zoho free) o ~$6/mes (Workspace) |

## ✅ Definition of done del lanzamiento

- [ ] `https://www.NUEVODOMINIO.com` carga completa (mapa, búsqueda, Firulais, reservas)
- [ ] `petservice-ve.vercel.app` responde **301** al nuevo dominio
- [ ] `robots.txt` y sitemap apuntan al dominio nuevo; sitemap enviado y "Success" en GSC
- [ ] `view-source:` muestra canonical + JSON-LD + hreflang con el dominio nuevo
- [ ] OG image regenerada y correcta en https://www.opengraph.xyz (o LinkedIn Post Inspector)
- [ ] Propiedad **Domain** verificada en GSC + Bing importado
- [ ] Email profesional operativo y actualizado en `llms.txt`

## 📌 Notas técnicas clave (por qué existe este plan)

- **GEO**: los bots de IA (GPTBot, ClaudeBot, PerplexityBot…) no ejecutan JavaScript; el
  contenido server-rendered + `llms.txt` + JSON-LD (Task 38) es lo que les permite citar
  al sitio. El dominio propio consolida la autoridad de marca en esas respuestas.
- **301 permanente** (no 302): solo el permanente transfiere señales de ranking.
- **Dominio viejo vivo 6–12 meses**: Google tarda semanas/meses en consolidar la migración.
- **Una sola fuente de verdad para la URL** (`NEXT_PUBLIC_SITE_URL`) evita discrepancias
  entre canonical, sitemap, JSON-LD y robots — la causa #1 de problemas de indexación.
- Mantener siempre **datos 100% reales** (253 prestadores, 244 verificados, 18 ciudades)
  en cualquier contenido nuevo de las landing pages: no inventar cifras ni negocios.
