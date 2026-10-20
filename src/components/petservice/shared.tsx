"use client";

import { PawPrint, Scissors, Truck, House, Footprints, GraduationCap, CarTaxiFront, Sparkles, Stethoscope, MapPin, BadgeCheck, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { categoryMeta, BOOKING_STATUS, PAYMENT_STATUS, PROVIDER_STATUS, NOTIF_STATUS } from "@/lib/petservice/constants";
import { fmtUsd, fmtBs } from "@/lib/petservice/format";

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
      {count !== undefined && <span className="text-xs text-muted-foreground">({count})</span>}
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

export function Avatar({ name, className, emoji }: { name: string; className?: string; emoji?: string }) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-display font-extrabold text-white select-none", color, className ?? "h-10 w-10 text-sm")}>
      {emoji ?? initials}
    </span>
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
