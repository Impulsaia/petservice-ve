# PetService VE — Decisiones de negocio (Venezuela)

## Pagos (MVP)

| Método | Flujo | Conciliación |
|--------|-------|--------------|
| **Pago Móvil** | Se muestran datos del comercio (Banco de Venezuela · 0102 · J-50123456-7); el cliente transfiere e ingresa la referencia | Manual por admin → VERIFICADO → reserva CONFIRMADA + WhatsApp |
| **Transferencia** | BOD · Cta. Corriente · PetService VE C.A. + número de transferencia | Manual por admin |
| **Zelle** | pagos@petservice.ve + confirmación | Manual por admin |
| **Binance Pay/USDT** | BEP20 + TXID | Manual por admin (en producción: chequeo on-chain semiautomático) |
| **Efectivo** | Contra entrega | Auto: se marca VERIFICADO cuando el prestador completa el servicio |

- **Escrow lógico**: el pago verificado retiene el dinero "en plataforma"; se libera
  al prestador (menos comisión) cuando el servicio se completa. Reembolsos manuales
  con trazabilidad (regla: ≥24 h = 100 %, <24 h = 50 %, visible al cancelar).
- **Placeholder Stripe** reservado para expansión fuera de VE (no implementado en MVP).

## Comisiones

- Comisión de plataforma por defecto: **15 %** (configurable en Admin → Config).
- Se calcula al crear la reserva (`commissionUsd`) y alimenta el GMV/informe del admin.

## Tasa de cambio

- USD es la moneda de referencia; **Bs. se calcula a tasa configurable** (40,00 por
  defecto) desde el panel admin. En producción: actualización manual diaria o API
  (BCV/paralelo) con caché.

## Zonas piloto

1. **Caracas** (Chacao, Altamira, Las Mercedes, Sebucán, Los Dos Caminos, El Cafetal,
   El Hatillo, Centro) — mayor densidad sembrada.
2. **Maracaibo** — validación de clima/horarios frescos.
3. **Valencia** — segunda ciudad a evaluar.

Radio de búsqueda configurable 1–30 km (default 8 km).

## Verificación de prestadores (en capas)

1. Email + teléfono ✔ (demo)
2. Cédula/ID: documento cargado, **cifrado, nunca expuesto por API pública**,
   revisión manual del admin (aprobar / rechazar / suspender con notificación).
3. Antecedentes y referencias: opcionales, fase posterior.

Solo prestadores **VERIFIED** aparecen en búsqueda pública.

## WhatsApp como canal de primera clase

Confirmación de reserva, recordatorios (24 h programado), verificación de pago,
estado del servicio, verificación de prestadores. Log auditable con estados
enviado/entregado/leído. Opt-out auditable (responder SALIR). Fallback: email+push
(fase siguiente).

## IA con guardrails

- Asistente "Toby": responde con el catálogo real (nada de precios inventados),
  deriva a soporte humano (botón "hablar con humano" / WhatsApp),
  **nunca da consejos médicos veterinarios** y muestra disclaimer visible.
- Búsqueda semántica: parser local determinista + LLM de respaldo.
- Feature-flag fácil: si el SDK falla, la app degrada sin romper flujos.
