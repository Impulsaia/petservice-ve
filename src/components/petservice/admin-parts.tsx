"use client";

/**
 * admin-parts.tsx — Secciones del panel de administración (Task 19-c).
 * Cada sección gestiona su propio estado (useState local) y consume las APIs
 * /api/admin/* documentadas en worklog.md (Task 19-a).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Copy, Dog, FilterX, KeyRound, ListFilter, Loader2, MapPinned, Pencil, Plus,
  Search, Trash2, TriangleAlert, X, FlaskConical,
} from "lucide-react";
import { apiGet, apiPost, apiPatch } from "@/lib/petservice/api";
import { useAppStore } from "@/lib/petservice/store";
import { fmtUsd, fmtBs, fmtDate, fmtDateTime, fmtRelative } from "@/lib/petservice/format";
import { CATEGORIES, categoryMeta, BOOKING_STATUS, parroquiasFor } from "@/lib/petservice/constants";
import { Avatar, BookingStatusBadge, PaymentStatusBadge, CategoryIcon, EmptyState } from "@/components/petservice/shared";

// ───────────────────────── Helpers de red / hooks ─────────────────────────

/** DELETE con manejo de error del body (api.ts no expone DELETE). */
export async function apiDelete<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `DELETE ${url} → ${res.status}`);
  }
  return res.json();
}

/** Valor con debounce (para inputs de búsqueda que disparan fetch al API). */
export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function err(e: unknown): string {
  return e instanceof Error ? e.message : "Error inesperado";
}

// ───────────────────────── UI de filtros (común) ─────────────────────────

export function SearchInput({ value, onChange, placeholder = "Buscar…", className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl pl-9 pr-8"
        aria-label={placeholder}
      />
      {value && (
        <button
          type="button"
          aria-label="Limpiar búsqueda"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export interface FilterOption { value: string; label: string }

/** Select de filtro. value "" = sin filtro (muestra el placeholder "todos"). */
export function FilterSelect({ value, onChange, placeholder, options, className }: {
  value: string; onChange: (v: string) => void; placeholder: string; options: FilterOption[]; className?: string;
}) {
  const ALL = "__todos__";
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
      <SelectTrigger aria-label={placeholder} className={cn("h-9 w-full rounded-xl bg-background text-xs font-bold sm:w-auto", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value={ALL} className="text-xs font-bold">{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ActiveChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
      {label}
      <button type="button" aria-label={`Quitar filtro: ${label}`} onClick={onClear} className="rounded-full p-0.5 hover:bg-primary/20">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export function ResultsCount({ count, loading, noun = "resultados" }: { count: number; loading?: boolean; noun?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-bold text-muted-foreground">
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListFilter className="h-3.5 w-3.5" />}
      {count} {noun}
    </span>
  );
}

/**
 * Barra de filtros profesional: inputs arriba, chips activos + contador +
 * "Limpiar filtros" abajo. `chips` describe los filtros aplicados.
 */
export function FilterBar({ children, chips = [], count, loading, noun = "resultados", onClear, extra }: {
  children: React.ReactNode;
  chips?: { label: string; onClear: () => void }[];
  count: number;
  loading?: boolean;
  noun?: string;
  onClear: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:p-4">
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2.5">
        {chips.map((c, i) => (
          <ActiveChip key={`${c.label}-${i}`} label={c.label} onClear={c.onClear} />
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {extra}
          <ResultsCount count={count} loading={loading} noun={noun} />
          <Button variant="outline" size="sm" onClick={onClear} className="h-8 rounded-lg px-3 text-[11px] font-bold">
            <FilterX className="h-3.5 w-3.5" /> Limpiar filtros
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Contenedor estándar de sección: tarjeta con cabecera. */
export function SectionCard({ title, desc, icon, right, children, bodyClassName }: {
  title: string; desc?: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; bodyClassName?: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-secondary/50 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 font-display font-extrabold">{icon}{title}</h3>
          {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
        </div>
        {right}
      </div>
      <div className={cn("p-3 sm:p-4", bodyClassName)}>{children}</div>
    </div>
  );
}

function LoadingBlock({ text = "Cargando…" }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm font-bold text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {text}
    </div>
  );
}

// ─────────────────────────════════ USUARIOS ══════════────────────────────────

interface AdminUserRow {
  id: string; email: string; name: string; phone: string | null;
  role: string; active: boolean; createdAt: string; googleId: string | null;
  provider: { id: string; businessName: string; status: string; city: string } | null;
  _count: { clientBookings: number; pets: number };
}

const ROLE_META: Record<string, { label: string; chip: string }> = {
  CLIENT: { label: "Cliente", chip: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300" },
  PROVIDER: { label: "Prestador", chip: "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300" },
  ADMIN: { label: "Admin", chip: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300" },
};

function RoleBadge({ role }: { role: string }) {
  const m = ROLE_META[role] ?? { label: role, chip: "bg-muted text-muted-foreground" };
  return <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide", m.chip)}>{m.label}</span>;
}

export function UsersSection() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recent");
  const qDeb = useDebounced(q);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Confirmaciones
  const [deactivateTarget, setDeactivateTarget] = useState<AdminUserRow | null>(null);
  const [roleChange, setRoleChange] = useState<{ user: AdminUserRow; role: string } | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUserRow | null>(null);
  const [resetResult, setResetResult] = useState<{ email: string; tempPassword: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (role) params.set("role", role);
      if (qDeb.trim()) params.set("q", qDeb.trim());
      params.set("sort", sort);
      const d = await apiGet<{ users: AdminUserRow[] }>(`/api/admin/users?${params.toString()}`);
      setUsers(d.users);
    } catch {
      toast.error("Error cargando usuarios");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [role, qDeb, sort]);

  useEffect(() => { load(); }, [load]);

  async function patchUser(u: AdminUserRow, body: Record<string, unknown>, okMsg: string) {
    setBusyId(u.id);
    try {
      await apiPatch(`/api/admin/users/${u.id}`, body);
      toast.success(okMsg);
      setDeactivateTarget(null);
      setRoleChange(null);
      await load();
    } catch (e) {
      toast.error(err(e));
    } finally {
      setBusyId(null);
    }
  }

  async function requestReset(u: AdminUserRow) {
    setBusyId(u.id);
    try {
      const d = await apiPost<{ email: string; tempPassword: string }>(`/api/admin/users/${u.id}/reset-password`, {});
      setResetTarget(null);
      setResetResult({ email: d.email, tempPassword: d.tempPassword });
      toast.success(`Contraseña temporal generada para ${d.email}`);
    } catch (e) {
      toast.error(err(e));
    } finally {
      setBusyId(null);
    }
  }

  async function copyTemp() {
    if (!resetResult) return;
    try {
      await navigator.clipboard.writeText(resetResult.tempPassword);
      toast.success("Contraseña copiada al portapapeles 📋");
    } catch {
      toast.error("No se pudo copiar; selecciona y copia manualmente");
    }
  }

  function clearFilters() { setRole(""); setQ(""); setSort("recent"); }

  const chips = [
    ...(role ? [{ label: `Rol: ${ROLE_META[role]?.label ?? role}`, onClear: () => setRole("") }] : []),
    ...(q.trim() ? [{ label: `"${q.trim()}"`, onClear: () => setQ("") }] : []),
    ...(sort !== "recent" ? [{ label: `Orden: ${sort === "name" ? "nombre" : "rol"}`, onClear: () => setSort("recent") }] : []),
  ];

  return (
    <div className="space-y-4">
      <FilterBar
        chips={chips}
        count={users.length}
        loading={loading}
        noun="usuarios"
        onClear={clearFilters}
        extra={
          <FilterSelect
            value={sort}
            onChange={setSort}
            placeholder="Más recientes"
            options={[
              { value: "recent", label: "Más recientes" },
              { value: "name", label: "Nombre (A-Z)" },
              { value: "role", label: "Rol" },
            ]}
            className="sm:w-44"
          />
        }
      >
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre, email o teléfono…" className="w-full sm:w-72" />
        <FilterSelect
          value={role}
          onChange={setRole}
          placeholder="Todos los roles"
          options={Object.entries(ROLE_META).map(([v, m]) => ({ value: v, label: m.label }))}
          className="sm:w-40"
        />
      </FilterBar>

      {loading ? (
        <LoadingBlock text="Cargando usuarios…" />
      ) : users.length === 0 ? (
        <EmptyState emoji="👥" title="Sin usuarios" desc="Ningún usuario coincide con los filtros aplicados." />
      ) : (
        <>
          {/* Tabla (desktop) */}
          <div className="hidden overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm md:block">
            <div className="scroll-slim max-h-[560px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-secondary/80 backdrop-blur">
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Activo</TableHead>
                    <TableHead>Registro</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id} className={cn(!u.active && "opacity-60")}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={u.name || u.email} className="h-9 w-9 text-xs" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-sm font-extrabold">
                              <span className="truncate">{u.name || "—"}</span>
                              {u.googleId && <span title="Cuenta vinculada con Google" className="text-[10px]">🔗</span>}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                            {u.provider && <div className="truncate text-[11px] text-muted-foreground">🏪 {u.provider.businessName} · {u.provider.city}</div>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{u.phone ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <Select value={u.role} onValueChange={(v) => setRoleChange({ user: u, role: v })}>
                          <SelectTrigger aria-label="Cambiar rol" className="h-8 w-[112px] rounded-lg border-none bg-secondary px-2.5 text-[11px] font-bold shadow-none hover:bg-secondary/80">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(ROLE_META).map(([v, m]) => (
                              <SelectItem key={v} value={v} className="text-xs">{m.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={u.active}
                          disabled={busyId === u.id}
                          onCheckedChange={(v) => (v ? patchUser(u, { active: true }, `${u.name || u.email}: cuenta activada`) : setDeactivateTarget(u))}
                          aria-label={`Cuenta ${u.active ? "activa" : "inactiva"}`}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmtDate(u.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === u.id}
                          onClick={() => setResetTarget(u)}
                          className="h-8 rounded-lg px-2.5 text-[11px] font-bold"
                        >
                          <KeyRound className="h-3.5 w-3.5" /> Restablecer
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Cards (móvil) */}
          <div className="grid gap-2 md:hidden">
            {users.map((u) => (
              <div key={u.id} className={cn("rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm", !u.active && "opacity-60")}>
                <div className="flex items-start gap-2.5">
                  <Avatar name={u.name || u.email} className="h-10 w-10 text-xs" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-extrabold">{u.name || "—"}</span>
                      <RoleBadge role={u.role} />
                      {u.googleId && <span className="text-[10px]" title="Vinculada con Google">🔗</span>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      📞 {u.phone ?? "—"} · 🗓️ {fmtDate(u.createdAt)} · 🧾 {u._count.clientBookings} reservas · 🐾 {u._count.pets} mascotas
                    </div>
                    {u.provider && <div className="mt-0.5 text-[11px] font-bold">🏪 {u.provider.businessName} · {u.provider.city}</div>}
                  </div>
                  <Switch
                    checked={u.active}
                    disabled={busyId === u.id}
                    onCheckedChange={(v) => (v ? patchUser(u, { active: true }, `${u.name || u.email}: cuenta activada`) : setDeactivateTarget(u))}
                    aria-label={`Cuenta ${u.active ? "activa" : "inactiva"}`}
                  />
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={busyId === u.id} onClick={() => setResetTarget(u)} className="h-8 rounded-lg px-2.5 text-[11px] font-bold">
                    <KeyRound className="h-3.5 w-3.5" /> Restablecer contraseña
                  </Button>
                  <Select value={u.role} onValueChange={(v) => setRoleChange({ user: u, role: v })}>
                    <SelectTrigger aria-label="Cambiar rol" className="h-8 w-[112px] rounded-lg border-none bg-secondary px-2.5 text-[11px] font-bold shadow-none hover:bg-secondary/80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_META).map(([v, m]) => (
                        <SelectItem key={v} value={v} className="text-xs">{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Confirmar desactivación */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar esta cuenta?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deactivateTarget?.name || deactivateTarget?.email}</strong> no podrá iniciar sesión y su sesión actual dejará de valer.
              {deactivateTarget?.provider && " Su negocio saldrá del marketplace hasta que la cuenta se reactive."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deactivateTarget && patchUser(deactivateTarget, { active: false }, `${deactivateTarget.name || deactivateTarget.email}: cuenta desactivada`)}
              className="bg-rose-600 font-bold text-white hover:bg-rose-700"
            >
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar cambio de rol */}
      <AlertDialog open={!!roleChange} onOpenChange={(o) => !o && setRoleChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cambiar rol de usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{roleChange?.user.name || roleChange?.user.email}</strong> pasará de{" "}
              <RoleBadge role={roleChange?.user.role ?? ""} /> a <RoleBadge role={roleChange?.role ?? ""} />.
              {roleChange?.role === "ADMIN" && " ⚠️ Obtendrá acceso total al panel de administración."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => roleChange && patchUser(roleChange.user, { role: roleChange.role }, `Rol actualizado a ${ROLE_META[roleChange.role]?.label ?? roleChange.role}`)}
              className="font-bold"
            >
              Confirmar cambio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar reset de contraseña */}
      <AlertDialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Generar contraseña temporal?</AlertDialogTitle>
            <AlertDialogDescription>
              Se reemplazará la contraseña de <strong>{resetTarget?.name || resetTarget?.email}</strong> por una temporal segura.
              Se mostrará <strong>una sola vez</strong> y se invalidarán los enlaces de recuperación pendientes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => resetTarget && requestReset(resetTarget)} className="font-bold">
              <KeyRound className="h-4 w-4" /> Generar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Contraseña temporal (una sola vez) */}
      <Dialog open={!!resetResult} onOpenChange={(o) => !o && setResetResult(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>🔑 Contraseña temporal generada</DialogTitle>
            <DialogDescription>Cuenta: <strong>{resetResult?.email}</strong></DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border-2 border-dashed border-amber-400/60 bg-amber-50/70 p-4 text-center dark:bg-amber-950/30">
            <p className="select-all font-mono text-xl font-black tracking-widest">{resetResult?.tempPassword}</p>
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span><strong>Advertencia:</strong> esta contraseña se muestra UNA sola vez y no volverá a aparecer ni se guarda en claro. Compártela por un canal seguro y pide al usuario cambiarla al entrar.</span>
          </p>
          <DialogFooter>
            <Button onClick={copyTemp} className="rounded-xl font-bold"><Copy className="h-4 w-4" /> Copiar</Button>
            <Button variant="outline" onClick={() => setResetResult(null)} className="rounded-xl font-bold">Listo, la anoté</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────════════ SERVICIOS ══════════────────────────────────

interface AdminServiceRow {
  id: string; category: string; name: string; description: string; durationMin: number;
  priceUsd: number; priceToUsd: number | null; modality: string; active: boolean;
  provider: { id: string; businessName: string; city: string; zoneName: string; status: string };
  _count: { bookings: number };
}

const MODALITY_META: Record<string, { label: string; chip: string }> = {
  DOMICILIO: { label: "🏠 Domicilio", chip: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300" },
  PICKUP: { label: "🏪 Recogida", chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" },
  ONLINE: { label: "💻 Online", chip: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300" },
};

export function ServicesSection({ providers }: { providers: { id: string; businessName: string; city: string }[] }) {
  const { bumpData } = useAppStore();
  const [services, setServices] = useState<AdminServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [providerId, setProviderId] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [active, setActive] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const qDeb = useDebounced(q);
  const minDeb = useDebounced(priceMin);
  const maxDeb = useDebounced(priceMax);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Dialog de edición
  const [editing, setEditing] = useState<AdminServiceRow | null>(null);
  const [form, setForm] = useState({ name: "", description: "", priceUsd: "", priceToUsd: "", durationMin: "", modality: "DOMICILIO", active: true });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminServiceRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const cities = useMemo(() => [...new Set(providers.map((p) => p.city))].sort((a, b) => a.localeCompare(b, "es")), [providers]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (qDeb.trim()) params.set("q", qDeb.trim());
      if (providerId) params.set("providerId", providerId);
      if (category) params.set("category", category);
      if (city) params.set("city", city);
      if (active) params.set("active", active);
      const min = Number(minDeb); const max = Number(maxDeb);
      // Workaround backend (ver worklog 19-c): sin priceMin/priceMax el API aplica
      // Number("") = 0 → lte: 0 → 0 resultados. Enviamos siempre el rango completo
      // del dominio válido (0.5–2000, mismos límites del validador).
      params.set("priceMin", minDeb.trim() !== "" && Number.isFinite(min) ? String(min) : "0.5");
      params.set("priceMax", maxDeb.trim() !== "" && Number.isFinite(max) ? String(max) : "2000");
      const d = await apiGet<{ services: AdminServiceRow[] }>(`/api/admin/services?${params.toString()}`);
      setServices(d.services);
    } catch {
      toast.error("Error cargando servicios");
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, [qDeb, providerId, category, city, active, minDeb, maxDeb]);

  useEffect(() => { load(); }, [load]);

  function openEdit(s: AdminServiceRow) {
    setEditing(s);
    setForm({
      name: s.name,
      description: s.description,
      priceUsd: String(s.priceUsd),
      priceToUsd: s.priceToUsd === null ? "" : String(s.priceToUsd),
      durationMin: String(s.durationMin),
      modality: s.modality,
      active: s.active,
    });
  }

  async function saveEdit() {
    if (!editing) return;
    if (form.name.trim().length < 3) return toast.error("El nombre debe tener al menos 3 caracteres");
    if (form.description.trim().length < 10) return toast.error("La descripción debe tener al menos 10 caracteres");
    const priceUsd = Number(form.priceUsd);
    if (!Number.isFinite(priceUsd) || priceUsd < 0.5) return toast.error("Precio USD inválido (mínimo 0.5)");
    const durationMin = Number(form.durationMin);
    if (!Number.isInteger(durationMin) || durationMin < 10 || durationMin > 600) return toast.error("Duración debe ser entero entre 10 y 600 min");
    const priceToUsd = form.priceToUsd.trim() === "" ? null : Number(form.priceToUsd);
    if (priceToUsd !== null && (!Number.isFinite(priceToUsd) || priceToUsd < 0.5)) return toast.error("Precio superior inválido");
    if (priceToUsd !== null && priceToUsd < priceUsd) return toast.error("El precio superior debe ser ≥ al precio base");

    setSaving(true);
    try {
      await apiPatch(`/api/admin/services/${editing.id}`, {
        name: form.name.trim(),
        description: form.description.trim(),
        priceUsd,
        priceToUsd,
        durationMin,
        modality: form.modality,
        active: form.active,
      });
      toast.success(`Servicio "${form.name.trim()}" actualizado ✅`);
      setEditing(null);
      bumpData();
      await load();
    } catch (e) {
      toast.error(err(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s: AdminServiceRow, v: boolean) {
    setBusyId(s.id);
    try {
      await apiPatch(`/api/admin/services/${s.id}`, { active: v });
      toast.success(v ? `"${s.name}" activado` : `"${s.name}" desactivado (oculto del marketplace)`);
      bumpData();
      await load();
    } catch (e) {
      toast.error(err(e));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/admin/services/${deleteTarget.id}`);
      toast.success(`Servicio "${deleteTarget.name}" eliminado`);
      setDeleteTarget(null);
      bumpData();
      await load();
    } catch (e) {
      toast.error(err(e)); // 409: tiene reservas → sugiere desactivar
    } finally {
      setDeleting(false);
    }
  }

  function clearFilters() {
    setQ(""); setProviderId(""); setCategory(""); setCity(""); setActive(""); setPriceMin(""); setPriceMax("");
  }

  const chips = [
    ...(q.trim() ? [{ label: `"${q.trim()}"`, onClear: () => setQ("") }] : []),
    ...(providerId ? [{ label: providers.find((p) => p.id === providerId)?.businessName ?? "Prestador", onClear: () => setProviderId("") }] : []),
    ...(category ? [{ label: categoryMeta(category).label, onClear: () => setCategory("") }] : []),
    ...(city ? [{ label: city, onClear: () => setCity("") }] : []),
    ...(active ? [{ label: active === "true" ? "Activos" : "Inactivos", onClear: () => setActive("") }] : []),
    ...(priceMin.trim() ? [{ label: `Desde ${fmtUsd(Number(priceMin))}`, onClear: () => setPriceMin("") }] : []),
    ...(priceMax.trim() ? [{ label: `Hasta ${fmtUsd(Number(priceMax))}`, onClear: () => setPriceMax("") }] : []),
  ];

  const providerOptions = providers.map((p) => ({ value: p.id, label: p.businessName }));

  return (
    <div className="space-y-4">
      <FilterBar chips={chips} count={services.length} loading={loading} noun="servicios" onClear={clearFilters}>
        <SearchInput value={q} onChange={setQ} placeholder="Servicio, descripción o prestador…" className="w-full sm:w-64" />
        <FilterSelect value={providerId} onChange={setProviderId} placeholder="Todos los prestadores" options={providerOptions} className="sm:w-52" />
        <FilterSelect value={category} onChange={setCategory} placeholder="Todas las categorías" options={CATEGORIES.map((c) => ({ value: c.key, label: `${c.emoji} ${c.label}` }))} className="sm:w-44" />
        <FilterSelect value={city} onChange={setCity} placeholder="Todas las ciudades" options={cities.map((c) => ({ value: c, label: c }))} className="sm:w-40" />
        <FilterSelect value={active} onChange={setActive} placeholder="Activos e inactivos" options={[{ value: "true", label: "✅ Solo activos" }, { value: "false", label: "🚫 Solo inactivos" }]} className="sm:w-40" />
        <div className="flex items-center gap-1.5">
          <Input type="number" step="0.5" min="0" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="$ mín" aria-label="Precio mínimo" className="h-9 w-20 rounded-xl text-xs" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="number" step="0.5" min="0" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="$ máx" aria-label="Precio máximo" className="h-9 w-20 rounded-xl text-xs" />
        </div>
      </FilterBar>

      {loading ? (
        <LoadingBlock text="Cargando servicios…" />
      ) : services.length === 0 ? (
        <EmptyState emoji="🛁" title="Sin servicios" desc="Ningún servicio coincide con los filtros aplicados." />
      ) : (
        <>
          {/* Tabla (desktop) */}
          <div className="hidden overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm md:block">
            <div className="scroll-slim max-h-[560px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-secondary/80 backdrop-blur">
                  <TableRow>
                    <TableHead>Servicio</TableHead>
                    <TableHead>Prestador</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Ciudad</TableHead>
                    <TableHead>Precio</TableHead>
                    <TableHead>Duración</TableHead>
                    <TableHead>Modalidad</TableHead>
                    <TableHead>Activo</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((s) => {
                    const meta = categoryMeta(s.category);
                    return (
                      <TableRow key={s.id} className={cn(!s.active && "opacity-60")}>
                        <TableCell className="max-w-[220px]">
                          <div className="truncate text-sm font-extrabold">{s.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{s.description}</div>
                        </TableCell>
                        <TableCell className="max-w-[150px]">
                          <div className="truncate text-sm font-bold">{s.provider.businessName}</div>
                          <div className="text-[11px] text-muted-foreground">{s.provider.zoneName}</div>
                        </TableCell>
                        <TableCell>
                          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold", meta.soft, meta.iconColor)}>
                            {meta.emoji} {meta.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{s.provider.city}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="font-display text-sm font-black text-primary">
                            {s.priceToUsd !== null ? `${fmtUsd(s.priceUsd)} – ${fmtUsd(s.priceToUsd)}` : fmtUsd(s.priceUsd)}
                          </div>
                          {s.priceToUsd !== null && <div className="text-[10px] text-muted-foreground">rango "desde"</div>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{s.durationMin} min</TableCell>
                        <TableCell>
                          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold", (MODALITY_META[s.modality] ?? MODALITY_META.DOMICILIO).chip)}>
                            {(MODALITY_META[s.modality] ?? MODALITY_META.DOMICILIO).label}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Switch checked={s.active} disabled={busyId === s.id} onCheckedChange={(v) => toggleActive(s, v)} aria-label={`Servicio ${s.active ? "activo" : "inactivo"}`} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => openEdit(s)} className="h-8 rounded-lg px-2 text-[11px] font-bold"><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(s)} className="h-8 rounded-lg px-2 text-[11px] font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Cards (móvil) */}
          <div className="grid gap-2 md:hidden">
            {services.map((s) => {
              const meta = categoryMeta(s.category);
              return (
                <div key={s.id} className={cn("rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm", !s.active && "opacity-60")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold">{s.name}</div>
                      <div className="text-[11px] font-bold">🏪 {s.provider.businessName} · {s.provider.city}</div>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", meta.soft, meta.iconColor)}>{meta.emoji} {meta.label}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="font-display text-sm font-black text-primary">
                      {s.priceToUsd !== null ? `${fmtUsd(s.priceUsd)} – ${fmtUsd(s.priceToUsd)}` : fmtUsd(s.priceUsd)}
                    </span>
                    <span>⏱️ {s.durationMin} min</span>
                    <span>{(MODALITY_META[s.modality] ?? MODALITY_META.DOMICILIO).label}</span>
                    <span>🧾 {s._count.bookings} reservas</span>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <Switch checked={s.active} disabled={busyId === s.id} onCheckedChange={(v) => toggleActive(s, v)} aria-label={`Servicio ${s.active ? "activo" : "inactivo"}`} />
                    <span className="text-[11px] font-bold text-muted-foreground">{s.active ? "Activo" : "Inactivo"}</span>
                    <div className="ml-auto flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => openEdit(s)} className="h-8 rounded-lg px-2.5 text-[11px] font-bold"><Pencil className="h-3.5 w-3.5" /> Editar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(s)} className="h-8 rounded-lg px-2.5 text-[11px] font-bold text-rose-600"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Dialog editar servicio */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="scroll-slim max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CategoryIcon category={editing?.category ?? "GROOMING"} className="h-5 w-5" /> Editar servicio</DialogTitle>
            <DialogDescription>
              {editing?.provider.businessName} · {editing?.provider.city} · {editing?._count.bookings} reserva(s) asociada(s)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div>
              <Label className="text-xs font-bold">Nombre del servicio</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 rounded-xl" maxLength={80} />
            </div>
            <div>
              <Label className="text-xs font-bold">Descripción</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 min-h-20 rounded-xl" maxLength={600} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold">Precio USD (desde)</Label>
                <Input type="number" step="0.5" min="0.5" value={form.priceUsd} onChange={(e) => setForm({ ...form, priceUsd: e.target.value })} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-xs font-bold">Precio tope (opcional)</Label>
                <Input type="number" step="0.5" min="0.5" value={form.priceToUsd} onChange={(e) => setForm({ ...form, priceToUsd: e.target.value })} placeholder="—" className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-xs font-bold">Duración (min)</Label>
                <Input type="number" step="5" min="10" max="600" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-xs font-bold">Modalidad</Label>
                <Select value={form.modality} onValueChange={(v) => setForm({ ...form, modality: v })}>
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MODALITY_META).map(([v, m]) => <SelectItem key={v} value={v} className="text-xs">{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-secondary/50 px-3.5 py-2.5">
              <div>
                <div className="text-sm font-bold">Servicio activo</div>
                <div className="text-[11px] text-muted-foreground">Los servicios inactivos no aparecen en el marketplace</div>
              </div>
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} aria-label="Servicio activo" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} className="rounded-xl font-bold">Cancelar</Button>
            <Button onClick={saveEdit} disabled={saving} className="rounded-xl bg-primary font-bold">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />} Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminación */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este servicio?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> de {deleteTarget?.provider.businessName} se eliminará permanentemente.
              {deleteTarget && deleteTarget._count.bookings > 0 && ` ⚠️ Tiene ${deleteTarget._count.bookings} reserva(s) asociada(s): el sistema rechazará el borrado; en ese caso desactívalo.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting} className="bg-rose-600 font-bold text-white hover:bg-rose-700">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────════════ RESERVAS ══════════────────────────────────

interface AdminBookingRow {
  id: string; code: string; status: string; priceUsd: number; priceBs: number; address: string; scheduledAt: string;
  client: { id: string; name: string; phone: string | null };
  provider: { id: string; businessName: string; city: string; zoneName: string };
  service: { id: string; name: string; category: string };
  pet: { id: string; name: string; species: string } | null;
  payment: { id: string; method: string; status: string; reference: string | null } | null;
}

interface BookingsSummary {
  total: number;
  porEstado: Record<string, number>;
  ingresosCompletadas: number;
  gmv: number;
}

export function BookingsSection({ providers }: { providers: { id: string; businessName: string; city: string }[] }) {
  const [bookings, setBookings] = useState<AdminBookingRow[]>([]);
  const [summary, setSummary] = useState<BookingsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [providerId, setProviderId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("date_desc");
  const qDeb = useDebounced(q);

  const cities = useMemo(() => [...new Set(providers.map((p) => p.city))].sort((a, b) => a.localeCompare(b, "es")), [providers]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (city) params.set("city", city);
      if (category) params.set("category", category);
      if (status) params.set("status", status);
      if (providerId) params.set("providerId", providerId);
      if (/^\d{4}-\d{2}-\d{2}$/.test(from)) params.set("from", from);
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) params.set("to", to);
      if (qDeb.trim()) params.set("q", qDeb.trim());
      if (sort !== "date_desc") params.set("sort", sort);
      const d = await apiGet<{ bookings: AdminBookingRow[]; summary: BookingsSummary }>(`/api/admin/bookings?${params.toString()}`);
      setBookings(d.bookings);
      setSummary(d.summary);
    } catch {
      toast.error("Error cargando reservas");
      setBookings([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [city, category, status, providerId, from, to, qDeb, sort]);

  useEffect(() => { load(); }, [load]);

  function clearFilters() {
    setCity(""); setCategory(""); setStatus(""); setProviderId(""); setFrom(""); setTo(""); setQ(""); setSort("date_desc");
  }

  const chips = [
    ...(city ? [{ label: city, onClear: () => setCity("") }] : []),
    ...(category ? [{ label: categoryMeta(category).label, onClear: () => setCategory("") }] : []),
    ...(status ? [{ label: BOOKING_STATUS[status]?.label ?? status, onClear: () => setStatus("") }] : []),
    ...(providerId ? [{ label: providers.find((p) => p.id === providerId)?.businessName ?? "Prestador", onClear: () => setProviderId("") }] : []),
    ...(from ? [{ label: `Desde ${from}`, onClear: () => setFrom("") }] : []),
    ...(to ? [{ label: `Hasta ${to}`, onClear: () => setTo("") }] : []),
    ...(q.trim() ? [{ label: `"${q.trim()}"`, onClear: () => setQ("") }] : []),
  ];

  return (
    <div className="space-y-4">
      {/* Summary cards del response */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="text-xl">📅</div>
          <div className="mt-1 font-display text-2xl font-black">{loading ? "…" : summary?.total ?? 0}</div>
          <div className="text-xs font-bold">Reservas (con filtros)</div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="text-xl">✅</div>
          <div className="mt-1 font-display text-2xl font-black text-teal-600">{loading ? "…" : fmtUsd(summary?.ingresosCompletadas ?? 0)}</div>
          <div className="text-xs font-bold">Ingresos completadas</div>
          <div className="text-[10px] text-muted-foreground">{loading ? "" : summary ? `${summary.porEstado.COMPLETADA ?? 0} reservas` : ""}</div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="text-xl">💎</div>
          <div className="mt-1 font-display text-2xl font-black text-primary">{loading ? "…" : fmtUsd(summary?.gmv ?? 0)}</div>
          <div className="text-xs font-bold">GMV (no canceladas)</div>
        </div>
        <div className="col-span-2 rounded-2xl border border-border/70 bg-card p-4 shadow-sm lg:col-span-1">
          <div className="text-xl">📊</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {loading && <span className="text-xs text-muted-foreground">…</span>}
            {Object.entries(summary?.porEstado ?? {}).map(([st, n]) => (
              <span key={st} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold">
                <BookingStatusBadge status={st} /> {n}
              </span>
            ))}
          </div>
        </div>
      </div>

      <FilterBar chips={chips} count={bookings.length} loading={loading} noun="reservas" onClear={clearFilters}>
        <SearchInput value={q} onChange={setQ} placeholder="Código, cliente, mascota o dirección…" className="w-full sm:w-60" />
        <FilterSelect value={city} onChange={setCity} placeholder="Todas las ciudades" options={cities.map((c) => ({ value: c, label: c }))} className="sm:w-40" />
        <FilterSelect value={category} onChange={setCategory} placeholder="Todas las categorías" options={CATEGORIES.map((c) => ({ value: c.key, label: `${c.emoji} ${c.label}` }))} className="sm:w-44" />
        <FilterSelect value={status} onChange={setStatus} placeholder="Todos los estados" options={Object.entries(BOOKING_STATUS).map(([v, m]) => ({ value: v, label: m.label }))} className="sm:w-44" />
        <FilterSelect value={providerId} onChange={setProviderId} placeholder="Todos los prestadores" options={providers.map((p) => ({ value: p.id, label: p.businessName }))} className="sm:w-48" />
        <div className="flex items-center gap-1.5">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Fecha desde" className="h-9 w-36 rounded-xl text-xs" />
          <span className="text-xs text-muted-foreground">→</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Fecha hasta" className="h-9 w-36 rounded-xl text-xs" />
        </div>
        <FilterSelect
          value={sort}
          onChange={setSort}
          placeholder="Más recientes"
          options={[
            { value: "date_desc", label: "Más recientes" },
            { value: "date_asc", label: "Más antiguas" },
            { value: "price_desc", label: "Mayor precio" },
          ]}
          className="sm:w-40"
        />
      </FilterBar>

      {loading ? (
        <LoadingBlock text="Cargando reservas…" />
      ) : bookings.length === 0 ? (
        <EmptyState emoji="📭" title="Sin reservas" desc="Ninguna reserva coincide con los filtros aplicados." />
      ) : (
        <>
          {/* Tabla (desktop) */}
          <div className="hidden overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm md:block">
            <div className="scroll-slim max-h-[560px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-secondary/80 backdrop-blur">
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Prestador</TableHead>
                    <TableHead>Servicio</TableHead>
                    <TableHead>Ciudad</TableHead>
                    <TableHead>Precio</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Pago</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookings.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs font-bold">{b.code}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{fmtDateTime(b.scheduledAt)}</TableCell>
                      <TableCell>
                        <div className="max-w-[130px] truncate text-sm font-bold">{b.client.name}</div>
                        {b.pet && <div className="text-[11px] text-muted-foreground">🐾 {b.pet.name}</div>}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-sm font-bold">{b.provider.businessName}</TableCell>
                      <TableCell className="max-w-[150px]">
                        <div className="truncate text-sm">{b.service.name}</div>
                        <div className={cn("text-[10px] font-bold", categoryMeta(b.service.category).iconColor)}>
                          {categoryMeta(b.service.category).emoji} {categoryMeta(b.service.category).label}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{b.provider.city}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="font-display text-sm font-black text-primary">{fmtUsd(b.priceUsd)}</div>
                        <div className="text-[10px] text-muted-foreground">{fmtBs(b.priceBs)}</div>
                      </TableCell>
                      <TableCell><BookingStatusBadge status={b.status} /></TableCell>
                      <TableCell>
                        {b.payment ? (
                          <div className="space-y-0.5">
                            <PaymentStatusBadge status={b.payment.status} />
                            <div className="text-[10px] uppercase text-muted-foreground">{b.payment.method.replace("_", " ")}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Cards (móvil) */}
          <div className="grid gap-2 md:hidden">
            {bookings.map((b) => (
              <div key={b.id} className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="font-mono text-xs font-bold text-muted-foreground">{b.code}</span>
                  <BookingStatusBadge status={b.status} />
                </div>
                <div className="mt-1.5 text-sm font-extrabold">
                  {b.client.name} <span className="text-xs font-normal text-muted-foreground">→ {b.provider.businessName}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {b.service.name} · 🐾 {b.pet?.name ?? "—"} · {b.provider.city}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">🗓️ {fmtDateTime(b.scheduledAt)} · 📍 {b.address}</div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-display text-sm font-black text-primary">{fmtUsd(b.priceUsd)}</span>
                    <span className="ml-1.5 text-[11px] text-muted-foreground">{fmtBs(b.priceBs)}</span>
                  </div>
                  {b.payment && <PaymentStatusBadge status={b.payment.status} />}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────════════ SECTORES ══════════────────────────────────

interface SectorRow {
  id: string; cityName: string; name: string; zone: string; lat: number | null; lng: number | null; active: boolean;
}

interface CityRow {
  id: string; name: string; state: string; lat: number; lng: number; active: boolean; providerCount: number;
}

const ZONE_CHIP = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300";
/** sentinel del dropdown: parroquia escrita a mano (ciudades sin catálogo oficial aún) */
const ZONA_OTRA = "__OTRA__";

const emptySectorForm = { cityName: "", name: "", zone: "", lat: "", lng: "" };

export function SectorsSection() {
  const { bumpData } = useAppStore();
  const [sectors, setSectors] = useState<SectorRow[]>([]);
  const [cities, setCities] = useState<CityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState("");
  const [zone, setZone] = useState("");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SectorRow | null>(null);
  const [form, setForm] = useState(emptySectorForm);
  const [customZone, setCustomZone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SectorRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        apiGet<{ sectors: SectorRow[] }>("/api/admin/sectors"),
        apiGet<{ cities: CityRow[] }>("/api/cities"),
      ]);
      setSectors(s.sectors);
      setCities(c.cities);
    } catch {
      toast.error("Error cargando sectores y ciudades");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sectors.filter((s) =>
      (!city || s.cityName === city) &&
      (!zone || s.zone === zone) &&
      (!needle || s.name.toLowerCase().includes(needle))
    );
  }, [sectors, city, zone, q]);

  /** parroquias presentes entre los sectores cargados (para el filtro) */
  const parroquiaOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of sectors) if (s.zone?.trim()) set.add(s.zone.trim());
    return [...set].sort((a, b) => a.localeCompare(b, "es")).map((z) => ({ value: z, label: `Pq. ${z}` }));
  }, [sectors]);

  // Agrupado por ciudad para el listado
  const grouped = useMemo(() => {
    const map = new Map<string, SectorRow[]>();
    for (const s of filtered) {
      const arr = map.get(s.cityName) ?? [];
      arr.push(s);
      map.set(s.cityName, arr);
    }
    return [...map.entries()];
  }, [filtered]);

  function openCreate(preCity?: string) {
    setEditing(null);
    setCustomZone(false);
    const cityName = preCity ?? city ?? "";
    const pq = parroquiasFor(cityName);
    setForm({ ...emptySectorForm, cityName, zone: pq[0] ?? "" });
    setDialogOpen(true);
  }

  function openEdit(s: SectorRow) {
    setEditing(s);
    const oficial = parroquiasFor(s.cityName).includes(s.zone);
    setCustomZone(Boolean(s.zone) && !oficial);
    setForm({ cityName: s.cityName, name: s.name, zone: s.zone, lat: s.lat === null ? "" : String(s.lat), lng: s.lng === null ? "" : String(s.lng) });
    setDialogOpen(true);
  }

  async function save() {
    if (form.name.trim().length < 2) return toast.error("El nombre debe tener al menos 2 caracteres");
    if (!editing && !form.cityName) return toast.error("Selecciona una ciudad");
    if (!form.zone.trim()) return toast.error("Selecciona o escribe la parroquia del sector");
    setSaving(true);
    try {
      if (editing) {
        await apiPatch(`/api/admin/sectors/${editing.id}`, {
          name: form.name.trim(),
          zone: form.zone.trim(),
          lat: form.lat.trim() === "" ? null : Number(form.lat),
          lng: form.lng.trim() === "" ? null : Number(form.lng),
        });
        toast.success(`Sector "${form.name.trim()}" actualizado ✅`);
      } else {
        await apiPost("/api/admin/sectors", {
          cityName: form.cityName,
          name: form.name.trim(),
          zone: form.zone.trim(),
          lat: form.lat.trim() === "" ? undefined : Number(form.lat),
          lng: form.lng.trim() === "" ? undefined : Number(form.lng),
        });
        toast.success(`Sector "${form.name.trim()}" creado en ${form.cityName} ✅`);
      }
      setDialogOpen(false);
      bumpData();
      await load();
    } catch (e) {
      toast.error(err(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s: SectorRow, v: boolean) {
    setBusyId(s.id);
    try {
      await apiPatch(`/api/admin/sectors/${s.id}`, { active: v });
      toast.success(v ? `"${s.name}" activado` : `"${s.name}" desactivado`);
      bumpData();
      await load();
    } catch (e) {
      toast.error(err(e));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/admin/sectors/${deleteTarget.id}`);
      toast.success(`Sector "${deleteTarget.name}" eliminado`);
      setDeleteTarget(null);
      bumpData();
      await load();
    } catch (e) {
      toast.error(err(e));
    } finally {
      setDeleting(false);
    }
  }

  const filtersActive = Boolean(city || zone || q.trim());
  function clearFilters() { setCity(""); setZone(""); setQ(""); }

  const chips = [
    ...(city ? [{ label: city, onClear: () => setCity("") }] : []),
    ...(zone ? [{ label: `Pq. ${zone}`, onClear: () => setZone("") }] : []),
    ...(q.trim() ? [{ label: `"${q.trim()}"`, onClear: () => setQ("") }] : []),
  ];

  const cityInfo = (name: string) => cities.find((c) => c.name === name);

  return (
    <div className="space-y-4">
      {/* Explicación */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-teal-500/30 bg-teal-50/60 p-4 dark:bg-teal-950/20">
        <MapPinned className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <strong className="text-foreground">¿Para qué sirven los sectores?</strong> Alimentan los <strong>filtros de sector del marketplace</strong> y las
          sugerencias de dirección al agendar. Puedes crearlos en cualquier ciudad del catálogo nacional (29 ciudades), pero tiene sentido
          priorizar donde ya hay prestadores: {cities.filter((c) => c.providerCount > 0).slice(0, 4).map((c) => c.name).join(", ")}.
        </p>
      </div>

      <FilterBar
        chips={chips}
        count={filtered.length}
        loading={loading}
        noun="sectores"
        onClear={clearFilters}
        extra={<Button size="sm" onClick={() => openCreate()} className="h-8 rounded-lg bg-primary px-3 text-[11px] font-bold"><Plus className="h-3.5 w-3.5" /> Nuevo sector</Button>}
      >
        <SearchInput value={q} onChange={setQ} placeholder="Buscar sector por nombre…" className="w-full sm:w-60" />
        <FilterSelect value={city} onChange={setCity} placeholder="Todas las ciudades" options={cities.map((c) => ({ value: c.name, label: `${c.name} (${c.providerCount})` }))} className="sm:w-52" />
        <FilterSelect value={zone} onChange={setZone} placeholder="Todas las parroquias" options={parroquiaOptions} className="sm:w-44" />
      </FilterBar>

      {loading ? (
        <LoadingBlock text="Cargando sectores…" />
      ) : grouped.length === 0 ? (
        <EmptyState
          emoji="🗺️"
          title="Sin sectores"
          desc="Ningún sector coincide con los filtros. Crea el primero con el botón «Nuevo sector»."
          action={<Button onClick={() => openCreate()} className="rounded-xl bg-primary font-bold"><Plus className="h-4 w-4" /> Nuevo sector</Button>}
        />
      ) : (
        <div className="scroll-slim max-h-[540px] space-y-4 overflow-y-auto pr-1">
          {grouped.map(([cityName, rows]) => {
            const info = cityInfo(cityName);
            return (
              <div key={cityName} className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
                <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-secondary/50 px-4 py-2.5">
                  <h4 className="font-display text-sm font-extrabold">📍 {cityName}</h4>
                  {info && <span className="text-[11px] text-muted-foreground">{info.state} · {rows.length} sectores · 🏪 {info.providerCount} prestadores</span>}
                  <Button size="sm" variant="ghost" onClick={() => openCreate(cityName)} className="ml-auto h-7 rounded-lg px-2.5 text-[11px] font-bold">
                    <Plus className="h-3 w-3" /> Añadir aquí
                  </Button>
                </div>
                <div className="divide-y divide-border/60">
                  {rows.map((s) => (
                    <div key={s.id} className={cn("flex flex-wrap items-center gap-2.5 px-4 py-2.5", !s.active && "opacity-55")}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-extrabold">{s.name}</span>
                          {s.zone && <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide", ZONE_CHIP)}>Pq. {s.zone}</span>}
                          {!s.active && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">INACTIVO</span>}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {s.lat !== null && s.lng !== null ? `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}` : "sin coordenadas (centro de ciudad por defecto)"}
                        </div>
                      </div>
                      <Switch checked={s.active} disabled={busyId === s.id} onCheckedChange={(v) => toggleActive(s, v)} aria-label={`Sector ${s.active ? "activo" : "inactivo"}`} />
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEdit(s)} className="h-8 rounded-lg px-2"><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(s)} className="h-8 rounded-lg px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog crear/editar sector */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar sector" : "Nuevo sector"}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Editando "${editing.name}" en ${editing.cityName}. La ciudad no puede cambiarse.`
                : "Los sectores alimentan los filtros de sector del marketplace y las direcciones de las reservas."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div>
              <Label className="text-xs font-bold">Ciudad</Label>
              {editing ? (
                <div className="mt-1 rounded-xl bg-secondary/60 px-3 py-2 text-sm font-bold">📍 {editing.cityName}</div>
              ) : (
                <Select value={form.cityName || undefined} onValueChange={(v) => setForm({ ...form, cityName: v, zone: parroquiasFor(v)[0] ?? "" })}>
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="Selecciona la ciudad…" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {cities.map((c) => (
                      <SelectItem key={c.id} value={c.name} className="text-xs">
                        {c.name} — {c.state} {c.providerCount > 0 ? `(${c.providerCount} prestadores)` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label className="text-xs font-bold">Nombre del sector</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Villa Alias" className="mt-1 rounded-xl" maxLength={60} />
            </div>
            <div>
              <Label className="text-xs font-bold">Parroquia donde queda el sector</Label>
              {!customZone ? (
                <Select
                  value={form.zone || undefined}
                  onValueChange={(v) => {
                    if (v === ZONA_OTRA) {
                      setCustomZone(true);
                      setForm({ ...form, zone: "" });
                    } else {
                      setCustomZone(false);
                      setForm({ ...form, zone: v });
                    }
                  }}
                >
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="Selecciona la parroquia…" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {parroquiasFor(form.cityName).map((z) => (
                      <SelectItem key={z} value={z} className="text-xs">{z}</SelectItem>
                    ))}
                    <SelectItem value={ZONA_OTRA} className="text-xs">✏️ Otra (escribir a mano)</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="mt-1 flex gap-2">
                  <Input
                    value={form.zone}
                    onChange={(e) => setForm({ ...form, zone: e.target.value })}
                    placeholder="Ej: Libertad"
                    className="rounded-xl"
                    maxLength={60}
                  />
                  <Button type="button" variant="outline" onClick={() => { setCustomZone(false); setForm({ ...form, zone: parroquiasFor(form.cityName)[0] ?? "" }); }} className="shrink-0 rounded-xl font-bold">
                    Catálogo
                  </Button>
                </div>
              )}
              {form.cityName && parroquiasFor(form.cityName).length > 0 && !customZone && (
                <p className="mt-1 text-[11px] text-muted-foreground">Parroquias oficiales de {form.cityName}. Si tu sector pertenece a otra, usa «Otra».</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold">Latitud (opcional)</Label>
                <Input type="number" step="0.0001" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="8.2735" className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-xs font-bold">Longitud (opcional)</Label>
                <Input type="number" step="0.0001" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="-62.7245" className="mt-1 rounded-xl" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">💡 Sin coordenadas, el sector se ubica en el centro de la ciudad para la búsqueda por cercanía.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl font-bold">Cancelar</Button>
            <Button onClick={save} disabled={saving} className="rounded-xl bg-primary font-bold">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editing ? "Guardar cambios" : "Crear sector"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminación */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar sector?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> ({deleteTarget?.cityName}) se eliminará permanentemente y dejará de
              aparecer en los filtros del marketplace. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting} className="bg-rose-600 font-bold text-white hover:bg-rose-700">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────════════ FIRULAIS IA ══════════────────────────────────

interface FirulaisEntry {
  id: string; question: string; answer: string; keywords: string; active: boolean; hits: number; createdAt: string; updatedAt: string;
}

interface FirulaisLogRow { id: string; question: string; matched: boolean; createdAt: string }

const emptyFirulaisForm = { question: "", answer: "", keywords: "", active: true };

export function FirulaisSection() {
  const { bumpData } = useAppStore();
  const [entries, setEntries] = useState<FirulaisEntry[]>([]);
  const [logs, setLogs] = useState<FirulaisLogRow[]>([]);
  const [logStats, setLogStats] = useState<{ total: number; unmatched: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"entradas" | "logs">("entradas");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FirulaisEntry | null>(null);
  const [form, setForm] = useState(emptyFirulaisForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FirulaisEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Simulador
  const [testQ, setTestQ] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ matched: boolean; answer?: string; score?: number; message?: string; question?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, l] = await Promise.all([
        apiGet<{ entries: FirulaisEntry[] }>("/api/admin/firulais"),
        apiGet<{ logs: FirulaisLogRow[]; stats: { total: number; unmatched: number } }>("/api/admin/firulais/logs?onlyUnmatched=1"),
      ]);
      setEntries(e.entries);
      setLogs(l.logs);
      setLogStats(l.stats);
    } catch {
      toast.error("Error cargando entradas de Firulais");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const needle = q.trim().toLowerCase();
  const filteredEntries = useMemo(
    () => entries.filter((e) => !needle || e.question.toLowerCase().includes(needle) || e.answer.toLowerCase().includes(needle) || e.keywords.toLowerCase().includes(needle)),
    [entries, needle]
  );

  // Preguntas sin matchear en los últimos 7 días (logs vienen ordenados por fecha desc)
  const WEEK_MS = 7 * 24 * 3600 * 1000;
  const unmatched7d = useMemo(() => logs.filter((l) => Date.now() - new Date(l.createdAt).getTime() < WEEK_MS), [logs]);
  const activeEntries = entries.filter((e) => e.active).length;
  const totalHits = entries.reduce((acc, e) => acc + e.hits, 0);

  function openCreate(prefillQuestion?: string) {
    setEditing(null);
    setForm({ ...emptyFirulaisForm, question: prefillQuestion ?? "" });
    setDialogOpen(true);
  }

  function openEdit(e: FirulaisEntry) {
    setEditing(e);
    setForm({ question: e.question, answer: e.answer, keywords: e.keywords, active: e.active });
    setDialogOpen(true);
  }

  async function save() {
    if (form.question.trim().length < 4) return toast.error("La pregunta debe tener al menos 4 caracteres");
    if (form.answer.trim().length < 4) return toast.error("La respuesta debe tener al menos 4 caracteres");
    setSaving(true);
    try {
      if (editing) {
        await apiPatch(`/api/admin/firulais/${editing.id}`, {
          question: form.question.trim(),
          answer: form.answer.trim(),
          keywords: Array.from(new Set(form.keywords.split(",").map((k) => k.trim()).filter(Boolean))).join(","),
          active: form.active,
        });
        toast.success("Entrada actualizada ✅");
      } else {
        await apiPost("/api/admin/firulais", {
          question: form.question.trim(),
          answer: form.answer.trim(),
          keywords: Array.from(new Set(form.keywords.split(",").map((k) => k.trim()).filter(Boolean))).join(","),
          active: form.active,
        });
        toast.success("Entrada creada: Firulais ya puede responder esto 🐕");
      }
      setDialogOpen(false);
      bumpData();
      await load();
    } catch (e) {
      toast.error(err(e)); // 409 duplicado, validaciones…
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(e: FirulaisEntry, v: boolean) {
    setBusyId(e.id);
    try {
      await apiPatch(`/api/admin/firulais/${e.id}`, { active: v });
      toast.success(v ? "Entrada activada" : "Entrada desactivada (Firulais dejará de usarla)");
      bumpData();
      await load();
    } catch (err2) {
      toast.error(err(err2));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/admin/firulais/${deleteTarget.id}`);
      toast.success("Entrada eliminada");
      setDeleteTarget(null);
      bumpData();
      await load();
    } catch (e) {
      toast.error(err(e));
    } finally {
      setDeleting(false);
    }
  }

  async function runTest() {
    if (testQ.trim().length < 2) return toast.error("Escribe una pregunta de prueba");
    setTesting(true);
    setTestResult(null);
    try {
      const d = await apiPost<{ matched: boolean; answer?: string; score?: number; message?: string; question?: string }>("/api/admin/firulais/test", { question: testQ.trim() });
      setTestResult(d);
    } catch (e) {
      toast.error(err(e));
    } finally {
      setTesting(false);
    }
  }

  const filtersActive = Boolean(q.trim());

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="text-xl">🐕</div>
          <div className="mt-1 font-display text-2xl font-black text-primary">{loading ? "…" : activeEntries}</div>
          <div className="text-xs font-bold">Entradas activas</div>
          <div className="text-[10px] text-muted-foreground">de {entries.length} totales</div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="text-xl">🎯</div>
          <div className="mt-1 font-display text-2xl font-black text-emerald-600">{loading ? "…" : totalHits}</div>
          <div className="text-xs font-bold">Hits totales</div>
          <div className="text-[10px] text-muted-foreground">respuestas servidas desde la KB</div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="text-xl">❓</div>
          <div className="mt-1 font-display text-2xl font-black text-amber-600">{loading ? "…" : unmatched7d.length}</div>
          <div className="text-xs font-bold">Sin matchear (7 días)</div>
          <div className="text-[10px] text-muted-foreground">candidatas a entrenar</div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="text-xl">📚</div>
          <div className="mt-1 font-display text-2xl font-black">{loading ? "…" : logStats?.total ?? 0}</div>
          <div className="text-xs font-bold">Preguntas logueadas</div>
          <div className="text-[10px] text-muted-foreground">{logStats?.unmatched ?? 0} sin match histórico</div>
        </div>
      </div>

      {/* Simulador */}
      <SectionCard
        title="Simulador de respuestas"
        desc="Así responde Firulais antes de usar IA genérica: si la pregunta matchea una entrada, se sirve la respuesta entrenada (sin gastar tokens)."
        icon={<FlaskConical className="h-4 w-4 text-violet-600" />}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Textarea
            value={testQ}
            onChange={(e) => setTestQ(e.target.value)}
            placeholder='Ej: "¿cómo pago mi reserva?", "¿hacen delivery en El Roble?"'
            className="min-h-16 flex-1 rounded-xl"
          />
          <Button onClick={runTest} disabled={testing} className="rounded-xl bg-violet-600 font-bold hover:bg-violet-700 sm:self-start">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Dog className="h-4 w-4" />} Probar
          </Button>
        </div>
        {testResult && (
          <div className={cn(
            "mt-3 rounded-xl border-2 p-3.5",
            testResult.matched
              ? "border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-950/25"
              : "border-rose-500/40 bg-rose-50/70 dark:bg-rose-950/25"
          )}>
            <div className="flex flex-wrap items-center gap-2 text-xs font-black">
              {testResult.matched ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-black text-white">✅ MATCHEÓ</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-2.5 py-0.5 text-[10px] font-black text-white">❌ SIN MATCH</span>
              )}
              {testResult.matched && testResult.score !== undefined && (
                <span className="text-muted-foreground">score {testResult.score.toFixed(2)} (umbral 1.20)</span>
              )}
            </div>
            {testResult.matched ? (
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{testResult.answer}</p>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{testResult.message ?? "La pregunta iría al fallback (LLM) y quedaría registrada en los logs sin match."}</p>
            )}
          </div>
        )}
      </SectionCard>

      {/* Entradas / logs */}
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-secondary/50 px-4 py-3">
          <div className="flex rounded-xl bg-background p-1">
            <button type="button" onClick={() => setTab("entradas")} className={cn("rounded-lg px-3 py-1.5 text-xs font-black transition-colors", tab === "entradas" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              Entradas ({entries.length})
            </button>
            <button type="button" onClick={() => setTab("logs")} className={cn("rounded-lg px-3 py-1.5 text-xs font-black transition-colors", tab === "logs" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              ❓ Sin matchear ({logStats?.unmatched ?? 0})
            </button>
          </div>
          {tab === "entradas" && (
            <div className="ml-auto flex items-center gap-2">
              <SearchInput value={q} onChange={setQ} placeholder="Buscar en entradas…" className="w-44 sm:w-60" />
              <Button size="sm" onClick={() => openCreate()} className="h-9 rounded-xl bg-primary px-3 text-xs font-bold"><Plus className="h-4 w-4" /> Nueva entrada</Button>
            </div>
          )}
        </div>

        <div className="p-3 sm:p-4">
          {loading ? (
            <LoadingBlock text="Cargando Firulais…" />
          ) : tab === "entradas" ? (
            filteredEntries.length === 0 ? (
              <EmptyState emoji="🐾" title="Sin entradas" desc={filtersActive ? "Ninguna entrada coincide con la búsqueda." : "Crea la primera entrada de la base de conocimiento de Firulais."} />
            ) : (
              <div className="scroll-slim max-h-[460px] space-y-2 overflow-y-auto pr-1">
                {filteredEntries.map((e) => (
                  <div key={e.id} className={cn("rounded-2xl border border-border/60 bg-card p-3.5", !e.active && "opacity-60")}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-extrabold">❓ {e.question}</span>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">🎯 {e.hits} hits</span>
                          {!e.active && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">INACTIVA</span>}
                        </div>
                        <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground line-clamp-3">{e.answer}</p>
                        {e.keywords && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {Array.from(new Set(e.keywords.split(",").map((k) => k.trim()).filter(Boolean))).map((k) => (
                              <span key={k} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-secondary-foreground">🏷️ {k}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={e.active} disabled={busyId === e.id} onCheckedChange={(v) => toggleActive(e, v)} aria-label={`Entrada ${e.active ? "activa" : "inactiva"}`} />
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => openEdit(e)} className="h-8 rounded-lg px-2"><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(e)} className="h-8 rounded-lg px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : logs.length === 0 ? (
            <EmptyState emoji="🎉" title="¡Cero preguntas sin responder!" desc="Firulais matcheó todas las preguntas recientes. Vuelve cuando haya logs nuevos." />
          ) : (
            <div className="scroll-slim max-h-[460px] overflow-y-auto pr-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pregunta (sin match)</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="max-w-[340px] truncate text-sm font-bold">❓ {l.question}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmtRelative(l.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openCreate(l.question)} className="h-8 rounded-lg px-2.5 text-[11px] font-bold">
                          <Plus className="h-3.5 w-3.5" /> Crear entrada
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Dialog crear/editar entrada */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="scroll-slim max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Dog className="h-5 w-5" /> {editing ? "Editar entrada" : "Nueva entrada de Firulais"}</DialogTitle>
            <DialogDescription>
              Estas respuestas entrenadas se sirven ANTES del fallback con IA genérica: más rápidas, gratuitas y consistentes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div>
              <Label className="text-xs font-bold">Pregunta (cómo preguntaría el usuario)</Label>
              <Input value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="Ej: ¿Cómo pago mi reserva?" className="mt-1 rounded-xl" maxLength={200} />
            </div>
            <div>
              <Label className="text-xs font-bold">Respuesta de Firulais</Label>
              <Textarea value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} placeholder="Escribe la respuesta clara y útil…" className="mt-1 min-h-28 rounded-xl" maxLength={1500} />
            </div>
            <div>
              <Label className="text-xs font-bold">Keywords (separadas por coma)</Label>
              <Input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="pago, pagar, metodos, zelle, pago movil" className="mt-1 rounded-xl" />
              <p className="mt-1 text-[11px] text-muted-foreground">Se normalizan (minúsculas, sin acentos). Mejoran el matching con preguntas cortas.</p>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-secondary/50 px-3.5 py-2.5">
              <div className="text-sm font-bold">Entrada activa</div>
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} aria-label="Entrada activa" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl font-bold">Cancelar</Button>
            <Button onClick={save} disabled={saving} className="rounded-xl bg-primary font-bold">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Dog className="h-4 w-4" />}
              {editing ? "Guardar cambios" : "Crear entrada"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminación */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar entrada?</AlertDialogTitle>
            <AlertDialogDescription>
              Firulais dejará de responder <strong>«{deleteTarget?.question}»</strong> y esas preguntas irán al fallback con IA genérica.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting} className="bg-rose-600 font-bold text-white hover:bg-rose-700">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
