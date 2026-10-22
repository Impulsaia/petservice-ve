"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PawPrint, X, Send, Phone, Sparkles, Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { apiPost } from "@/lib/petservice/api";
import { SUPPORT_WHATSAPP, SUPPORT_WHATSAPP_WA } from "@/lib/petservice/constants";

interface Msg { role: "user" | "assistant"; content: string }

const GREETING: Msg = {
  role: "assistant",
  content:
    "🐾 ¡Hola! Soy Firulais 🐕, el asistente de PetService VE. Pregúntame por servicios, precios, zonas o cómo agendar. ¿En qué te ayudo?",
};

const SUGGESTIONS = [
  "¿Cuánto cuesta un baño para perro pequeño?",
  "¿Quién hace grooming de gatos en Alta Vista?",
  "¿Cómo funciona el Pago Móvil?",
];

export function AiChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHuman, setShowHuman] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const d = await apiPost<{ reply: string }>("/api/ai/chat", { messages: next.slice(-8) });
      setMessages((ms) => [...ms, { role: "assistant", content: d.reply }]);
    } catch {
      setMessages((ms) => [
        ...ms,
        { role: "assistant", content: `🐾 Uy, se me cruzaron los cables 🤖💥. Intenta de nuevo o escríbenos al WhatsApp ${SUPPORT_WHATSAPP}.` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Botón flotante */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir asistente IA Firulais"
          className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-emerald-600 text-white shadow-xl transition-transform hover:scale-110 active:scale-95 md:bottom-6 md:right-6"
        >
          <span className="absolute -inset-1 animate-ping rounded-full bg-primary/20" aria-hidden />
          <PawPrint className="relative h-7 w-7" />
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[9px] font-black text-accent-foreground">IA</span>
        </button>
      )}

      {/* Panel de chat */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex h-[520px] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-3xl border border-border/70 bg-card shadow-2xl md:bottom-6 md:right-6">
          {/* Header */}
          <div className="flex items-center gap-2.5 bg-gradient-to-r from-primary to-emerald-700 px-4 py-3 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
              <Bot className="h-5 w-5" />
            </span>
            <div className="flex-1 leading-tight">
              <div className="text-sm font-black">Firulais · Asistente IA</div>
              <div className="flex items-center gap-1 text-[10px] opacity-90">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> en línea · responde al instante
              </div>
            </div>
            <button onClick={() => setShowHuman((s) => !s)} title="Hablar con humano" className="rounded-full p-1.5 transition-colors hover:bg-white/20">
              <Phone className="h-4 w-4" />
            </button>
            <button onClick={() => setOpen(false)} aria-label="Cerrar chat" className="rounded-full p-1.5 transition-colors hover:bg-white/20">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Derivación a humano */}
          {showHuman && (
            <div className="border-b border-border/70 bg-accent/15 px-4 py-3 text-xs">
              <p className="font-bold text-accent-foreground">👤 Soporte humano</p>
              <p className="mt-1 text-accent-foreground/80">
                WhatsApp: <a href={`https://wa.me/${SUPPORT_WHATSAPP_WA}`} target="_blank" rel="noopener noreferrer" className="underline font-bold"><strong>{SUPPORT_WHATSAPP}</strong></a> (8am–6pm). También puede gestionar pagos y disputas. ¡Te atendemos al instante!
              </p>
            </div>
          )}

          {/* Mensajes */}
          <div ref={scrollRef} className="scroll-slim flex-1 space-y-2.5 overflow-y-auto bg-secondary/30 p-3">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
                    m.role === "user"
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md border border-border/60 bg-card [&_strong]:font-extrabold [&_p]:m-0"
                  )}
                >
                  {m.role === "assistant" ? <ReactMarkdown>{m.content}</ReactMarkdown> : m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border/60 bg-card px-4 py-3 shadow-sm">
                  <PawPrint className="h-4 w-4 animate-bounce text-primary" style={{ animationDelay: "0ms" }} />
                  <PawPrint className="h-4 w-4 animate-bounce text-primary/70" style={{ animationDelay: "150ms" }} />
                  <PawPrint className="h-4 w-4 animate-bounce text-primary/40" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
          </div>

          {/* Sugerencias */}
          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-1.5 border-t border-border/60 px-3 pt-2.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-bold text-primary transition-colors hover:bg-primary/15"
                >
                  <Sparkles className="mr-1 inline h-3 w-3" />
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex items-center gap-2 p-3"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu pregunta…"
              className="rounded-2xl"
              aria-label="Mensaje para el asistente"
            />
            <Button type="submit" size="icon" disabled={loading || !input.trim()} className="shrink-0 rounded-2xl bg-primary hover:bg-primary/90" aria-label="Enviar">
              <Send className="h-4 w-4" />
            </Button>
          </form>

          <p className="px-3 pb-2.5 text-center text-[10px] leading-tight text-muted-foreground">
            Firulais puede equivocarse 🙏 Temas médicos veterinarios: consulta siempre a un profesional.
          </p>
        </div>
      )}
    </>
  );
}
