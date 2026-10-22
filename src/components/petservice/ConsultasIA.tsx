"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Loader2, Send, Sparkles, Bot } from "lucide-react";
import { apiPost } from "@/lib/petservice/api";

/**
 * ConsultasIA — consola de consultas en lenguaje natural para los dashboards.
 * - scope "admin": pregunta sobre todo el marketplace (/api/admin/query)
 * - scope "provider": pregunta sobre el propio negocio (/api/provider/query)
 * El backend nunca ejecuta SQL crudo: traduce a métricas whitelist.
 */

interface QueryResult {
  spec: { dataset: string; metric: string; groupBy: string | null };
  answer: string;
  engine: "local" | "llm";
  columns: string[];
  rows: (string | number)[][];
}

const EXAMPLES_ADMIN = [
  "Reservas completadas en San Félix este mes",
  "Ingresos por método de pago",
  "Reservas por ciudad",
  "Prestadores por estado",
  "Top zonas por ingresos",
  "Reseñas por rating",
  "Pagos pendientes de conciliar",
  "Servicios por categoría",
];

const EXAMPLES_PROVIDER = [
  "Mis ingresos este mes",
  "Mis reservas por estado",
  "Mis reseñas por rating",
  "Mis pagos por método",
  "Mis reservas canceladas",
  "Evolución diaria de mis reservas",
];

export function ConsultasIA({ scope }: { scope: "admin" | "provider" }) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const examples = scope === "admin" ? EXAMPLES_ADMIN : EXAMPLES_PROVIDER;
  const maxBar = result ? Math.max(1, ...result.rows.map((r) => Number(r[1]) || 0)) : 1;

  async function ask(question: string) {
    if (loading) return;
    if (question.trim().length < 5) {
      setError("Escribe una consulta con al menos 5 caracteres");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const d = await apiPost<QueryResult>(scope === "admin" ? "/api/admin/query" : "/api/provider/query", { question });
      setResult(d);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Error procesando la consulta");
    } finally {
      setLoading(false);
    }
  }

  const isNumericBar = result?.rows.every((r) => typeof r[1] === "number") ?? false;

  return (
    <div className="rounded-2xl border border-border/70 bg-card shadow-sm">
      <div className="border-b border-border/70 bg-secondary/50 px-5 py-4">
        <h3 className="flex items-center gap-2 font-display font-extrabold">
          <Sparkles className="h-4 w-4 text-accent-foreground" /> Consultas con IA
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black uppercase", scope === "admin" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" : "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300")}>
            {scope === "admin" ? "todo el marketplace" : "solo tu negocio"}
          </span>
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {scope === "admin"
            ? "Pregunta en criollo: “¿cuántas reservas se completaron en San Félix este mes?” — responde con cifras reales, sin inventar nada."
            : "Pregunta por tu propio negocio: ingresos, agenda, reseñas y pagos. Solo ve TUS datos."}
        </p>
      </div>

      <div className="space-y-4 p-5">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={scope === "admin" ? "Ej: reservas completadas en San Félix este mes…" : "Ej: mis ingresos este mes…"}
            maxLength={300}
            className="rounded-xl"
            aria-label="Pregunta de consulta"
          />
          <Button type="submit" disabled={loading} className="shrink-0 rounded-xl bg-primary font-bold">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="hidden sm:inline">Consultar</span>
          </Button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => {
                setQ(ex);
                ask(ex);
              }}
              disabled={loading}
              className="rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[11px] font-bold text-secondary-foreground transition-all hover:border-primary/50 hover:bg-primary/10 disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-amber-100 px-3 py-2.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            ⚠️ {error}
          </p>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 rounded-2xl bg-primary/5 p-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
                <Bot className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold leading-relaxed">{result.answer}</p>
                <div className="mt-1.5 flex flex-wrap gap-1 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                  <span className="rounded bg-secondary px-1.5 py-0.5">{result.spec.dataset}</span>
                  <span className="rounded bg-secondary px-1.5 py-0.5">{result.spec.metric}</span>
                  {result.spec.groupBy && <span className="rounded bg-secondary px-1.5 py-0.5">agrupado por {result.spec.groupBy}</span>}
                  <span className="rounded bg-secondary px-1.5 py-0.5">motor: {result.engine === "local" ? "parser local" : "IA"}</span>
                </div>
              </div>
            </div>

            {result.rows.length > 0 && (
              <div className="scroll-slim max-h-72 overflow-y-auto rounded-2xl border border-border/60">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-secondary/80 backdrop-blur">
                    <tr>
                      {result.columns.map((c, i) => (
                        <th key={i} className={cn("px-3 py-2 text-left text-[11px] font-black uppercase tracking-wide text-secondary-foreground", i > 0 && "text-right")}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {result.rows.map((row, ri) => (
                      <tr key={ri} className="transition-colors hover:bg-secondary/30">
                        {row.map((cell, ci) => (
                          <td key={ci} className={cn("px-3 py-2", ci > 0 ? "text-right font-display font-extrabold" : "font-semibold")}>
                            {isNumericBar && ci === 1 && typeof cell === "number" ? (
                              <span className="flex items-center justify-end gap-2">
                                <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-secondary sm:block" aria-hidden>
                                  <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((cell / maxBar) * 100)}%` }} />
                                </span>
                                {cell}
                              </span>
                            ) : (
                              cell
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
