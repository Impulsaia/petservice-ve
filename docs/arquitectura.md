# PetService VE — Arquitectura y decisiones técnicas

MVP de marketplace de servicios a domicilio para mascotas (Venezuela), construido como
aplicación web única (SPA sobre una sola ruta `/`) con Next.js 16 App Router.

## 1. Arquitectura general

```
┌────────────────────────────────────────────────────────────┐
│                    Navegador (mobile-first)                │
│   SPA con vistas conmutadas por Zustand (sin rutas):       │
│   home · perfil prestador · área cliente · prestador · admin│
│   + Widget IA flotante (Toby) + nav inferior móvil         │
└───────────────┬────────────────────────────────────────────┘
                │ fetch (JSON, relativo)
┌───────────────▼────────────────────────────────────────────┐
│                 Next.js API Routes (REST interno)          │
│  /api/providers      búsqueda con Haversine + filtros      │
│  /api/providers/[id] perfil público (sin documentos)       │
│  /api/bookings       crear/listar reservas                 │
│  /api/bookings/slots disponibilidad por horario            │
│  /api/bookings/[id]  transiciones de estado (RBAC demo)    │
│  /api/payments       registro de pago (5 métodos VE)       │
│  /api/payments/[id]/reconcile  conciliación admin          │
│  /api/reviews        reseñas + respuestas + moderación     │
│  /api/pets           mascotas del cliente                  │
│  /api/notifications  centro WhatsApp/in-app                │
│  /api/admin/*        métricas, verificaciones, auditoría   │
│  /api/ai/chat        asistente Toby (guardrails + RAG-lite)│
│  /api/ai/search      búsqueda semántica (híbrida)          │
│  /api/settings       tasa Bs./USD y comisión               │
│  /api/demo/reseed    reiniciar datos demo                  │
└───────────────┬────────────────────────────────────────────┘
                │ Prisma ORM
┌───────────────▼────────────────────────────────────────────┐
│              SQLite (db/custom.db) — 9 modelos             │
│  User · Provider · Service · Pet · Booking · Payment ·     │
│  Review · Notification · Settings                          │
└────────────────────────────────────────────────────────────┘
```

## 2. Modelo de datos

| Modelo       | Notas clave                                                                 |
|--------------|------------------------------------------------------------------------------|
| `User`       | roles: CLIENT / PROVIDER / ADMIN (demo: switch de rol, sin credenciales)    |
| `Provider`   | lat/lng + radiusKm (cobertura), scheduleJson (agenda semanal), badges, estado de verificación |
| `Service`    | categoría, precio USD, duración, petTypes/petSizes, extrasJson              |
| `Pet`        | especie/tamaño/raza + notas para el prestador                               |
| `Booking`    | code PS-XXXX, estados: PENDIENTE_PAGO → CONFIRMADA → EN_CURSO → COMPLETADA / CANCELADA |
| `Payment`    | PAGO_MOVIL / TRANSFERENCIA / ZELLE / BINANCE / EFECTIVO + referencia + estado de conciliación |
| `Review`     | rating 1–5 + tags (puntualidad/trato/precio/limpieza) + respuesta del prestador; recalcu­la ratingAvg |
| `Notification`| log de WhatsApp simulado con estados ENVIADO/ENTREGADO/LEIDO/PROGRAMADO     |
| `Settings`   | usdToBs (40), commissionPct (15), defaultRadiusKm (8) — editables desde admin |

## 3. Decisiones técnicas (ADR)

**ADR-001 — Next.js 16 monolito en lugar de monorepo NestJS/Fastify.**
El entorno de despliegue expone una única app Next.js con una ruta visible. Se usa
el patrón "modules by feature": `src/lib/petservice/*` (dominio) + `src/app/api/*`
(API) + `src/components/petservice/*` (UI). La migración a monorepo es mecánica.

**ADR-002 — SQLite + Haversine en JS en lugar de PostGIS.**
El runtime dispone de SQLite. La búsqueda geoespacial (radio 1–30 km, orden por
cercanía) se implementa con la fórmula de Haversine sobre un dataset de prestadores
(<10k en piloto). Con el crecimiento, migrar a PostgreSQL+PostGIS (`ST_DWithin`).

**ADR-003 — SPA de una ruta con vistas conmutadas.**
Restricción del entorno (solo `/` visible). Zustand gobierna `view`, filtros,
ubicación y settings. El wizard de reserva es un Dialog multi-paso.

**ADR-004 — Autenticación demo por roles.**
El MVP demuestra los 3 roles con usuarios sembrados (María/cliente, Carlos/prestador,
Admin). La producción debe usar NextAuth v4 con OTP por WhatsApp (el módulo de
notificaciones ya modela plantillas y consentimiento).

**ADR-005 — Escrow lógico, no custodio.**
El pago verificado marca la reserva CONFIRMADA; la comisión (15 %) se calcula al
crear y la "liberación" ocurre al COMPLETAR. Conciliación manual desde admin,
con logs de auditoría (Notification + reconciledBy).

**ADR-006 — WhatsApp simulado (Cloud API-ready).**
`Notification` replica el contrato de la Cloud API (plantilla, estado de entrega,
opt-out). Cambiar a la API real = implementar el cliente HTTP + webhook firmado;
el resto de la app no cambia.

**ADR-007 — IA transversal con guardrails.**
`/api/ai/chat` inyecta el catálogo REAL (sin inventar precios) + reglas: no
diagnósticos veterinarios, derivación a humano, español VE, presupuesto. Fallback
a respuesta predefinida si el SDK falla. `/api/ai/search` usa un parser local
determinista (regex por intención/zona/mascota) y solo escala al LLM si no
entiende — costo ~0 y latencia <10 ms en el 90 % de los casos.

**ADR-008 — Mapa SVG propio en lugar de MapLibre+tiles.**
Los tiles externos pueden fallar en sandboxes y el objetivo es un MVP liviano en
datos. El mapa estilizado de Caracas (proyección lineal, pines, radio, El Ávila)
cuesta 0 KB de red. Producción: MapLibre GL + OSM/Photon cacheados.

**ADR-009 — Diseño "profesional con un toque de diversión".**
Paleta cálida crema/teal/ámbar (sin azules), tipografía Nunito para display,
patrón de huellitas, micro-animaciones (wiggle, floaty, ping), tarjetas con
sombras suaves y precios duales USD/Bs. en toda la UI. Mobile-first con nav
inferior + safe-area.

## 4. Stack real usado

Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind CSS 4 · shadcn/ui
(New York) · Prisma 6 + SQLite · Zustand 5 · Sonner (toasts) · next-themes ·
Lucide · z-ai-web-dev-sdk (LLM + generación de imagen del hero).
