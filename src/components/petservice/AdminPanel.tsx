"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BadgeCheck, Wallet, ShieldAlert, MessageSquareQuote, Settings2, TrendingUp, Sparkles, Check, X, Ban, RotateCcw, EyeOff, Eye, Save } from "lucide-react";
import { apiGet, apiPost, apiPatch } from "@/lib/petservice/api";
import { useAppStore } from "@/lib/petservice/store";
import { fmtUsd, fmtBs, fmtDateTime, fmtRelative } from "@/lib/petservice/format";
import { Avatar, BookingStatusBadge, PaymentStatusBadge, ProviderStatusBadge, NotifStatusBadge, RatingStars, EmptyState } from "@/components/petservice/shared";
import { ConsultasIA } from "@/components/petservice/ConsultasIA";

interface Metrics {
  gmv: number; commissionRevenue: number; totalBookings: number;
  byStatus: Record<string, number>; pendingPayments: number; conversion: number;
  activeProviders: number;
  days: { date: string; label: string; count: number }[];
  topProviders: { id: string; businessName: string; zoneName: string; ratingAvg: number; gmv: number }[];
}
interface ProviderRow {
  id: string; businessName: string; ownerName: string; email: string; phone: string | null;
  status: string; city: string; zoneName: string; ratingAvg: number; ratingCount: number; badges: string;
}
interface PaymentRow {
  id: string; method: string; status: string; amountUsd: number; amountBs: number; reference: string | null; createdAt: string;
  booking: { code: string; status: string; client: { name: string }; provider: { businessName: string }; service: { name: string } };
}
interface ReviewRow {
  id: string; authorName: string; rating: number; comment: string; tags: string; response: string | null; hidden: boolean; createdAt: string;
  provider: { businessName: string };
  booking: { code: string | null };
}
interface NotifRow { id: string; userId: string; channel: string; template: string; body: string; status: string; createdAt: string }

export function AdminPanel() {
  const { settings, setSettings, bumpData } = useAppStore();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [notifs, setNotifs] = useState<NotifRow[]>([]);

  const load = useCallback(() => {
    apiGet<Metrics>("/api/admin/metrics").then(setMetrics).catch(() => setMetrics(null));
    apiGet<{ providers: ProviderRow[] }>("/api/admin/providers").then((d) => setProviders(d.providers)).catch(() => setProviders([]));
    apiGet<{ payments: PaymentRow[] }>("/api/admin/payments").then((d) => setPayments(d.payments)).catch(() => setPayments([]));
    apiGet<{ reviews: ReviewRow[] }>("/api/admin/reviews").then((d) => setReviews(d.reviews)).catch(() => setReviews([]));
    apiGet<{ notifications: NotifRow[] }>("/api/admin/notifications").then((d) => setNotifs(d.notifications)).catch(() => setNotifs([]));
  }, []);

  useEffect(() => {
    load();
  }, [load, bumpData]);

  async function reconcile(p: PaymentRow, action: "verify" | "reject") {
    try {
      await apiPost(`/api/payments/${p.id}/reconcile`, { action });
      toast.success(action === "verify" ? `Pago de ${p.booking.code} verificado ✅` : `Pago de ${p.booking.code} rechazado`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  async function providerAction(p: ProviderRow, action: string) {
    try {
      await apiPatch("/api/admin/providers", { id: p.id, action });
      toast.success(`${p.businessName}: estado actualizado`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  async function moderateReview(r: ReviewRow, action: "hide" | "show") {
    try {
      await apiPatch("/api/reviews", { id: r.id, action });
      toast.success(action === "hide" ? "Reseña oculta" : "Reseña visible de nuevo");
      load();
    } catch {
      toast.error("Error moderando");
    }
  }

  const pendingPayments = payments.filter((p) => p.status === "PENDIENTE");
  const pendingVerifications = providers.filter((p) => p.status === "PENDING");
  const maxDay = Math.max(1, ...(metrics?.days.map((d) => d.count) ?? [1]));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Avatar name="Admin PetService" emoji="🛡️" className="h-12 w-12 text-xl" />
        <div>
          <h1 className="font-display text-2xl font-black">Panel de Administración</h1>
          <p className="text-sm text-muted-foreground">Métricas, verificaciones, conciliación y auditoría</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard emoji="💎" label="GMV verificado" value={fmtUsd(metrics?.gmv ?? 0)} sub={`≈ ${fmtBs((metrics?.gmv ?? 0) * (settings?.usdToBs ?? 40))}`} accent="text-primary" />
        <KpiCard emoji="🏦" label="Ingresos por comisión" value={fmtUsd(metrics?.commissionRevenue ?? 0)} sub={`comisión ${(settings?.commissionPct ?? 15).toFixed(0)}%`} accent="text-emerald-600" />
        <KpiCard emoji="📅" label="Reservas totales" value={String(metrics?.totalBookings ?? 0)} sub={`conversión ${metrics?.conversion ?? 0}%`} accent="text-amber-600" />
        <KpiCard emoji="⏳" label="Pagos por conciliar" value={String(metrics?.pendingPayments ?? 0)} sub={`${pendingVerifications.length} verificaciones`} accent="text-orange-600" />
      </div>

      <Tabs defaultValue="resumen">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl bg-secondary p-1.5 sm:w-fit">
          <TabsTrigger value="resumen" className="gap-1.5 rounded-xl font-bold"><TrendingUp className="h-4 w-4" /> Resumen</TabsTrigger>
          <TabsTrigger value="pagos" className="gap-1.5 rounded-xl font-bold"><Wallet className="h-4 w-4" /> Pagos ({pendingPayments.length})</TabsTrigger>
          <TabsTrigger value="verif" className="gap-1.5 rounded-xl font-bold"><BadgeCheck className="h-4 w-4" /> Verificaciones ({pendingVerifications.length})</TabsTrigger>
          <TabsTrigger value="resenas" className="gap-1.5 rounded-xl font-bold"><MessageSquareQuote className="h-4 w-4" /> Reseñas</TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-1.5 rounded-xl font-bold">📲 WhatsApp</TabsTrigger>
          <TabsTrigger value="consultas" className="gap-1.5 rounded-xl font-bold"><Sparkles className="h-4 w-4" /> Consultas IA</TabsTrigger>
          <TabsTrigger value="config" className="gap-1.5 rounded-xl font-bold"><Settings2 className="h-4 w-4" /> Config</TabsTrigger>
        </TabsList>

        {/* ── Resumen ── */}
        <TabsContent value="resumen" className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
            <h3 className="font-display font-extrabold">📈 Reservas últimos 7 días</h3>
            <div className="mt-4 flex h-44 items-end gap-2">
              {(metrics?.days ?? []).map((d) => (
                <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="text-xs font-black text-muted-foreground">{d.count || ""}</span>
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-primary to-emerald-400 transition-all hover:opacity-80"
                    style={{ height: `${Math.max(8, Math.round((d.count / maxDay) * 120))}px` }}
                    title={`${d.date}: ${d.count} reservas`}
                  />
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">{d.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {Object.entries(metrics?.byStatus ?? {}).map(([st, n]) => (
                <span key={st} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 font-bold text-secondary-foreground">
                  <BookingStatusBadge status={st} /> {n}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
            <h3 className="font-display font-extrabold">🏆 Top prestadores por GMV</h3>
            <div className="mt-3 space-y-2">
              {(metrics?.topProviders ?? []).map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl bg-secondary/50 px-3 py-2.5">
                  <span className="font-display text-lg font-black text-muted-foreground/50">#{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-extrabold">{p.businessName}</div>
                    <div className="text-[11px] text-muted-foreground">{p.zoneName}</div>
                  </div>
                  <RatingStars value={p.ratingAvg} size="xs" />
                  <span className="font-display text-sm font-black text-primary">{fmtUsd(p.gmv)}</span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ── Pagos ── */}
        <TabsContent value="pagos" className="mt-4">
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
            <div className="border-b border-border/70 bg-secondary/50 px-4 py-3">
              <h3 className="font-display font-extrabold">🧾 Cola de conciliación</h3>
              <p className="text-xs text-muted-foreground">Verifica la referencia en tu banco y confirma. El cliente recibe WhatsApp automático.</p>
            </div>
            <div className="scroll-slim max-h-[480px] divide-y divide-border/60 overflow-y-auto">
              {pendingPayments.length === 0 && <div className="p-8"><EmptyState emoji="✅" title="Todo conciliado" desc="No hay pagos pendientes de verificación." /></div>}
              {pendingPayments.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
                      <span className="font-mono text-muted-foreground">{p.booking.code}</span>
                      <span>{p.booking.client.name} → {p.booking.provider.businessName}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded bg-secondary px-1.5 py-0.5 font-bold uppercase">{p.method.replace("_", " ")}</span>
                      <span>{p.booking.service.name}</span>
                      {p.reference && <span className="font-mono">ref: {p.reference}</span>}
                      <span>{fmtRelative(p.createdAt)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-black text-primary">{fmtUsd(p.amountUsd)}</div>
                    <div className="text-[11px] text-muted-foreground">{fmtBs(p.amountBs)}</div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => reconcile(p, "verify")} className="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-bold hover:bg-emerald-700">
                      <Check className="h-3.5 w-3.5" /> Conciliar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => reconcile(p, "reject")} className="h-8 rounded-lg px-3 text-xs font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950">
                      <X className="h-3.5 w-3.5" /> Rechazar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <h3 className="mb-2 mt-5 font-display text-lg font-extrabold">Historial de pagos</h3>
          <div className="scroll-slim max-h-72 space-y-2 overflow-y-auto pr-1">
            {payments.filter((p) => p.status !== "PENDIENTE").slice(0, 12).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-card px-3.5 py-2.5 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{p.booking.code}</span>
                  <span className="truncate font-semibold">{p.booking.provider.businessName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold">{fmtUsd(p.amountUsd)}</span>
                  <PaymentStatusBadge status={p.status} />
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Verificaciones ── */}
        <TabsContent value="verif" className="mt-4">
          <div className="space-y-2">
            {providers.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
                <Avatar name={p.businessName} className="h-11 w-11 text-sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold">{p.businessName}</span>
                    <ProviderStatusBadge status={p.status} />
                    {p.badges.includes("VERIFICADO") && <BadgeCheck className="h-4 w-4 text-emerald-600" />}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {p.ownerName} · {p.email} {p.phone ? `· ${p.phone}` : ""} · {p.zoneName}, {p.city} · 🪪 documento cargado (cifrado, solo visible aquí)
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.status !== "VERIFIED" ? (
                    <Button size="sm" onClick={() => providerAction(p, "verify")} className="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-bold hover:bg-emerald-700">
                      <BadgeCheck className="h-3.5 w-3.5" /> Verificar
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => providerAction(p, "suspend")} className="h-8 rounded-lg px-3 text-xs font-bold text-rose-600">
                      <Ban className="h-3.5 w-3.5" /> Suspender
                    </Button>
                  )}
                  {p.status === "SUSPENDED" && (
                    <Button size="sm" variant="outline" onClick={() => providerAction(p, "reactivate")} className="h-8 rounded-lg px-3 text-xs font-bold">
                      <RotateCcw className="h-3.5 w-3.5" /> Reactivar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Reseñas ── */}
        <TabsContent value="resenas" className="mt-4">
          <div className="scroll-slim max-h-[560px] space-y-2 overflow-y-auto pr-1">
            {reviews.map((r) => (
              <div key={r.id} className={cn("rounded-2xl border border-border/70 bg-card p-4 shadow-sm", r.hidden && "opacity-50")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-bold">
                      {r.authorName}
                      <span className="text-xs font-normal text-muted-foreground">sobre {r.provider?.businessName ?? "—"} {r.booking?.code ? `· ${r.booking.code}` : ""}</span>
                    </div>
                    <RatingStars value={r.rating} size="xs" className="mt-0.5" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => moderateReview(r, r.hidden ? "show" : "hide")} className="h-8 rounded-lg px-3 text-xs font-bold">
                      {r.hidden ? <><Eye className="h-3.5 w-3.5" /> Mostrar</> : <><EyeOff className="h-3.5 w-3.5" /> Ocultar</>}
                    </Button>
                  </div>
                </div>
                <p className="mt-1.5 text-sm">{r.comment}</p>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── WhatsApp log ── */}
        <TabsContent value="whatsapp" className="mt-4 space-y-4">
          {/* Estrategia de canal */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-50/60 p-4 dark:bg-emerald-950/30">
              <div className="text-lg">✅</div>
              <h4 className="mt-1 font-display text-sm font-black">1. Transaccionales: 1 número oficial</h4>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Confirmaciones, pagos y recordatorios salen de <strong>un solo número de marca</strong> (WhatsApp Business API) con plantillas aprobadas y estado de entrega verificable.
              </p>
              <span className="mt-2 inline-flex rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white">ACTIVO EN LA DEMO</span>
            </div>
            <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-50/60 p-4 dark:bg-emerald-950/30">
              <div className="text-lg">💬</div>
              <h4 className="mt-1 font-display text-sm font-black">2. Prestador ↔ cliente: números propios</h4>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Tras crear una reserva, cada parte ve el botón <strong>WhatsApp</strong> (wa.me) con mensaje prellenado: chat real, historial en el teléfono de cada quien, sin costo de API.
              </p>
              <span className="mt-2 inline-flex rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white">ACTIVO EN LA DEMO</span>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <div className="text-lg">🚀</div>
              <h4 className="mt-1 font-display text-sm font-black">3. Escala futura: Cloud API</h4>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Al crecer: webhooks de entrega (sent/delivered/read), reintentos automáticos, respuestas del prestador dentro de la app con bandeja unificada. Ver <em>docs/whatsapp.md</em>.
              </p>
              <span className="mt-2 inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-black text-muted-foreground">ROADMAP</span>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
            <div className="border-b border-border/70 bg-secondary/50 px-4 py-3">
              <h3 className="font-display font-extrabold">📲 Log de envíos (Cloud API simulada)</h3>
              <p className="text-xs text-muted-foreground">Auditoría de plantillas con estado de entrega. Opt-in/opt-out auditables · fallback a email ante fallas.</p>
            </div>
            <div className="scroll-slim max-h-[520px] divide-y divide-border/60 overflow-y-auto">
              {notifs.map((n) => (
                <div key={n.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-secondary px-1.5 py-0.5 font-black uppercase tracking-wide text-secondary-foreground">{n.template.replace(/_/g, " ")}</span>
                    <NotifStatusBadge status={n.status} />
                    <span className="text-muted-foreground">{n.channel === "WHATSAPP" ? "📱 WhatsApp" : "🔔 In-app"} · {fmtDateTime(n.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed">{n.body}</p>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ── Consultas IA ── */}
        <TabsContent value="consultas" className="mt-4">
          <ConsultasIA scope="admin" />
        </TabsContent>

        {/* ── Config ── */}
        <TabsContent value="config" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* key: reinicializa el form cuando cambian las settings guardadas */}
            {settings && (
              <SettingsForm
                key={`${settings.usdToBs}-${settings.commissionPct}`}
                usdToBs={settings.usdToBs}
                commissionPct={settings.commissionPct}
                onSaved={(s) => {
                  setSettings(s);
                  toast.success("Configuración guardada 💾");
                }}
              />
            )}
            <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
              <h3 className="font-display font-extrabold">🛡️ Seguridad y cumplimiento</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Documentos de identidad cifrados y nunca expuestos en la API pública.</li>
                <li className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Log de auditoría de acciones sensibles (conciliaciones, verificaciones, moderaciones).</li>
                <li className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Consentimiento explícito para WhatsApp con opt-out auditable (responder SALIR).</li>
                <li className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> PII redactada en logs de IA; guardrails contra consejos veterinarios.</li>
              </ul>
              <div className="mt-4 rounded-xl bg-secondary/60 p-3 text-xs">
                <strong>Nota de demo:</strong> esta demo usa datos sintéticos. En producción: backups diarios, rate limiting, CSP y secretos en vault.
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

async function apiPutSettings(usdToBs: number, commissionPct: number) {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usdToBs, commissionPct }),
  });
  if (!res.ok) throw new Error("Error guardando");
  return res.json();
}

/** Formulario de configuración (remontado con key cuando cambian settings) */
function SettingsForm({ usdToBs, commissionPct, onSaved }: {
  usdToBs: number; commissionPct: number; onSaved: (s: { usdToBs: number; commissionPct: number; defaultRadiusKm: number }) => void;
}) {
  const [rateInput, setRateInput] = useState(String(usdToBs));
  const [commInput, setCommInput] = useState(String(commissionPct));

  async function save() {
    try {
      const d = await apiPutSettings(Number(rateInput), Number(commInput));
      onSaved(d.settings);
    } catch {
      toast.error("Valores inválidos");
    }
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <h3 className="font-display font-extrabold">⚙️ Parámetros del marketplace</h3>
      <div className="mt-4 space-y-4">
        <div>
          <Label className="text-xs font-bold">Tasa USD → Bs. (referencial del día)</Label>
          <div className="mt-1 flex gap-2">
            <Input type="number" step="0.01" value={rateInput} onChange={(e) => setRateInput(e.target.value)} className="rounded-xl" />
            <span className="flex items-center text-sm font-bold text-muted-foreground">Bs./$</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Se aplica a nuevos cálculos de precios Bs. (manual o API en producción).</p>
        </div>
        <div>
          <Label className="text-xs font-bold">Comisión de plataforma (%)</Label>
          <div className="mt-1 flex gap-2">
            <Input type="number" step="0.5" value={commInput} onChange={(e) => setCommInput(e.target.value)} className="rounded-xl" />
            <span className="flex items-center text-sm font-bold text-muted-foreground">%</span>
          </div>
        </div>
        <Button onClick={save} className="w-full rounded-xl bg-primary font-bold">
          <Save className="h-4 w-4" /> Guardar configuración
        </Button>
      </div>
    </div>
  );
}

function KpiCard({ emoji, label, value, sub, accent }: { emoji: string; label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-transform hover:-translate-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-xl">{emoji}</span>
        <TrendingUp className="h-4 w-4 text-muted-foreground/40" />
      </div>
      <div className={cn("mt-1.5 font-display text-xl font-black", accent)}>{value}</div>
      <div className="text-xs font-bold">{label}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}
