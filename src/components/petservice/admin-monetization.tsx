"use client";

/**
 * PetService VE — Diálogo de monetización del admin (Task 42)
 *
 * Permite al admin, por prestador:
 *  - Cambiar el plan: FREE | SUBSCRIPTION (con fecha de vencimiento) | COMMISSION
 *  - Activar/extend/quitar el DESTACADO (publicidad: aparece primero en búsquedas)
 *  - Ver si el prestador aceptó el convenio de comisiones (fecha + versión)
 *
 * Todas las acciones notifican al prestador por WhatsApp (plantillas en la API).
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { BadgeCheck, Gem, Megaphone, Save, X } from "lucide-react";
import { apiPatch } from "@/lib/petservice/api";
import { PLAN_LABELS, adsActive, planStatusLabel } from "@/lib/petservice/monetization";

export interface MonProviderRow {
  id: string;
  businessName: string;
  plan: string;
  planExpiresAt: string | null;
  adsBoostUntil: string | null;
  commissionAcceptedAt: string | null;
  commissionTermsVersion: string | null;
}

const toInputDate = (v: string | null | undefined) => (v ? new Date(v).toISOString().slice(0, 10) : "");
const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("es-VE", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function MonetizationDialog({
  provider, onClose, onSaved,
}: {
  provider: MonProviderRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [plan, setPlan] = useState("FREE");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (provider) {
      setPlan(provider.plan || "FREE");
      setExpires(toInputDate(provider.planExpiresAt));
    }
  }, [provider]);

  if (!provider) return null;

  const boosted = adsActive({ adsBoostUntil: provider.adsBoostUntil });

  async function send(body: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    try {
      await apiPatch("/api/admin/providers", { id: provider!.id, ...body });
      toast.success(okMsg);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">💎 Monetización · {provider.businessName}</DialogTitle>
          <DialogDescription>
            Plan actual: <strong>{planStatusLabel(provider)}</strong> · Destacado:{" "}
            <strong>{boosted ? `activo hasta ${fmtDate(provider.adsBoostUntil)}` : "inactivo"}</strong>
          </DialogDescription>
        </DialogHeader>

        {/* ── Plan ── */}
        <div className="space-y-2 rounded-xl border border-border/70 p-3.5">
          <Label className="text-xs font-bold">Plan (desbloquea CRM y Calendario)</Label>
          <Select value={plan} onValueChange={setPlan}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="FREE">Gratis — CRM/Calendario bloqueados</SelectItem>
              <SelectItem value="SUBSCRIPTION">Suscripción — pago mensual conciliado</SelectItem>
              <SelectItem value="COMMISSION">Comisión — aceptó convenio (o activación directa)</SelectItem>
            </SelectContent>
          </Select>
          {plan === "SUBSCRIPTION" && (
            <div>
              <Label className="text-xs font-bold">Vence el (opcional, vacío = sin vencimiento)</Label>
              <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className="rounded-xl" />
            </div>
          )}
          <Button
            disabled={busy} onClick={() => send({ action: "setPlan", plan, planExpiresAt: plan === "SUBSCRIPTION" && expires ? expires : null }, `${provider.businessName}: plan ${PLAN_LABELS[plan] ?? plan} guardado 💾`)}
            className="w-full rounded-xl font-bold"
          >
            <Save className="h-4 w-4" /> Guardar plan
          </Button>
        </div>

        {/* ── Destacado ── */}
        <div className="space-y-2 rounded-xl border border-border/70 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="flex items-center gap-1.5 text-xs font-bold"><Megaphone className="h-3.5 w-3.5 text-amber-500" /> Destacado (publicidad en búsquedas)</Label>
            <Badge variant={boosted ? "default" : "secondary"} className="rounded-full px-2 py-0.5 text-[10px] font-bold">
              {boosted ? `hasta ${fmtDate(provider.adsBoostUntil)}` : "inactivo"}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => send({ action: "setAdsBoost", days: 7 }, "Destacado +7 días 📢")} className="h-8 rounded-lg px-3 text-xs font-bold">+7 días</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => send({ action: "setAdsBoost", days: 30 }, "Destacado +30 días 📢")} className="h-8 rounded-lg px-3 text-xs font-bold">+30 días</Button>
            {boosted && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => send({ action: "clearAdsBoost" }, "Destacado desactivado")} className="h-8 rounded-lg px-3 text-xs font-bold text-rose-600">
                <X className="h-3.5 w-3.5" /> Quitar
              </Button>
            )}
          </div>
          <p className="text-[10px] leading-snug text-muted-foreground">Si ya está activo, sumar días extiende desde la fecha actual (no se pierde lo pagado).</p>
        </div>

        {/* ── Convenio de comisiones ── */}
        <div className="rounded-xl border border-border/70 p-3.5">
          <Label className="flex items-center gap-1.5 text-xs font-bold"><BadgeCheck className="h-3.5 w-3.5 text-emerald-600" /> Convenio de comisiones</Label>
          {provider.commissionAcceptedAt ? (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              ✅ Aceptado el <strong className="text-foreground">{fmtDate(provider.commissionAcceptedAt)}</strong> · versión {provider.commissionTermsVersion ?? "—"}
            </p>
          ) : (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Aún no acepta el convenio. El prestador puede aceptarlo solo desde su panel (CRM → "Leer y aceptar convenio").
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-xl font-bold"><Gem className="h-4 w-4" /> Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
