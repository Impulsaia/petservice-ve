# 📲 Estrategia de WhatsApp — PetService VE

> Pregunta de fondo del negocio: *"¿garantizamos que el mensaje del prestador llegue al cliente, usamos un solo número, o los dejamos comunicarse entre ellos mismos?"*
>
> **Respuesta corta: híbrido de dos canales.** Cada canal hace lo que mejor hace:

| Canal | ¿Quién envía? | ¿Para qué? | Estado en la demo |
|---|---|---|---|
| **1 número oficial de marca** (WhatsApp Business API) | La plataforma | Mensajes *transaccionales*: confirmación de reserva, pago verificado, recordatorios 24h/2h/30min, estado del pedido | ✅ Simulado (log auditable en Admin → WhatsApp) |
| **Números propios + enlaces `wa.me`** (click-to-chat) | Prestador ↔ cliente | Conversación *humana*: coordinar la dirección, enviar el "ya estoy llegando", fotos del peludito | ✅ Real y activo (botones WhatsApp en reservas) |

---

## ¿Por qué el híbrido y no una sola opción?

### Opción A — Todo por un solo número de la app ❌ (a escala)
- **Pro:** control total, métricas, un único canal auditado.
- **Contras:** la API de WhatsApp Business (Meta Cloud API) es de **pago por conversación**, exige plantillas aprobadas por Meta, verificación del negocio, y el **humano del prestador no puede contestar desde su teléfono** salvo que construyas una bandeja de entrada completa (inbox) dentro de la app. Para un MVP es costo y complejidad innecesarios.

### Opción B — Solo comunicación directa prestador↔cliente ❌
- **Pro:** costo cero, historial en el teléfono de cada quien.
- **Contras:** los mensajes *transaccionales* (pago verificado, recordatorios) quedarían en manos de cada prestador: **no hay garantía de entrega** ni trazabilidad, y la marca pierde presencia.

### Opción C — Híbrido ✅ (la implementada)
1. **Transaccionales = número único de marca.** La plataforma envía las plantillas desde un solo número: entrega verificable (✓ enviado / ✓✓ entregado / ✓✓ leído), opt-out auditable ("responder SALIR") y refuerzo de marca en cada mensaje.
2. **Coordinación humana = números propios con `wa.me`.** El cliente que ya tiene una reserva ve el botón **WhatsApp** en "Mis Reservas" y en la pantalla de éxito; el prestador ve el botón **WhatsApp** en su panel por cada reserva. El enlace abre el chat con mensaje prellenado (`Hola Pet Spa VIP! Escribo por mi reserva PS-0014…`).
   - **Sin costo** de API ni aprobaciones de Meta.
   - **Historial real** en el teléfono de ambos (WhatsApp lo respalda).
   - **Privacidad por diseño:** el teléfono del prestador **no aparece** en el perfil público; se entrega solo cuando **existe una reserva real** entre ambos.

> 💡 **Recomendación final:** mantener el híbrido hasta ~500 reservas/mes. Si el volumen de soporte crece, migrar los transaccionales a **Meta Cloud API** (o un BSP como 360dialog/Twilio) y evaluar la bandeja unificada (opción "chat dentro de la app") como feature premium para prestadores.

---

## Cómo funciona hoy (demo)

1. **Cliente crea reserva** → pantalla de éxito muestra *Vista previa WhatsApp* (transaccional simulado) + botón **"Chatear ya con {negocio} por WhatsApp"** (`wa.me` real).
2. **Cliente → "Mis Reservas"** → cada tarjeta activa tiene botón verde **WhatsApp** con el mensaje prellenado con código de reserva, servicio y mascota.
3. **Prestador → Panel** → cada tarjeta de reserva muestra **WhatsApp** hacia el teléfono del cliente (oculto en reservas canceladas).
4. **Admin → tab WhatsApp** → 3 tarjetas de estrategia + log de envíos con estados `ENVIADO / ENTREGADO / LEIDO / PROGRAMADO`.

### Detalle técnico
- Helper: `waLink(phone, text)` en `src/lib/petservice/format.ts` → `https://wa.me/<dígitos>?text=<mensaje codificado>`.
- API: `GET /api/bookings` (cliente) ahora incluye `provider.user.phone`; `POST /api/bookings` devuelve `providerPhone` al creador de la reserva.
- Los teléfonos demo son sintéticos (`+58 412 555xxxx`): en la demo los enlaces abren WhatsApp con el número de prueba.

## Garantía de entrega (roadmap a producción)

| Nivel | Qué agregar | Esfuerzo |
|---|---|---|
| **1. Hoy (demo)** | Log con estados + botones wa.me | ✅ Hecho |
| **2. Piloto real** | Cuenta WhatsApp Business gratis + número dedicado + plantillas manuales; la app copia el mensaje "listo para enviar" | Bajo |
| **3. Producción** | Meta Cloud API: webhooks `messages.status` (sent/delivered/read/failed) → actualizar `Notification.status`; reintento automático ante `failed`; fallback SMS/email | Medio |
| **4. Escala** | Bandeja unificada in-app (socket.io), respuestas del prestador desde el panel, chatbot de FAQ, encuesta post-servicio | Alto |

### Notas de cumplimiento (Meta)
- Las plantillas transaccionales requieren **aprobación previa** de Meta (categoría `UTILITY`, se aprueban en horas).
- Ventana de atención: respuesta libre solo **24h** después del último mensaje del usuario; fuera de esa ventana, solo plantillas.
- Opt-out obligatorio: "responder SALIR" cancela los recordatorios (guardar en `User`).
- Tasa de envío: empezar en250 msg/seg es innecesario; el límite inicial de Meta es bajo (250 conversations/24h) y sube con la calidad del número.
