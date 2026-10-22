"use client";

/**
 * PetService VE — Piezas de UI del área de cliente (perfil de mascotas).
 *
 * Helpers puros + componentes presentacionales consumidos por ClientAreaView.
 * El estado vive en el padre (useState local); aquí no se toca el store.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Cake, Loader2, Pencil, Trash2, Weight, Stethoscope, type LucideIcon } from "lucide-react";
import { apiPost, apiPatch } from "@/lib/petservice/api";
import { PET_SIZES } from "@/lib/petservice/constants";
import { PhotoPicker } from "@/components/petservice/shared";

// ───────────────────────── Contrato de mascota (GET/POST/PATCH /api/pets) ─────────────────────────

export interface PetFull {
  id: string;
  name: string;
  species: string; // PERRO | GATO | AVE | ROEDOR | OTRO
  breed: string | null;
  size: string; // S | M | L
  notes: string | null;
  birthDate: string | null; // ISO → "YYYY-MM-DD"
  weightKg: number | null;
  gender: string | null; // MACHO | HEMBRA | N/D | null
  photoUrl?: string | null; // foto de la mascota (data URL)
  medicalNotes?: string | null; // historial médico / de atención
}

// ───────────────────────── Metadatos de especie ─────────────────────────

export const SPECIES_META: Record<string, { emoji: string; label: string }> = {
  PERRO: { emoji: "🐶", label: "Perro" },
  GATO: { emoji: "🐱", label: "Gato" },
  AVE: { emoji: "🐦", label: "Ave" },
  ROEDOR: { emoji: "🐹", label: "Roedor" },
  OTRO: { emoji: "🐾", label: "Otro" },
};

export const SPECIES_KEYS = Object.keys(SPECIES_META);

export function petEmoji(species: string): string {
  return SPECIES_META[species]?.emoji ?? "🐾";
}

export function speciesLabel(species: string): string {
  return SPECIES_META[species]?.label ?? "Otro";
}

// ───────────────────────── Helpers de formato ─────────────────────────

/** "2 años, 3 meses" · "5 meses" · "3 semanas" · null → "Edad sin registrar" (lo resuelve el llamador) */
export function petAgeLabel(birthDate: string | null): string | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  if (b.getTime() > now.getTime()) return null; // por si acaso: no hay edades futuras
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  if (now.getDate() < b.getDate()) months -= 1;
  if (months < 0) months = 0;

  if (months === 0) {
    const days = Math.max(0, Math.floor((now.getTime() - b.getTime()) / 86_400_000));
    if (days < 7) return days <= 1 ? "Recién llegada 🍼" : `${days} días`;
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "1 semana" : `${weeks} semanas`;
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(years === 1 ? "1 año" : `${years} años`);
  if (rest > 0) parts.push(rest === 1 ? "1 mes" : `${rest} meses`);
  return parts.join(", ") || null;
}

/** "4,5 kg" (es-VE) */
export function fmtWeightKg(kg: number): string {
  return `${new Intl.NumberFormat("es-VE", { maximumFractionDigits: 1 }).format(kg)} kg`;
}

/** hoy "YYYY-MM-DD" en zona local (para max del input date) */
export function todayLocalStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Chip ♂/♀; null si no aplica (N/D o sin registrar) */
export function genderChip(gender: string | null): { label: string; cls: string } | null {
  if (gender === "MACHO") return { label: "♂ Macho", cls: "bg-secondary text-secondary-foreground" };
  if (gender === "HEMBRA") return { label: "♀ Hembra", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" };
  return null;
}

/** DELETE /api/... — helper local (api.ts es compartido y no expone DELETE) */
async function apiDelete(url: string): Promise<void> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `DELETE ${url} → ${res.status}`);
  }
}

// ───────────────────────── Tarjeta KPI ─────────────────────────

export function StatCard({ icon, emoji, label, value, sub, className }: {
  icon?: LucideIcon;
  emoji?: string;
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  const Icon = icon;
  return (
    <div className={cn("rounded-2xl border border-border/70 bg-card p-4 shadow-sm", className)}>
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {Icon ? <Icon className="h-4 w-4 text-primary" aria-hidden /> : emoji ? <span aria-hidden>{emoji}</span> : null}
        {label}
      </div>
      <div className="mt-1 truncate font-display text-xl font-black leading-snug">{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ───────────────────────── Tarjeta de mascota ─────────────────────────

export function PetCard({ pet, onEdit, onDeleted }: {
  pet: PetFull;
  onEdit: (p: PetFull) => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const age = petAgeLabel(pet.birthDate);
  const g = genderChip(pet.gender);

  async function remove() {
    setBusy(true);
    try {
      await apiDelete(`/api/pets/${pet.id}`);
      toast.success(`${pet.name} salió de tu lista 🐾`);
      setConfirmOpen(false);
      onDeleted(pet.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar la mascota");
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="flex flex-col rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-warm">
      {/* Cabecera: emoji + nombre + especie/raza + tamaño */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {pet.photoUrl ? (
            <img src={pet.photoUrl} alt={`Foto de ${pet.name}`} className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
          ) : (
            <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-secondary text-3xl">
              {petEmoji(pet.species)}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="truncate font-display text-base font-extrabold leading-tight">{pet.name}</h3>
            <p className="truncate text-xs text-muted-foreground">
              {speciesLabel(pet.species)}{pet.breed ? ` · ${pet.breed}` : ""}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-black text-secondary-foreground" title={`Tamaño ${pet.size}`}>
          {pet.size} · {PET_SIZES[pet.size] ?? pet.size}
        </span>
      </div>

      {/* Edad + peso */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-secondary/60 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Edad</div>
          <div className="mt-0.5 flex items-center gap-1.5 font-bold">
            <Cake className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{age ?? "Edad sin registrar"}</span>
          </div>
        </div>
        <div className="rounded-xl bg-secondary/60 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Peso</div>
          <div className="mt-0.5 flex items-center gap-1.5 font-bold">
            <Weight className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{pet.weightKg !== null && pet.weightKg !== undefined ? fmtWeightKg(pet.weightKg) : "Sin registrar"}</span>
          </div>
        </div>
      </div>

      {/* Chips: género */}
      {g && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", g.cls)}>{g.label}</span>
        </div>
      )}

      {/* Notas */}
      {pet.notes && (
        <p className="mt-2 line-clamp-2 text-xs italic leading-relaxed text-muted-foreground">📝 {pet.notes}</p>
      )}

      {/* Notas médicas / historial de atención */}
      {pet.medicalNotes && (
        <div className="mt-2 rounded-xl bg-teal-50 px-3 py-2 text-xs leading-relaxed text-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
          <span className="flex items-center gap-1 font-bold"><Stethoscope className="h-3.5 w-3.5 shrink-0" aria-hidden /> Ficha médica</span>
          <p className="mt-0.5 whitespace-pre-line">{pet.medicalNotes}</p>
        </div>
      )}

      {/* Acciones */}
      <div className="mt-auto flex gap-2 border-t border-dashed border-border/70 pt-3 [&>div]:flex-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onEdit(pet)}
          className="h-9 flex-1 rounded-lg text-xs font-bold"
          aria-label={`Editar a ${pet.name}`}
        >
          <Pencil className="h-3.5 w-3.5" /> Editar
        </Button>
        <AlertDialog open={confirmOpen} onOpenChange={(v) => !busy && setConfirmOpen(v)}>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 flex-1 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/60 dark:hover:text-rose-300"
              aria-label={`Eliminar a ${pet.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" /> Eliminar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display">¿Eliminar a {pet.name}? 🥺</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. {pet.name} desaparecerá de tu lista de mascotas
                (si tiene reservas en el historial, el sistema protegerá sus datos).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy} className="rounded-xl font-bold">Mejor no</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault(); // el diálogo se cierra al terminar la petición
                  remove();
                }}
                className="rounded-xl bg-rose-600 font-bold hover:bg-rose-700"
              >
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Eliminando…</> : "Sí, eliminar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </article>
  );
}

// ───────────────────────── Dialog crear/editar mascota ─────────────────────────

interface PetFormState {
  name: string;
  species: string;
  size: string;
  breed: string;
  birthDate: string;
  weightKg: string;
  gender: string; // "" | MACHO | HEMBRA | ND (Radix Select no acepta value="")
  notes: string;
  medicalNotes: string;
  photoUrl: string | null;
}

const EMPTY_FORM: PetFormState = { name: "", species: "PERRO", size: "S", breed: "", birthDate: "", weightKg: "", gender: "ND", notes: "", medicalNotes: "", photoUrl: null };

export function PetFormDialog({ open, pet, onClose, onSaved }: {
  open: boolean;
  pet: PetFull | null; // null → crear
  onClose: () => void;
  onSaved: (p: PetFull) => void;
}) {
  const isEdit = !!pet;
  const [form, setForm] = useState<PetFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset del formulario cada vez que se abre (crear vs editar)
  useEffect(() => {
    if (!open) return;
    setApiErr(null);
    setErrors({});
    setBusy(false);
    setForm(
      pet
        ? {
            name: pet.name,
            species: SPECIES_META[pet.species] ? pet.species : "OTRO",
            size: ["S", "M", "L"].includes(pet.size) ? pet.size : "M",
            breed: pet.breed ?? "",
            birthDate: pet.birthDate ? pet.birthDate.slice(0, 10) : "",
            weightKg: pet.weightKg !== null && pet.weightKg !== undefined ? String(pet.weightKg) : "",
            gender: pet.gender === "MACHO" || pet.gender === "HEMBRA" ? pet.gender : "ND",
            notes: pet.notes ?? "",
            medicalNotes: pet.medicalNotes ?? "",
            photoUrl: pet.photoUrl ?? null,
          }
        : EMPTY_FORM
    );
  }, [open, pet]);

  function setField(k: keyof PetFormState, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));
    setApiErr(null);
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = "Cuéntanos cómo se llama (mínimo 2 letras)";
    if (!SPECIES_META[form.species]) errs.species = "Elige una especie";
    if (!["S", "M", "L"].includes(form.size)) errs.size = "Elige un tamaño";
    if (form.birthDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.birthDate)) errs.birthDate = "Fecha inválida";
      else if (form.birthDate > todayLocalStr()) errs.birthDate = "La fecha de nacimiento no puede ser futura";
    }
    if (form.weightKg !== "") {
      const w = Number(form.weightKg.replace(",", "."));
      if (!Number.isFinite(w) || w < 0 || w > 120) errs.weightKg = "El peso debe estar entre 0 y 120 kg";
    }
    if (form.notes.length > 500) errs.notes = "Máximo 500 caracteres";
    if (form.medicalNotes.length > 1000) errs.medicalNotes = "Máximo 1000 caracteres";
    setErrors(errs);
    return Object.values(errs).every((v) => !v);
  }

  async function submit() {
    if (!validate()) return;
    setBusy(true);
    setApiErr(null);
    const payload = {
      name: form.name.trim(),
      species: form.species,
      size: form.size,
      breed: form.breed.trim(),
      birthDate: form.birthDate,
      weightKg: form.weightKg === "" ? "" : String(Number(form.weightKg.replace(",", "."))),
      gender: form.gender === "ND" ? "" : form.gender,
      notes: form.notes.trim(),
      medicalNotes: form.medicalNotes.trim(),
      photoUrl: form.photoUrl,
    };
    try {
      const saved = pet
        ? (await apiPatch<{ pet: PetFull }>(`/api/pets/${pet.id}`, payload)).pet
        : (await apiPost<{ pet: PetFull }>("/api/pets", payload)).pet;
      toast.success(isEdit ? `¡Datos de ${saved.name} actualizados! 🐾` : `¡${saved.name} ya está en tu lista! 🐾`);
      onSaved(saved);
    } catch (e) {
      setApiErr(e instanceof Error ? e.message : "No se pudo guardar. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  const errTxt = (k: string) =>
    errors[k] ? (
      <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors[k]}</p>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="max-h-[92svh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display font-black">
            {isEdit ? `Editar a ${pet?.name} ✏️` : "Nueva mascota 🐾"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Actualiza su ficha: así el prestador llega preparado."
              : "Registra su ficha para reservar servicios a domicilio."}
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="grid grid-cols-2 gap-3"
        >
          <div className="col-span-2">
            <Label htmlFor="pet-name" className="text-xs font-bold">Nombre *</Label>
            <Input
              id="pet-name"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Ej: Simón"
              maxLength={40}
              className="mt-1 h-11 rounded-xl"
              aria-invalid={!!errors.name}
            />
            {errTxt("name")}
          </div>

          <div>
            <Label htmlFor="pet-species" className="text-xs font-bold">Especie *</Label>
            <Select value={form.species} onValueChange={(v) => setField("species", v)}>
              <SelectTrigger id="pet-species" className="mt-1 h-11 rounded-xl" aria-invalid={!!errors.species}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SPECIES_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {SPECIES_META[k].emoji} {SPECIES_META[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errTxt("species")}
          </div>

          <div>
            <Label htmlFor="pet-size" className="text-xs font-bold">Tamaño *</Label>
            <Select value={form.size} onValueChange={(v) => setField("size", v)}>
              <SelectTrigger id="pet-size" className="mt-1 h-11 rounded-xl" aria-invalid={!!errors.size}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="S">Pequeño (S)</SelectItem>
                <SelectItem value="M">Mediano (M)</SelectItem>
                <SelectItem value="L">Grande (L)</SelectItem>
              </SelectContent>
            </Select>
            {errTxt("size")}
          </div>

          <div>
            <Label htmlFor="pet-breed" className="text-xs font-bold">Raza</Label>
            <Input
              id="pet-breed"
              value={form.breed}
              onChange={(e) => setField("breed", e.target.value)}
              placeholder="Ej: Mestizo"
              maxLength={40}
              className="mt-1 h-11 rounded-xl"
            />
          </div>

          <div>
            <Label htmlFor="pet-birth" className="text-xs font-bold">Nacimiento</Label>
            <Input
              id="pet-birth"
              type="date"
              value={form.birthDate}
              max={todayLocalStr()}
              onChange={(e) => setField("birthDate", e.target.value)}
              className="mt-1 h-11 rounded-xl"
              aria-invalid={!!errors.birthDate}
            />
            {errTxt("birthDate")}
            {!errors.birthDate && <p className="mt-1 text-[11px] text-muted-foreground">¿No la sabes? Déjala vacía</p>}
          </div>

          <div>
            <Label htmlFor="pet-weight" className="text-xs font-bold">Peso (kg)</Label>
            <Input
              id="pet-weight"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              max={120}
              value={form.weightKg}
              onChange={(e) => setField("weightKg", e.target.value)}
              placeholder="Ej: 4.5"
              className="mt-1 h-11 rounded-xl"
              aria-invalid={!!errors.weightKg}
            />
            {errTxt("weightKg")}
          </div>

          <div>
            <Label htmlFor="pet-gender" className="text-xs font-bold">Sexo</Label>
            <Select value={form.gender} onValueChange={(v) => setField("gender", v)}>
              <SelectTrigger id="pet-gender" className="mt-1 h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MACHO">♂ Macho</SelectItem>
                <SelectItem value="HEMBRA">♀ Hembra</SelectItem>
                <SelectItem value="ND">Sin especificar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2">
            <Label className="text-xs font-bold">Foto de {isEdit ? pet?.name : "tu mascota"}</Label>
            <div className="mt-1.5">
              <PhotoPicker
                value={form.photoUrl}
                name={form.name || "Mascota"}
                onChange={(v) => setForm((f) => ({ ...f, photoUrl: v }))}
              />
            </div>
          </div>

          <div className="col-span-2">
            <Label htmlFor="pet-notes" className="text-xs font-bold">Notas para el prestador</Label>
            <Textarea
              id="pet-notes"
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Ej: Nervioso con secadores, usar toalla"
              className="mt-1 rounded-2xl"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{form.notes.length}/500 caracteres</p>
          </div>

          <div className="col-span-2 rounded-xl border border-teal-500/30 bg-teal-50/50 p-3 dark:bg-teal-950/20">
            <Label htmlFor="pet-medical" className="flex items-center gap-1.5 text-xs font-bold"><Stethoscope className="h-3.5 w-3.5" aria-hidden /> Ficha médica e historial de atención</Label>
            <Textarea
              id="pet-medical"
              value={form.medicalNotes}
              onChange={(e) => setField("medicalNotes", e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Vacunas, alergias, medicamentos, tratamientos, cirugías, veterinario de cabecera…"
              className="mt-1 rounded-2xl"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Opcional · {form.medicalNotes.length}/1000 caracteres — solo la ves tú y quien atiende a tu mascota.</p>
          </div>

          {apiErr && (
            <p role="alert" className="col-span-2 rounded-xl bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
              ⚠️ {apiErr}
            </p>
          )}

          <div className="col-span-2 mt-1 flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy} className="h-11 flex-1 rounded-xl font-bold">
              Cancelar
            </Button>
            <Button type="submit" disabled={busy} className="h-11 flex-[2] rounded-xl bg-primary font-bold shadow-warm">
              {busy ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>
              ) : isEdit ? (
                "Guardar cambios"
              ) : (
                "Registrar mascota"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
