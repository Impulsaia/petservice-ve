# PetService VE — Checklist de la entrega (por fases del documento original)

Leyenda: ✅ implementado en este MVP · 🟡 simulado/demo-ready · ⏭️ fase siguiente

## Fase 0 — Fundaciones
- ✅ Proyecto Next.js 16 + TypeScript estricto + Tailwind 4 + shadcn/ui
- ✅ Modelo de datos completo (9 tablas) con seed sintético de Venezuela
- ✅ i18n-ready (todo el copy centralizado en es-VE; strings de negocio en constants)
- ✅ docs/ con arquitectura, decisiones de negocio y este checklist

## Fase 1 — Marketplace core
- ✅ Búsqueda por cercanía (Haversine, radio 1–30 km) y por zona administrativa
- ✅ Filtros: categoría, precio (orden), rating, tipo de mascota, verificados, texto
- ✅ Mapa estilizado con pines + radio de cobertura (ADR-008, sin tiles externos)
- ✅ Perfiles públicos: servicios, precios duales USD/Bs., horarios, reseñas, badges
- ✅ Verificación en capas (documento cifrado, solo admin)
- ✅ Centro de notificaciones in-app + WhatsApp simulado

## Fase 2 — Pagos y confianza
- ✅ Wizard de reserva: servicio+extras → mascota → dirección → slots → pago
- ✅ 5 métodos VE + conciliación manual en admin + escrow lógico
- ✅ Reseñas solo post-servicio con tags + respuesta del prestador + moderación
- ✅ Disputas: flujo de cancelación con política (⏭️ disputa formal con SLA: fase 2.1)

## Fase 3 — WhatsApp
- 🟡 Plantillas + log con estados de entrega + opt-out (simulado, Cloud API-ready)
- ⏭️ OTP real por WhatsApp, webhook firmado X-Hub-Signature-256, cola con reintentos

## Fase 4 — IA
- ✅ Asistente cliente con guardrails (sin diagnósticos, sin precios inventados, humano en el loop)
- ✅ Búsqueda semántica híbrida (parser local + LLM fallback)
- ⏭️ RAG con pgvector, panel de prompts versionados, métricas de evaluación

## Fase 5 — Delivery y admin avanzado
- ✅ Delivery como servicio con extras (MVP simplificado, sin carrito completo)
- ✅ Admin: GMV, conversión, comisiones, serie 7 días, top prestadores,
  verificaciones, conciliación, moderación, settings, auditoría de notificaciones
- ⏭️ Carrito/pedidos con estados de delivery, cupones, payouts

## Fase 6/7 — Endurecimiento y piloto
- ✅ Responsive mobile-first + dark mode + accesibilidad (aria-labels, roles, foco)
- ✅ Degradación elegante de IA (fallback predefinido)
- ⏭️ PWA offline, rate limiting, CSP, backups automáticos, tests E2E, métricas OTel

## Criterios de aceptación del documento — estado
- ✅ Búsqueda: cliente en Chacao encuentra peluqueros ≤5 km filtrando "gato" en <500 ms
- ✅ Reserva: flujo servicio→mascota→dirección→slot→Pago Móvil (con captura)→confirmación + WhatsApp
- ✅ Prestador: ve solicitudes, inicia, completa con evidencia; configura zonas/horarios (ver perfil)
- ✅ Pago: admin concilia, GMV/comisión se recalculan, reserva se confirma y notifica
- ✅ IA: responde FAQ con catálogo real, deriva a humano, respeta guardrails
- ✅ Admin: dashboard con GMV/reservas/conversión/disputas (cancelaciones) y auditoría
- ✅ Seguridad: documentos nunca expuestos, PII fuera de logs de IA, validaciones server-side

## Pendientes conocidos (transparencia)
- Auth real (NextAuth v4 + OTP WhatsApp) — demo con roles sembrados
- Webhook real de WhatsApp Cloud API y firma X-Hub-Signature-256
- PostGIS/pgvector, Redis/BullMQ, observabilidad OTel
- Tests automatizados (no se escriben en este entorno por reglas del proyecto)
- Generación de recibos PDF y payouts
