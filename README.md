# 🐾 PetService VE

**Marketplace de servicios a domicilio para mascotas ** 🇻🇪

Peluquería, delivery de alimentos/medicinas, pet sitting, paseos, adiestramiento, pet taxi y spa móvil — con **prestadores verificados**, pagos en **USD y Bs.** (Pago Móvil, transferencia, Zelle, Binance, efectivo) y **IA** en todo el producto.

---

## ✨ Funcionalidades

| Área | Detalle |
|---|---|
| 🛒 **Marketplace** | Búsqueda por radio (Haversine), 7 categorías, filtros (mascota, rating, verificados), orden por distancia/precio, tarjetas con precio dual USD/Bs. |
| 🗺️ **Mapas por ciudad** | Mapas SVG estilizados de Puerto Ordaz, **San Félix**, Ciudad Bolívar y Upata con ríos (Caroní, Orinoco), represas (Macagua, Caruachi), avenidas y pines de prestadores. |
| 📅 **Reservas** | Wizard de 5 pasos, slots según horario del prestador, extras, dirección por zona, notas de mascota. |
| 💳 **Pagos VE** | Pago Móvil / Transferencia / Zelle / Binance / Efectivo con referencia, conciliación por el admin (escrow lógico), precios dual USD ↔ Bs. a tasa configurable. |
| 🧑‍🎨 **Panel del prestador** | KPIs de negocio, iniciar/completar servicio con evidencia, responder reseñas, verificación de identidad, **Consultas IA de su propio negocio**. |
| 🛡️ **Panel admin** | GMV, comisión, conversión, gráfico 7 días, conciliación de pagos, verificación de prestadores, moderación de reseñas, log de WhatsApp simulado, configuración de tasa/comisión, **Consultas IA del marketplace**. |
| 🤖 **IA** | Chat "Toby" con guardrails (no consejos veterinarios, no inventa precios, catálogo real inyectado), búsqueda semántica en criollo ("pelu pa' mi michi en El Roble" → filtros) y consultas de datos en lenguaje natural sin SQL crudo. |
| 🔔 **Notificaciones** | Centro estilo WhatsApp para el cliente + log auditado de plantillas (confirmación, pago verificado, recordatorio 24 h). |
| 🔐 **Seguridad** | Sesiones HMAC-SHA256 en cookie HttpOnly, contraseñas scrypt, rate limiting, verificación de Origin (anti-CSRF), ownership anti-IDOR, guardas de rol, límite de tamaño de cuerpo, cabeceras endurecidas. |

## 🧪 Cuentas demo

| Rol | Correo | Contraseña |
|---|---|---|
| 👩 Cliente | `maria@demo.ve` | `demo1234` |
| 🧑‍🎨 Prestador | `carlos@petservice.ve` | `demo1234` |
| 🛡️ Admin | `admin@petservice.ve` | `admin1234` |

En la pantalla de login hay **botones de un clic** para entrar con cada rol.

## 🚀 Puesta en marcha local

Requisitos: **Node.js 20+** (o Bun ≥ 1.1) y SQLite.

```bash
# 1. Instalar dependencias
npm install          # o: bun install

# 2. Configurar entorno
cp .env.example .env # DATABASE_URL y AUTH_SECRET

# 3. Crear la base de datos
npx prisma db push   # o: bun run db:push

# 4. Sembrar datos demo del estado Bolívar (25 prestadores, 40 reservas…)
npx tsx prisma/seed.ts   # o: bun prisma/seed.ts

# 5. Levantar en desarrollo
npm run dev          # http://localhost:3000
```

## 🏗️ Stack

- **Next.js 16** (App Router) + **TypeScript 5** + **React 19**
- **Tailwind CSS 4** + shadcn/ui (estilo New York) + Lucide + Nunito
- **Prisma ORM** + **SQLite**
- **Zustand** (estado de cliente)
- **z-ai-web-dev-sdk** (LLM del chat y parsers, solo en backend)
- Sonner (toasts), next-themes (modo claro/oscuro)

## 📂 Estructura

```
src/
├─ app/
│  ├─ page.tsx                # SPA de vistas (home, detalle, cliente, dashboards, login)
│  └─ api/                    # 18 endpoints: auth, providers, bookings, payments,
│                             # reviews, pets, notifications, settings, ai, admin, demo
├─ components/petservice/     # UI: marketplace, wizard, dashboards, mapas, ConsultasIA…
└─ lib/petservice/            # auth (HMAC/scrypt), geo (Haversine), constants (zonas Bolívar),
                              # seed, dataquery (consultas NL), store, format
docs/                         # arquitectura, seguridad, despliegue, GitHub
prisma/schema.prisma          # 9 modelos
```

## 🗺️ Cobertura (zonas incluidas)

- **Puerto Ordaz**: Alta Vista, Unare, Villa América, Los Mangos, Villa Colombia, Cachamay, La Llovizna
- **San Félix**: San Félix Centro, El Roble, Los Olivos, Villa Española, Las Américas, 11 de Abril, Dalla Costa, Los Tanques, El Niño, La Cruz — y circunvecinas: Guaicara, Caratal, Caruachi, El Palúu
- **Ciudad Bolívar**: Centro Histórico, Vista Hermosa, La Sabanita, Paseo Orinoco, La Coromoto
- **Upata**: Upata Centro, Las Mercedes, La Concepción, El Cerro (Toro Patú)

## 🔒 Seguridad

Ver modelo de amenazas y pruebas en [`docs/seguridad.md`](docs/seguridad.md). Resumen:

- Contraseñas con **scrypt** + salt por usuario; comparación *timing-safe*
- Sesión firmada **HMAC-SHA256** (cookie `HttpOnly`, `SameSite=None; Secure` con check de Origin)
- **Rate limiting** por IP (login, registro, IA, consultas)
- **Anti-IDOR**: toda operación valida el dueño de la sesión (404 sin filtrar existencia)
- Validación de entradas (emails, enums, longitudes), límite de cuerpo, SQL parametrizado vía Prisma, React escapa el contenido (anti-XSS)
- Cabeceras: CSP `frame-ancestors`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP

## 📦 Despliegue

Guía completa paso a paso en [`docs/despliegue.md`](docs/despliegue.md) — **Vercel** es la opción recomendada (con Turso/Neon para la DB en producción) y hay alternativa con volumen persistente (Railway/Render) si quieres conservar SQLite tal cual.

## 🐙 Subir a GitHub

Instrucciones en [`docs/github.md`](docs/github.md): crear el repo, `git remote add`, push, qué revisar antes de publicar y cómo conectarlo a Vercel.

## 📄 Licencia

MIT — ver [LICENSE](LICENSE).
