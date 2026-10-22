"use client";

import { useRef, useState } from "react";
import { PawPrint, Scissors, Truck, House, Footprints, GraduationCap, CarTaxiFront, Sparkles, Stethoscope, MapPin, BadgeCheck, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { categoryMeta, BOOKING_STATUS, PAYMENT_STATUS, PROVIDER_STATUS, NOTIF_STATUS } from "@/lib/petservice/constants";
import { fmtUsd, fmtBs } from "@/lib/petservice/format";
import { toast } from "sonner";

// ───────────────────────── Iconos de categoría ─────────────────────────

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const cls = cn("h-5 w-5", className);
  switch (category) {
    case "GROOMING": return <Scissors className={cls} />;
    case "DELIVERY": return <Truck className={cls} />;
    case "PET_SITTING": return <House className={cls} />;
    case "DOG_WALKING": return <Footprints className={cls} />;
    case "TRAINING": return <GraduationCap className={cls} />;
    case "PET_TAXI": return <CarTaxiFront className={cls} />;
    case "SPA_MOVIL": return <Sparkles className={cls} />;
    case "VET": return <Stethoscope className={cls} />;
    default: return <PawPrint className={cls} />;
  }
}

// ───────────────────────── Estrellas ─────────────────────────

export function RatingStars({ value, count, size = "sm", className }: {
  value: number; count?: number; size?: "xs" | "sm" | "md"; className?: string;
}) {
  const h = size === "xs" ? "h-3 w-3" : size === "md" ? "h-5 w-5" : "h-4 w-4";
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="inline-flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={cn(h, i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "fill-zinc-200 text-zinc-200 dark:fill-zinc-700 dark:text-zinc-700")}
          />
        ))}
      </span>
      <span className={cn("font-semibold", size === "xs" ? "text-xs" : "text-sm")}>{value.toFixed(1)}</span>
      {count !== undefined && count > 0 && <span className="text-xs text-muted-foreground">({count})</span>}
      {count === 0 && value > 0 && (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground" title="Calificación de la ficha pública en Google Maps, no de reservas en la plataforma">
          Google Maps
        </span>
      )}
    </span>
  );
}

// ───────────────────────── Precio dual USD/Bs ─────────────────────────

export function PriceTag({ usd, rate, size = "md", className }: {
  usd: number; rate: number; size?: "sm" | "md" | "lg"; className?: string;
}) {
  const bs = usd * rate;
  return (
    <span className={cn("inline-flex flex-col leading-tight", className)}>
      <span className={cn("font-extrabold text-primary font-display", size === "sm" ? "text-sm" : size === "lg" ? "text-2xl" : "text-base")}>
        {fmtUsd(usd)}
      </span>
      <span className={cn("text-muted-foreground", size === "sm" ? "text-[10px]" : "text-xs")}>
        ≈ {fmtBs(bs)}
      </span>
    </span>
  );
}

// ───────────────────────── Badges de estado ─────────────────────────

export function BookingStatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = BOOKING_STATUS[status] ?? { label: status, chip: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", meta.chip, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", (meta as { dot?: string }).dot ?? "bg-current")} />
      {meta.label}
    </span>
  );
}

export function PaymentStatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = PAYMENT_STATUS[status] ?? { label: status, chip: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", meta.chip, className)}>
      {meta.label}
    </span>
  );
}

export function ProviderStatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = PROVIDER_STATUS[status] ?? { label: status, chip: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", meta.chip, className)}>
      {meta.label}
    </span>
  );
}

export function NotifStatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = NOTIF_STATUS[status] ?? { label: status, chip: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", meta.chip, className)}>
      {meta.label}
    </span>
  );
}

// ───────────────────────── Avatar con iniciales ─────────────────────────

const AVATAR_COLORS = [
  "from-teal-500 to-emerald-600",
  "from-amber-400 to-orange-500",
  "from-orange-400 to-rose-500",
  "from-emerald-500 to-teal-600",
  "from-rose-400 to-fuchsia-500",
  "from-yellow-400 to-amber-600",
];

export function Avatar({ name, className, emoji, src }: { name: string; className?: string; emoji?: string; src?: string }) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setBroken(true)}
        className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full object-cover", className ?? "h-10 w-10 text-sm")}
      />
    );
  }
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-display font-extrabold text-white select-none", color, className ?? "h-10 w-10 text-sm")}>
      {emoji ?? initials}
    </span>
  );
}

// ───────────────────── Selector de foto (redimensiona en el cliente) ─────────────────────

/**
 * PhotoPicker — input de archivo que redimensiona la imagen en un canvas
 * (cuadrado, ≤288px, JPEG 82%) y devuelve un data URL pequeño apto para
 * guardarse directo en la base de datos (sin backend de archivos).
 */
export function PhotoPicker({ value, onChange, name, className, round = true }: {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  name: string;
  className?: string;
  round?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Selecciona un archivo de imagen"); return; }
    if (file.size > 12 * 1024 * 1024) { toast.error("La imagen pesa más de 12 MB"); return; }
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const size = Math.min(bitmap.width, bitmap.height);
      const target = Math.min(288, size);
      const canvas = document.createElement("canvas");
      canvas.width = target;
      canvas.height = target;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 0, 0, target, target);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      onChange(dataUrl);
    } catch {
      toast.error("No se pudo procesar la imagen");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <button
        type="button"
        aria-label="Cambiar foto"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "group relative flex h-20 w-20 items-center justify-center overflow-hidden border-2 border-dashed border-border bg-muted/50 transition-colors hover:border-primary/60 hover:bg-muted",
          round ? "rounded-full" : "rounded-2xl"
        )}
      >
        {value ? (
          <img src={value} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-2xl">📷</span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
          {busy ? "…" : "Cambiar"}
        </span>
      </button>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground transition-colors hover:bg-secondary/70"
        >
          {value ? "Cambiar foto" : "Subir foto"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-left text-xs font-semibold text-muted-foreground hover:text-destructive"
          >
            Quitar foto
          </button>
        )}
        <span className="max-w-40 text-[10px] leading-tight text-muted-foreground">JPG/PNG — se recorta y comprime automáticamente</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
    </div>
  );
}

// ───────────────────────── Varios ─────────────────────────

export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300", className)}>
      <BadgeCheck className="h-3.5 w-3.5" /> Verificado
    </span>
  );
}

export function ZoneTag({ zone, city, className }: { zone: string; city?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
      <MapPin className="h-3.5 w-3.5" />
      {zone}{city ? `, ${city}` : ""}
    </span>
  );
}

export function EmptyState({ emoji, title, desc, action, className }: {
  emoji: string; title: string; desc?: string; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border/70 bg-card/50 px-6 py-12 text-center", className)}>
      <span className="text-4xl animate-wiggle inline-block">{emoji}</span>
      <h3 className="font-display text-lg font-bold">{title}</h3>
      {desc && <p className="max-w-sm text-sm text-muted-foreground">{desc}</p>}
      {action}
    </div>
  );
}

export function SectionHeading({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="font-display text-xl font-extrabold sm:text-2xl">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
