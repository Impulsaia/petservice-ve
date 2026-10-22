import { NextResponse, after } from "next/server";
import { db, flushDb } from "@/lib/db";
import { rateLimit, clientIp, sameOriginOrError, readJson, cleanText } from "@/lib/petservice/auth";
import { ZONES, SUPPORT_WHATSAPP } from "@/lib/petservice/constants";
import { matchFirulais } from "@/lib/petservice/firulais";
import { createZai } from "@/lib/petservice/zai";

/**
 * POST /api/ai/chat — Asistente del cliente (IA transversal con guardrails)
 * 1. Firulais 🐕 (FAQ determinista): match contra FirulaisEntry activas ANTES
 *    del LLM — si responde, se incrementa hits (fire-and-forget) y no hay
 *    costo de LLM. Las preguntas sin match se loguean (FirulaisLog) para
 *    entrenar la base de conocimiento.
 * 2. LLM con guardrails: no diagnósticos veterinarios, no inventar precios,
 *    catálogo real inyectado, derivar a humano.
 */

export const maxDuration = 60;

export async function POST(req: Request) {
  after(() => flushDb()); // persiste cambios en el blob compartido (Vercel)
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  // Rate limit anti-abuso del LLM: 20 mensajes por minuto por IP
  const rl = rateLimit(`aichat:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Demasiados mensajes. Espera un momento 🐾", retryAfterS: rl.retryAfterS }, { status: 429 });

  const body = await readJson<Record<string, unknown>>(req, 32_768);
  if (!body) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });

  const messages: { role: "user" | "assistant"; content: string }[] = Array.isArray(body?.messages)
    ? (body.messages as { role?: string; content?: string }[])
        .filter((m) => m?.content && typeof m.content === "string")
        .slice(-10)
        .map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: cleanText(m.content, 1000) }))
    : [];

  if (messages.length === 0) {
    return NextResponse.json({ error: "messages requerido" }, { status: 400 });
  }

  // ── 1) Firulais 🐕: FAQ determinista antes del LLM ──
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (lastUser?.content) {
    try {
      const entries = await db.firulaisEntry.findMany({ where: { active: true } });
      const match = matchFirulais(lastUser.content, entries);
      if (match) {
        // Fire-and-forget: el contador de hits nunca bloquea la respuesta
        void db.firulaisEntry.update({ where: { id: match.entryId }, data: { hits: { increment: 1 } } }).catch(() => {});
        return NextResponse.json({ reply: match.answer, source: "firulais", entryId: match.entryId, score: match.score });
      }
      // Miss: se guarda la pregunta (máx 200 chars) para entrenar la FAQ
      await db.firulaisLog.create({ data: { question: lastUser.content.slice(0, 200), matched: false } });
    } catch (e) {
      console.error("Firulais matching error (continúa con LLM):", e);
    }
  }

  // Contexto real de la plataforma (catálogo compacto para no saturar el LLM:
  // un catálogo gigante provoca respuestas vacías/timeout en algunas llamadas)
  const [providers, settings] = await Promise.all([
    db.provider.findMany({
      where: { status: "VERIFIED" },
      select: {
        businessName: true, zoneName: true, city: true, ratingAvg: true,
        services: { where: { active: true }, select: { name: true, category: true, priceUsd: true, durationMin: true } },
      },
      orderBy: { ratingCount: "desc" },
      take: 90,
    }),
    db.settings.findUnique({ where: { id: "main" } }),
  ]);

  const catalog = providers
    .slice(0, 90)
    .map((p) => `${p.businessName} (${p.zoneName}, ${p.city}, ⭐${p.ratingAvg}): ${p.services.map((s) => `${s.name} [${s.category}] $${s.priceUsd}`).join("; ")}`.slice(0, 400))
    .join("\n")
    .slice(0, 40_000);

  const systemPrompt = `Eres "Firulais", el asistente virtual de PetService VE 🐾, un marketplace venezolano de servicios a domicilio para mascotas (peluquería, delivery de alimentos/medicinas, pet sitting, paseos, adiestramiento, pet taxi, spa móvil, VETERINARIA: consultas, vacunación, desparasitación y certificados de salud, y también REFUGIOS 🏕️ y ADOPCIÓN responsable ❤️ de mascotas). Empezamos en el estado Bolívar (Puerto Ordaz, San Félix, Ciudad Bolívar y Upata) y estamos EXPANDIENDO a toda Venezuela 🇻🇪.

REGLAS ESTRICTAS:
1. Responde SIEMPRE en español venezolano (como en Guayana), tono cálido, cercano y útil (máximo ~120 palabras). Usa emojis con moderación 🐶. Puedes usar expresiones criollas con moderación: "a la orden", "chamo/chama", "estamos a la orden". Trata al usuario de "tú".
2. Usa SOLO los precios y prestadores del catálogo real incluido abajo. NUNCA inventes precios, zonas ni prestadores. Los precios están en USD y su equivalente en bolívares a la tasa del día: ${settings?.usdToBs ?? 40} Bs. por USD (ej: $18 ≈ Bs. ${Math.round((settings?.usdToBs ?? 40) * 18)}). Cuando des un precio, muestra ambas monedas.
3. NO des diagnósticos ni recetes medicamentos ni dosis. Si preguntan por la salud de su mascota, recomienda con empatía agendar una CONSULTA VETERINARIA de la plataforma (categoría Veterinaria 🩺 — hay vets a domicilio en Puerto Ordaz, San Félix, Ciudad Bolívar y Upata) y ofrece ayuda con pet taxi si es urgencia. Sí puedes dar tips GENERALES de cuidado (alimentación, higiene, paseo, señales de alerta para acudir al vet).
4. No procesas pagos ni cancelaciones: explica el flujo (el cliente paga con Pago Móvil/transferencia/Zelle/Binance/efectivo, sube la referencia, el admin la concilia) y deriva a soporte humano si el usuario insiste.
5. Si no sabes algo o piden hablar con una persona, sugiere el botón "Hablar con humano" o el WhatsApp ${SUPPORT_WHATSAPP}.
6. Para ayudar a reservar: explica que puede tocar un prestador → "Reservar ahora" y elegir servicio, mascota, dirección, horario y método de pago.
7. Puedes recomendar prestadores del catálogo según zona, tipo de mascota (perro, gato o "michi") y presupuesto. Cobertura activa hoy: ${[...new Set(ZONES.map((z) => z.city))].join(", ")}. Si preguntan por otra ciudad de Venezuela, explica que estamos expandiendo y sugiere revisar la sección de Ciudades.
8. Si preguntan por horarios de atención general: la plataforma es 24/7 y cada prestador muestra su horario en su perfil.

CATÁLOGO REAL (actualizado hoy):
${catalog}

MÉTODOS DE PAGO: Pago Móvil (Banco de Venezuela, con número de referencia), Transferencia (BOD), Zelle (pagos@petservice.ve), Binance Pay/USDT, Efectivo contra entrega. Escrow lógico: el dinero se libera cuando el servicio se completa.`;

  try {
    // 2 intentos: el proveedor LLM falla de forma intermitente (respuesta vacía
    // o timeout); un reintento inmediato resuelve la mayoría de los casos sin
    // que el usuario vea el mensaje de "problemita técnico".
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const zai = await createZai();
        const completion = await zai.chat.completions.create({
          messages: [
            { role: "system", content: systemPrompt },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
          ],
          thinking: { type: "disabled" },
        });

        const reply = completion.choices[0]?.message?.content;
        if (!reply || !reply.trim()) throw new Error(`Respuesta vacía (intento ${attempt})`);

        return NextResponse.json({ reply: reply.trim() });
      } catch (err) {
        lastErr = err;
        console.error(`AI chat error (intento ${attempt}/2):`, err instanceof Error ? err.message : err);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("LLM falló tras 2 intentos");
  } catch (e) {
    console.error("AI chat error FINAL (fallback demo):", e);
    // Degradación elegante: respuesta predefinida si la IA falla
    return NextResponse.json({
      reply: `🐾 ¡Hola! Soy Firulais de PetService VE. Estoy teniendo un problemita técnico ahora mismo 😅 pero no te preocupes: puedes explorar prestadores verificados cerca de ti en la página principal, o escríbenos al WhatsApp ${SUPPORT_WHATSAPP} y te atendemos al instante.`,
      fallback: true,
    });
  }
}
