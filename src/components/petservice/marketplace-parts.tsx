"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { PawPrint, Star, Clock, ChevronRight, Navigation, Plus, Minus, Frame, LocateFixed, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { categoryMeta, CITIES, ZONES } from "@/lib/petservice/constants";
import { fmtUsd, fmtBs } from "@/lib/petservice/format";
import { projectToMap, getCityBounds, haversineKm, fmtDistance, CITY_BOUNDS, type LatLng } from "@/lib/petservice/geo";
import { fmtDrive } from "@/lib/petservice/routing";
import { CategoryIcon, RatingStars, Avatar } from "@/components/petservice/shared";
import { useAppStore } from "@/lib/petservice/store";
import { toast } from "sonner";

// ───────────────────────── Card de prestador ─────────────────────────

export interface ProviderListItem {
  id: string;
  businessName: string;
  bio: string;
  city: string;
  zoneName: string;
  lat: number;
  lng: number;
  ratingAvg: number;
  ratingCount: number;
  /** Ficha pública de Google Maps (null si no se importó) */
  googleRating?: number | null;
  googleReviews?: number | null;
  badges: string;
  status?: string;
  /** Foto/logotipo del negocio (data URL o https) */
  avatarUrl?: string | null;
  /** Registro manual reciente (< 1 mes): etiqueta "Nuevo prestador" */
  isNew?: boolean;
  distanceKm: number | null;
  /** Conducción REAL vía OSRM (null si el router no respondió) */
  driveKm?: number | null;
  driveMin?: number | null;
  minPriceUsd: number | null;
  serviceCategories: string[];
  services: { id: string; category: string; name: string; priceUsd: number }[];
}

/** Ranking de un prestador según sus calificaciones:
 *  top = 4+★ en Google Maps · double = además 4+★ en reseñas PetService-VE */
export function providerRank(p: Pick<ProviderListItem, "googleRating" | "ratingAvg" | "ratingCount">): {
  google: number;
  top: boolean;
  psTop: boolean;
  double: boolean;
} {
  const google = p.googleRating ?? (p.ratingCount === 0 ? p.ratingAvg : 0);
  const top = google >= 4;
  const psTop = p.ratingCount > 0 && p.ratingAvg >= 4;
  return { google, top, psTop, double: top && psTop };
}

export const ProviderCard = memo(function ProviderCard({ p, rate }: { p: ProviderListItem; rate: number }) {
  const openProvider = useAppStore((s) => s.openProvider);
  const meta = categoryMeta(p.serviceCategories[0] ?? "OTROS");
  const isTop = p.badges.includes("TOP");
  const rank = providerRank(p);
  const isNew = Boolean(p.isNew);

  return (
    <article
      onClick={() => openProvider(p.id)}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-warm transition-all duration-200 hover:-translate-y-1 hover:border-primary/40",
        rank.top && !rank.double && "border-amber-300/90 bg-gradient-to-b from-amber-50/80 to-card shadow-[0_2px_16px_rgba(245,158,11,0.18)] dark:from-amber-950/25",
        rank.double && "border-amber-400 bg-gradient-to-b from-amber-50/90 to-card shadow-[0_2px_20px_rgba(245,158,11,0.30)] ring-2 ring-amber-400/60 dark:from-amber-950/30",
        // "Nuevo prestador": tarjeta en color distinto (fucsia) durante su primer mes
        isNew && !rank.double && "border-fuchsia-300 bg-gradient-to-b from-fuchsia-50/90 to-card shadow-[0_2px_16px_rgba(217,70,239,0.18)] dark:border-fuchsia-500/50 dark:from-fuchsia-950/25",
        isNew && rank.double && "border-fuchsia-400 ring-2 ring-fuchsia-400/60 dark:border-fuchsia-500/60"
      )}
    >
      {isNew && (
        <span title="Prestador registrado recientemente en PetService-VE" className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 px-2 py-0.5 text-[10px] font-black text-white shadow-sm">
          <Sparkles className="h-3 w-3" /> Nuevo
        </span>
      )}
      {rank.double && (
        <span className={cn(
          "absolute -right-9 top-3 rotate-45 bg-gradient-to-r from-amber-400 to-amber-500 px-9 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow-sm",
          isNew && "top-9"
        )}>
          ★ Top
        </span>
      )}
      {!rank.double && isTop && (
        <span className={cn(
          "absolute -right-9 top-3 rotate-45 bg-accent px-9 py-0.5 text-[10px] font-black uppercase tracking-wide text-accent-foreground shadow-sm",
          isNew && "top-9"
        )}>
          Top
        </span>
      )}
      <div className="flex items-start gap-3">
        <Avatar name={p.businessName} emoji={meta.emoji} src={p.avatarUrl ?? undefined} className={cn("h-14 w-14 text-xl", rank.top && "ring-2 ring-amber-400 ring-offset-2 ring-offset-card", isNew && !rank.top && "ring-2 ring-fuchsia-400/70 ring-offset-2 ring-offset-card")} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate font-display text-base font-extrabold">{p.businessName}</h3>
            {p.status === "VERIFIED" || p.badges.includes("VERIFICADO") ? (
              <span title="Prestador verificado" className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                ✔
              </span>
            ) : (
              <span title="Pendiente de verificación" className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                Sin verificar
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {rank.psTop ? (
              <RatingStars value={p.ratingAvg} count={p.ratingCount} size="xs" />
            ) : rank.google > 0 ? (
              <RatingStars value={rank.google} count={0} size="xs" />
            ) : (
              <RatingStars value={p.ratingAvg} count={p.ratingCount} size="xs" />
            )}
            <span aria-hidden>·</span>
            <span className="truncate">{p.zoneName}</span>
            {p.driveMin != null && p.driveKm != null ? (
              <>
                <span aria-hidden>·</span>
                <span className="whitespace-nowrap font-semibold text-primary" title={`Distancia real de conducción (rutas con puente incluido). En línea recta: ${fmtDistance(p.distanceKm ?? 0)}.`}>
                  🚗 {fmtDrive(p.driveKm, p.driveMin)}
                </span>
              </>
            ) : p.distanceKm !== null ? (
              <>
                <span aria-hidden>·</span>
                <span className="font-semibold text-primary" title="Distancia en línea recta (el router de rutas no respondió)">
                  {fmtDistance(p.distanceKm)} <span className="text-[10px] font-normal text-muted-foreground">recta</span>
                </span>
              </>
            ) : null}
          </div>
          {(rank.top || rank.psTop || isNew) && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {rank.top && (
                <span title={`Calificación ${rank.google.toFixed(1)}★ en su ficha pública de Google Maps`} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                  ⭐ {rank.google.toFixed(1)} Google
                </span>
              )}
              {rank.psTop && (
                <span title={`Reseñas de clientes en PetService-VE: ${p.ratingAvg.toFixed(1)}★ (${p.ratingCount})`} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                  🏆 {p.ratingAvg.toFixed(1)} PetService ({p.ratingCount})
                </span>
              )}
              {rank.double && (
                <span title="4+★ en Google Maps Y en PetService-VE" className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-2 py-0.5 text-[10px] font-black text-white shadow-sm">
                  👑 Doble Top
                </span>
              )}
              {isNew && (
                <span title="Se registró en PetService-VE este mes" className="inline-flex items-center gap-1 rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-black text-fuchsia-700 dark:bg-fuchsia-950/70 dark:text-fuchsia-300">
                  ✨ Nuevo prestador
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{p.bio}</p>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-dashed border-border/70 pt-3">
        <div className="flex flex-wrap gap-1">
          {p.serviceCategories.slice(0, 3).map((c) => {
            const cm = categoryMeta(c);
            return (
              <span key={c} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold", cm.soft, cm.iconColor)}>
                <CategoryIcon category={c} className="h-3 w-3" />
                {cm.label}
              </span>
            );
          })}
          {p.serviceCategories.length > 3 && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
              +{p.serviceCategories.length - 3}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {p.minPriceUsd !== null && (
            <div className="text-right leading-none">
              {p.minPriceUsd > 0 ? (
                <>
                  <div className="text-[10px] text-muted-foreground">desde</div>
                  <div className="font-display text-sm font-extrabold text-primary">
                    {fmtUsd(p.minPriceUsd)}
                    <span className="ml-1 text-[10px] font-semibold text-muted-foreground">{fmtBs(p.minPriceUsd * rate)}</span>
                  </div>
                </>
              ) : (
                <div className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold text-secondary-foreground">💬 A consultar</div>
              )}
            </div>
          )}
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-secondary text-muted-foreground transition-all group-hover:bg-primary group-hover:text-primary-foreground">
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </article>
  );
});

// ───────────────────────── Card skeleton ─────────────────────────

export function ProviderCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-border/70 bg-card p-4">
      <div className="flex gap-3">
        <div className="h-14 w-14 rounded-full bg-muted" />
        <div className="flex-1 space-y-2 py-1">
          <div className="h-4 w-2/3 rounded bg-muted" />
          <div className="h-3 w-1/2 rounded bg-muted" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-4/5 rounded bg-muted" />
      </div>
    </div>
  );
}

// ───────────────────────── Mapas estilizados del Estado Bolívar ─────────────────────────

/** Mapa estilizado de una ciudad del estado Bolívar (SVG decorativo) */
function CityMapArt({ city }: { city: string }) {
  if (city === "San Félix") {
    return (
      <>
        {/* Río Orinoco al norte + Río Caroní al oeste, confluencia arriba-izquierda */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {/* Orinoco (franja norte) */}
          <path d="M0 0 L100 0 L100 16 C78 12, 60 20, 40 16 C22 12, 10 18, 0 14 Z" fill="currentColor" className="text-sky-200/70 dark:text-sky-950/50" />
          <text x="58" y="9" fontSize="4.4" fontWeight="700" fill="currentColor" className="text-sky-700/80 dark:text-sky-300/60">Río Orinoco 🌊</text>
          {/* Caroní (banda oeste que baja hacia el norte y confluye) */}
          <path d="M0 100 L0 14 C8 20, 16 18, 21 26 C24 34, 18 44, 20 56 C22 70, 16 86, 19 100 Z" fill="currentColor" className="text-sky-200/60 dark:text-sky-950/40" />
          <text x="3%" y="55%" fontSize="3.6" fontWeight="700" fill="currentColor" className="text-sky-700/80 dark:text-sky-300/60" transform="rotate(-84 4 55)">Río Caroní</text>
          {/* Confluencia */}
          <text x="8%" y="20%" fontSize="3.2" fontWeight="700" fill="currentColor" className="text-sky-800/70 dark:text-sky-300/50">Confluencia ⚓</text>
          {/* Represa Caruachi al sur, sobre el Caroní */}
          <rect x="14%" y="88%" width="4" height="9" rx="1" fill="currentColor" className="text-orange-300/90 dark:text-orange-800/70" />
          <text x="20%" y="94%" fontSize="3.4" fontWeight="700" fill="currentColor" className="text-orange-700/80 dark:text-orange-300/70">Represa Caruachi ⚡</text>
        </svg>
        {/* Barrios y avenidas */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {/* Centro Cívico */}
          <rect x="36%" y="38%" width="9" height="7" rx="1.5" fill="currentColor" className="text-amber-300/80 dark:text-amber-800/50" />
          <text x="30%" y="35%" fontSize="3.8" fontWeight="800" fill="currentColor" className="text-amber-700/80 dark:text-amber-300/60">Centro Cívico 🏛️</text>
          {/* Plaza Bolívar de San Félix */}
          <rect x="47%" y="52%" width="5" height="5" rx="1" fill="currentColor" className="text-emerald-300/80 dark:text-emerald-800/50" />
          <text x="53%" y="57%" fontSize="3.2" fontWeight="700" fill="currentColor" className="text-emerald-800/70 dark:text-emerald-300/50">Plaza Bolívar 🌳</text>
          {/* Av. Manuel Piar — espina dorsal oriental */}
          <line x1="30%" y1="100%" x2="55%" y2="18%" stroke="currentColor" strokeWidth="2.6" strokeDasharray="8 5" className="text-orange-200/80 dark:text-orange-900/40" />
          <text x="57%" y="34%" fontSize="3.6" fontWeight="800" fill="currentColor" className="text-orange-700/80 dark:text-orange-300/60" transform="rotate(-72 57 34)">Av. Manuel Piar</text>
          {/* El Roble */}
          <ellipse cx="60%" cy="24%" rx="8%" ry="7%" fill="currentColor" className="text-emerald-200/50 dark:text-emerald-900/35" />
          <text x="54%" y="16%" fontSize="3.4" fontWeight="800" fill="currentColor" className="text-emerald-800/70 dark:text-emerald-300/50">El Roble 🏘️</text>
          {/* Los Olivos */}
          <ellipse cx="52%" cy="12%" rx="7%" ry="6%" fill="currentColor" className="text-emerald-200/45 dark:text-emerald-900/30" />
          <text x="44%" y="25%" fontSize="3.2" fontWeight="700" fill="currentColor" className="text-emerald-800/60 dark:text-emerald-300/45">Los Olivos</text>
          {/* 11 de Abril */}
          <ellipse cx="42%" cy="70%" rx="8%" ry="7%" fill="currentColor" className="text-emerald-200/45 dark:text-emerald-900/30" />
          <text x="34%" y="72%" fontSize="3.4" fontWeight="800" fill="currentColor" className="text-emerald-800/70 dark:text-emerald-300/50">11 de Abril</text>
          {/* Dalla Costa */}
          <ellipse cx="55%" cy="86%" rx="9%" ry="7%" fill="currentColor" className="text-emerald-200/40 dark:text-emerald-900/25" />
          <text x="60%" y="88%" fontSize="3.4" fontWeight="800" fill="currentColor" className="text-emerald-800/65 dark:text-emerald-300/45">Dalla Costa</text>
        </svg>
        <div className="absolute right-[8%] top-[55%] h-14 w-20 rounded-[45%] bg-emerald-200/40 dark:bg-emerald-900/30" aria-hidden />
        <span className="absolute right-[9%] top-[64%] text-[9px] font-bold uppercase tracking-widest text-emerald-700/60 dark:text-emerald-300/40">San Félix Este</span>
      </>
    );
  }

  if (city === "Ciudad Bolívar") {
    return (
      <>
        {/* Río Orinoco — inmenso, cruza el norte */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <path d="M0 0 L100 0 L100 14 C78 10, 66 22, 48 18 C30 14, 16 24, 0 16 Z" fill="currentColor" className="text-sky-200/70 dark:text-sky-950/50" />
          <path d="M0 16 C16 24, 30 14, 48 18 C66 22, 78 10, 100 14 L100 17 C78 13, 66 25, 48 21 C30 17, 16 27, 0 19 Z" fill="currentColor" className="text-sky-300/50 dark:text-sky-900/40" />
          {/* Puente Angostura hacia Anzoátegui */}
          <line x1="86" y1="12" x2="100" y2="6" stroke="currentColor" strokeWidth="2.2" className="text-orange-300/90 dark:text-orange-800/70" />
          <text x="63" y="8" fontSize="4.4" fontWeight="700" fill="currentColor" className="text-sky-700/80 dark:text-sky-300/60">Río Orinoco 🌊</text>
          <text x="76" y="20" fontSize="3.6" fontWeight="700" fill="currentColor" className="text-orange-700/80 dark:text-orange-300/70">Puente Angostura 🌉</text>
        </svg>
        {/* Casco histórico (cuadrícula colonial) */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {[34, 40, 46, 52].map((y) => (
            <line key={y} x1="30" y1={`${y}%`} x2="58" y2={`${y}%`} stroke="currentColor" strokeWidth="0.5" className="text-amber-200/70 dark:text-amber-900/40" />
          ))}
          {[34, 40, 46].map((x) => (
            <line key={x} x1={`${x}%`} y1="33%" x2={`${x}%`} y2="53%" stroke="currentColor" strokeWidth="0.5" className="text-amber-200/70 dark:text-amber-900/40" />
          ))}
          <rect x="40.5%" y="39.5%" width="5" height="6" rx="1" fill="currentColor" className="text-amber-300/80 dark:text-amber-800/50" />
          <text x="36%" y="45%" fontSize="4" fontWeight="800" fill="currentColor" className="text-amber-700/80 dark:text-amber-300/60">Casco Histórico 🏛️</text>
          {/* Paseo Orinoco (malecón) */}
          <path d="M14 28 C30 33, 52 30, 70 26" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-300/80 dark:text-emerald-800/50" />
          <text x="16%" y="26%" fontSize="3.6" fontWeight="700" fill="currentColor" className="text-emerald-700/70 dark:text-emerald-300/50">Paseo Orinoco</text>
          {/* Av. Constitución */}
          <line x1="46%" y1="60%" x2="56%" y2="95%" stroke="currentColor" strokeWidth="2.5" strokeDasharray="6 4" className="text-orange-200/70 dark:text-orange-900/40" />
          <text x="50%" y="78%" fontSize="3.4" fontWeight="700" fill="currentColor" className="text-orange-700/60 dark:text-orange-300/50">Av. Constitución</text>
        </svg>
        {/* Sabanitas verdes */}
        <div className="absolute left-[6%] top-[60%] h-16 w-24 rounded-[45%] bg-emerald-200/50 dark:bg-emerald-900/30" aria-hidden />
        <div className="absolute right-[10%] top-[62%] h-14 w-16 rounded-[45%] bg-emerald-200/40 dark:bg-emerald-900/25" aria-hidden />
        <span className="absolute left-[8%] top-[70%] text-[9px] font-bold uppercase tracking-widest text-emerald-700/60 dark:text-emerald-300/40">Sabanita 🌳</span>
      </>
    );
  }

  if (city === "Upata") {
    return (
      <>
        {/* Cerro El Toro Patú — icónico, al sur */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <path d="M0 96 L18 74 L30 84 L44 66 L58 82 L72 70 L86 84 L100 74 L100 100 L0 100 Z" fill="currentColor" className="text-emerald-300/70 dark:text-emerald-900/50" />
          <path d="M40 70 L44 66 L48 70" fill="none" stroke="white" strokeWidth="0.8" opacity="0.8" />
          <text x="36%" y="90%" fontSize="4.4" fontWeight="800" fill="currentColor" className="text-emerald-800/80 dark:text-emerald-300/60">Cerro El Toro Patú ⛰️</text>
          {/* Río Yocoа / quebradas */}
          <path d="M8 30 C20 44, 10 58, 26 70" fill="none" stroke="currentColor" strokeWidth="2" className="text-sky-200/70 dark:text-sky-950/50" />
          <path d="M78 26 C70 40, 84 52, 74 64" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-sky-200/60 dark:text-sky-950/40" />
          <text x="10%" y="44%" fontSize="3.4" fontWeight="700" fill="currentColor" className="text-sky-700/70 dark:text-sky-300/50">Río Yocoа</text>
          {/* Av. 23 de Enero y Av. Bolívar */}
          <line x1="0" y1="42%" x2="100%" y2="38%" stroke="currentColor" strokeWidth="2.5" strokeDasharray="7 4" className="text-orange-200/80 dark:text-orange-900/40" />
          <text x="8%" y="37%" fontSize="3.6" fontWeight="700" fill="currentColor" className="text-orange-700/70 dark:text-orange-300/50">Av. 23 de Enero</text>
          <line x1="48%" y1="20%" x2="52%" y2="60%" stroke="currentColor" strokeWidth="2" strokeDasharray="5 4" className="text-amber-200/80 dark:text-amber-900/40" />
          <text x="53%" y="30%" fontSize="3.4" fontWeight="700" fill="currentColor" className="text-amber-700/70 dark:text-amber-300/50">Av. Bolívar</text>
          {/* Plaza de Upata */}
          <rect x="44%" y="40%" width="7" height="7" rx="1.5" fill="currentColor" className="text-emerald-300/80 dark:text-emerald-800/50" />
          <text x="52%" y="46%" fontSize="3.4" fontWeight="700" fill="currentColor" className="text-emerald-800/70 dark:text-emerald-300/50">Plaza Bolívar 🌳</text>
        </svg>
        <div className="absolute left-[70%] top-[10%] h-12 w-16 rounded-[45%] bg-emerald-200/40 dark:bg-emerald-900/30" aria-hidden />
      </>
    );
  }

  // Puerto Ordaz (default)
  return (
    <>
      {/* Río Caroní — diagonal majestuosa + represa Macagua */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <path d="M0 78 C22 66, 38 74, 52 62 C66 50, 80 54, 100 34 L100 52 C82 68, 66 62, 54 74 C42 86, 24 80, 0 92 Z" fill="currentColor" className="text-sky-200/70 dark:text-sky-950/50" />
        <path d="M0 92 C24 80, 42 86, 54 74 C66 62, 82 68, 100 52 L100 58 C82 74, 66 68, 56 80 C44 92, 26 86, 0 98 Z" fill="currentColor" className="text-sky-300/50 dark:text-sky-900/40" />
        {/* Represa Macagua */}
        <rect x="88%" y="40%" width="3.5" height="14" rx="1" fill="currentColor" className="text-orange-300/90 dark:text-orange-800/70" />
        <text x="60%" y="62%" fontSize="4.2" fontWeight="700" fill="currentColor" className="text-sky-700/80 dark:text-sky-300/60">Río Caroní 🌊</text>
        <text x="74%" y="48%" fontSize="3.4" fontWeight="700" fill="currentColor" className="text-orange-700/80 dark:text-orange-300/70">Macagua ⚡</text>
      </svg>
      {/* Cachamay y La Llovizna */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <ellipse cx="62%" cy="34%" rx="7%" ry="9%" fill="currentColor" className="text-emerald-300/60 dark:text-emerald-900/40" />
        <text x="56%" y="30%" fontSize="3.8" fontWeight="800" fill="currentColor" className="text-emerald-800/80 dark:text-emerald-300/60">Cachamay 🌳</text>
        <ellipse cx="56%" cy="70%" rx="6%" ry="8%" fill="currentColor" className="text-emerald-300/50 dark:text-emerald-900/35" />
        <text x="47%" y="74%" fontSize="3.6" fontWeight="800" fill="currentColor" className="text-emerald-800/70 dark:text-emerald-300/50">La Llovizna</text>
        {/* Av. Guayana — espina dorsal */}
        <line x1="20%" y1="100%" x2="42%" y2="0%" stroke="currentColor" strokeWidth="3" strokeDasharray="9 5" className="text-orange-200/80 dark:text-orange-900/40" />
        <text x="24%" y="52%" fontSize="4" fontWeight="800" fill="currentColor" className="text-orange-700/80 dark:text-orange-300/60" transform="rotate(-63 24 52)">Av. Guayana</text>
        {/* Av. Las Américas */}
        <line x1="0" y1="34%" x2="70%" y2="44%" stroke="currentColor" strokeWidth="2.4" strokeDasharray="7 5" className="text-amber-200/80 dark:text-amber-900/40" />
        <text x="8%" y="30%" fontSize="3.6" fontWeight="700" fill="currentColor" className="text-amber-700/70 dark:text-amber-300/50">Av. Las Américas</text>
        {/* Av. Principal de Unare */}
        <line x1="34%" y1="70%" x2="60%" y2="60%" stroke="currentColor" strokeWidth="1.8" strokeDasharray="5 4" className="text-orange-200/60 dark:text-orange-900/30" />
        {/* Unare (universidad) */}
        <rect x="40%" y="52%" width="8" height="6" rx="1.5" fill="currentColor" className="text-teal-300/50 dark:text-teal-900/40" />
        <text x="40.5%" y="50.5%" fontSize="3.2" fontWeight="700" fill="currentColor" className="text-teal-800/70 dark:text-teal-300/50">Unare 🎓</text>
      </svg>
      <div className="absolute left-[6%] top-[10%] h-14 w-20 rounded-[45%] bg-emerald-200/40 dark:bg-emerald-900/30" aria-hidden />
      <span className="absolute left-[8%] top-[16%] text-[9px] font-bold uppercase tracking-widest text-emerald-700/60 dark:text-emerald-300/40">Zona Industrial</span>
    </>
  );
}

/** Pines de prestadores: gradiente vertical por categoría (sin azules) */
const CAT_PIN_GRADIENT: Record<string, string> = {
  GROOMING: "from-teal-500 to-teal-700",
  DELIVERY: "from-orange-500 to-orange-700",
  PET_SITTING: "from-amber-500 to-amber-700",
  DOG_WALKING: "from-emerald-500 to-emerald-700",
  TRAINING: "from-rose-500 to-rose-700",
  PET_TAXI: "from-yellow-500 to-yellow-700",
  SPA_MOVIL: "from-fuchsia-500 to-fuchsia-700",
  VET: "from-violet-500 to-violet-700",
};

/** Estilos del mapa (pulso del pin, textura de puntos) — respeta prefers-reduced-motion */
const MAP_CSS = `
@keyframes ps-pin-pulse {
  0% { transform: scale(0.7); opacity: 0.5; }
  70% { transform: scale(2.4); opacity: 0; }
  100% { transform: scale(2.4); opacity: 0; }
}
.ps-pin-pulse { animation: ps-pin-pulse 1.9s cubic-bezier(0.2, 0.6, 0.35, 1) infinite; }
.ps-map-dots {
  background-image: radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--foreground) 9%, transparent) 1.1px, transparent 1.7px);
  background-size: 22px 22px;
}
@media (prefers-reduced-motion: reduce) {
  .ps-pin-pulse { animation: none; opacity: 0.22; transform: scale(1.5); }
}
`;

export interface MapSectorPin {
  name: string;
  zone?: string | null;
  lat: number;
  lng: number;
}

/** Fondo genérico para ciudades sin mapa detallado (nacional / "Próximamente") */
function NationalBackdrop({ vacant, city }: { vacant: { name: string; state: string } | null; city: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
      {/* decoración suave tipo mapa nacional */}
      <span className="pointer-events-none absolute left-4 top-4 text-lg opacity-30" aria-hidden>🧭</span>
      <span className="pointer-events-none absolute right-8 top-10 text-xl opacity-20" aria-hidden>⛰️</span>
      <span className="pointer-events-none absolute bottom-16 right-5 text-2xl opacity-25" aria-hidden>🐾</span>
      <span className="pointer-events-none absolute bottom-24 left-8 text-xl opacity-20" aria-hidden>🌊</span>
      <div className="relative flex h-20 w-20 items-center justify-center">
        <span className="ps-pin-pulse pointer-events-none absolute inset-0 rounded-full bg-amber-400/50" aria-hidden />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-b from-amber-400 to-orange-500 text-3xl shadow-xl ring-4 ring-white/70 dark:ring-zinc-900/70">
          {vacant ? "📍" : "🗺️"}
        </span>
      </div>
      <div className="max-w-xs rounded-2xl border border-border/50 bg-background/90 px-4 py-3 shadow-lg backdrop-blur-md">
        <p className="font-display text-sm font-black">{vacant ? `🚧 ${vacant.name} — Próximamente` : `🗺️ ${city}`}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {vacant
            ? `Estamos certificando prestadores en ${vacant.state}… ¡Sé el primero!`
            : "Mapa detallado en camino — la búsqueda y la lista funcionan con normalidad."}
        </p>
      </div>
    </div>
  );
}

/**
 * Mapa interactivo del marketplace:
 * - Toque corto en cualquier punto → mueve la ubicación de búsqueda
 * - Arrastrar (un dedo / mouse) en vista completa → mueve la búsqueda en vivo 🖐️📍
 * - El pin 📍 del usuario se puede arrastrar con área táctil ampliada (~44px)
 * - Zoom 1x–3x: botones, doble toque/click, rueda del mouse y PINZA con 2 dedos
 * - Con zoom activo, arrastrar hace pan del mapa
 * - Los pines de prestadores abren el perfil; el radio se recentra al soltar
 * - Modo nacional: ciudades fuera de Bolívar muestran fondo genérico (sin commits)
 *   y, si no hay prestadores, el pin especial "📍 Próximamente"
 * - 100% usable en móviles (pointer events unificados, touch-action none controlado)
 */
export function MapPanel({
  providers,
  rate,
  sector = null,
  vacant = null,
}: {
  providers: ProviderListItem[];
  rate: number;
  /** sector seleccionado (desde la DB): círculo de búsqueda enfatizado en su punto */
  sector?: MapSectorPin | null;
  /** ciudad activa sin prestadores → modo "Próximamente" (sin pines ni búsquedas) */
  vacant?: { name: string; state: string } | null;
}) {
  const loc = useAppStore((s) => s.loc);
  const setLoc = useAppStore((s) => s.setLoc);
  const city = useAppStore((s) => s.city);
  const setCity = useAppStore((s) => s.setCity);
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const openProvider = useAppStore((s) => s.openProvider);

  const wrapRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 }); // px en espacio del contenedor
  const [dragMode, setDragMode] = useState<null | "pan" | "pin">(null);
  const [pinPos, setPinPos] = useState<{ x: number; y: number } | null>(null); // % mundo, mientras se arrastra
  const moveStart = useRef({ px: 0, py: 0, panx: 0, pany: 0, dist: 0 });
  // Gestos multi-touch (pinza) y detección de doble toque
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const tapCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinHit = useRef<string | null>(null); // id del prestador bajo el dedo al iniciar el toque

  // Limpieza al desmontar
  useEffect(
    () => () => {
      if (tapCommitTimer.current) clearTimeout(tapCommitTimer.current);
    },
    []
  );

  const pins = useMemo(
    () =>
      providers
        .map((p) => ({ ...p, pos: projectToMap({ lat: p.lat, lng: p.lng }, city) }))
        .filter((p) => p.pos.inBounds),
    [providers, city]
  );

  const userPos = projectToMap(loc, city);
  const bounds = getCityBounds(city);
  const radiusXPct = Math.min(120, (filters.radiusKm / bounds.kmWide) * 100);
  const radiusYPct = Math.min(120, (filters.radiusKm / bounds.kmTall) * 100);
  const activePos = pinPos ?? { x: userPos.x, y: userPos.y };
  /** ciudad sin mapa detallado (fuera de Bolívar): fondo genérico + sin commits de búsqueda */
  const national = !CITY_BOUNDS[city];
  /** posición proyectada del sector seleccionado (ancla el círculo enfatizado) */
  const sectorPos = sector && !national ? projectToMap({ lat: sector.lat, lng: sector.lng }, city) : null;

  // ─── Conversiones de coordenadas ───
  /** punto del viewport (clientX/Y) → % del mundo (capa transformada) */
  function clientToWorldPct(clientX: number, clientY: number): { x: number; y: number } {
    const el = worldRef.current;
    if (!el) return { x: 50, y: 50 };
    const r = el.getBoundingClientRect(); // ya incluye zoom y pan
    return {
      x: Math.max(2, Math.min(98, ((clientX - r.left) / r.width) * 100)),
      y: Math.max(3, Math.min(97, ((clientY - r.top) / r.height) * 100)),
    };
  }
  /** punto del contenedor (px) para enfocar zoom */
  function clientToContainerPt(clientX: number, clientY: number): { x: number; y: number } {
    const el = wrapRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  /** % del mundo → lat/lng real de la ciudad */
  function pctToLatLng(x: number, y: number): LatLng {
    const b = getCityBounds(city);
    return {
      lat: b.minLat + ((100 - y) / 100) * (b.maxLat - b.minLat),
      lng: b.minLng + (x / 100) * (b.maxLng - b.minLng),
    };
  }

  /** etiqueta amigable para un punto: zona exacta, "cerca de" o la ciudad */
  function labelForPoint(ll: LatLng): string {
    let best: { name: string; d: number } | null = null;
    for (const z of ZONES) {
      if (z.city !== city) continue;
      const d = haversineKm(ll, z);
      if (!best || d < best.d) best = { name: z.name, d };
    }
    if (!best) return city;
    if (best.d < 0.4) return best.name;
    return `Cerca de ${best.name}`;
  }

  /** confirma la nueva ubicación de búsqueda (dispara la búsqueda con debounce) */
  function commitSearchAt(pct: { x: number; y: number }) {
    if (national) return; // sin mapa de referencia no hay coords reales: no commit
    const ll = pctToLatLng(pct.x, pct.y);
    const label = labelForPoint(ll);
    setLoc({ label, lat: ll.lat, lng: ll.lng });
    toast.success(`📍 Búsqueda movida a ${label}`, { duration: 2500 });
  }

  // ─── Pan y zoom ───
  function clampPan(p: { x: number; y: number }, z: number): { x: number; y: number } {
    const el = wrapRef.current;
    if (!el || z <= 1) return { x: 0, y: 0 };
    const maxX = (z - 1) * el.clientWidth;
    const maxY = (z - 1) * el.clientHeight;
    return { x: Math.min(0, Math.max(-maxX, p.x)), y: Math.min(0, Math.max(-maxY, p.y)) };
  }

  function zoomTo(nz: number, focusPt?: { x: number; y: number }, baseZoom?: number) {
    const from = baseZoom ?? zoom;
    const target = Math.min(3, Math.max(1, Number(nz.toFixed(1))));
    if (target === from) return;
    const el = wrapRef.current;
    if (!el || target === 1 || !focusPt) {
      setZoom(target);
      setPan((p) => clampPan(p, target));
      return;
    }
    // mantiene el punto bajo el cursor estable: pan' = focus − (focus − pan)·(z'/z)
    const k = target / from;
    setPan((p) => clampPan({ x: focusPt.x - (focusPt.x - p.x) * k, y: focusPt.y - (focusPt.y - p.y) * k }, target));
    setZoom(target);
  }

  /** centra la vista (zoom>1) sobre un punto % del mundo */
  function centerOnPct(pct: { x: number; y: number }) {
    const el = wrapRef.current;
    if (!el || zoom <= 1) return;
    const px = (pct.x / 100) * el.clientWidth * zoom;
    const py = (pct.y / 100) * el.clientHeight * zoom;
    setPan(clampPan({ x: el.clientWidth / 2 - px, y: el.clientHeight / 2 - py }, zoom));
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  // ─── Zoom con rueda del mouse (desktop) ───
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomTo(zoom + (e.deltaY < 0 ? 0.5 : -0.5), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  // ─── Interacción con puntero (mouse + touch unificados, con pinch-zoom) ───
  function pinchDist(): number {
    const pts = [...pointers.current.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
  }
  function pinchMid(): { x: number; y: number } {
    const pts = [...pointers.current.values()];
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }
  /** programa el commit de un toque simple (se cancela si llega un doble toque) */
  function scheduleTapCommit(pct: { x: number; y: number }) {
    if (tapCommitTimer.current) clearTimeout(tapCommitTimer.current);
    tapCommitTimer.current = setTimeout(() => {
      tapCommitTimer.current = null;
      commitSearchAt(pct);
    }, 240);
  }
  function cancelTapCommit() {
    if (tapCommitTimer.current) {
      clearTimeout(tapCommitTimer.current);
      tapCommitTimer.current = null;
    }
  }

  function onPointerDownBackground(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // ¿el gesto empezó sobre un pin de prestador? (solo un toque corto abrirá su perfil;
    // arrastrar desde el pin mueve la búsqueda/pan como en cualquier parte del mapa)
    const pinEl = (e.target as HTMLElement).closest?.("[data-provider-id]");
    pinHit.current = pinEl ? pinEl.getAttribute("data-provider-id") : null;
    if (pointers.current.size === 2) {
      // empieza el gesto de pinza (2 dedos): cancela cualquier arrastre previo
      cancelTapCommit();
      setPinPos(null);
      setDragMode(null);
      pinch.current = { dist: pinchDist(), zoom };
      return;
    }
    if (pointers.current.size > 2) return;
    moveStart.current = { px: e.clientX, py: e.clientY, panx: pan.x, pany: pan.y, dist: 0 };
    setDragMode("pan");
  }
  function onPinPointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    wrapRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moveStart.current = { px: e.clientX, py: e.clientY, panx: pan.x, pany: pan.y, dist: 0 };
    setPinPos({ x: userPos.x, y: userPos.y });
    setDragMode("pin");
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Pinza (2 dedos): zoom centrado en el punto medio
    if (pointers.current.size >= 2 && pinch.current) {
      const ratio = pinchDist() / pinch.current.dist;
      const mid = pinchMid();
      zoomTo(pinch.current.zoom * ratio, clientToContainerPt(mid.x, mid.y), pinch.current.zoom);
      return;
    }

    if (!dragMode) return;
    const dx = e.clientX - moveStart.current.px;
    const dy = e.clientY - moveStart.current.py;
    moveStart.current.dist = Math.max(moveStart.current.dist, Math.hypot(dx, dy));
    if (dragMode === "pan") {
      if (zoom > 1) {
        // con zoom activo: arrastrar desplaza el mapa (pan)
        setPan(clampPan({ x: moveStart.current.panx + dx, y: moveStart.current.pany + dy }, zoom));
      } else if (!national) {
        // vista completa: arrastrar mueve la ubicación de búsqueda en vivo 🖐️📍
        setPinPos(clientToWorldPct(e.clientX, e.clientY));
      }
    } else {
      setPinPos(clientToWorldPct(e.clientX, e.clientY));
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    const had = pointers.current.delete(e.pointerId);
    if (!had && !dragMode) return;

    // fin (o pausa) del gesto de pinza
    if (pinch.current) {
      if (pointers.current.size <= 1) {
        pinch.current = null;
        const rest = [...pointers.current.values()][0];
        if (rest) {
          // queda 1 dedo: continúa como pan (sin commit al soltar)
          moveStart.current = { px: rest.x, py: rest.y, panx: pan.x, pany: pan.y, dist: 99 };
          setDragMode("pan");
        } else {
          setDragMode(null);
          setPinPos(null);
        }
      }
      return;
    }

    const mode = dragMode;
    const moved = moveStart.current.dist;
    const hitPin = pinHit.current;
    pinHit.current = null;
    if (pointers.current.size === 0) setDragMode(null);
    if (!mode || pointers.current.size > 0) return;

    if (mode === "pin") {
      const pct = pinPos ?? clientToWorldPct(e.clientX, e.clientY);
      setPinPos(null);
      cancelTapCommit();
      commitSearchAt(pct);
    } else if (moved < 6 && hitPin) {
      // toque corto sobre un pin de prestador → abre su perfil (sin mover la búsqueda)
      openProvider(hitPin);
    } else if (moved < 6) {
      // toque: simple = mover la búsqueda · doble = zoom
      const now = Date.now();
      const isDouble = now - lastTap.current.t < 300 && Math.hypot(e.clientX - lastTap.current.x, e.clientY - lastTap.current.y) < 40;
      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
      if (isDouble) {
        cancelTapCommit();
        setPinPos(null);
        zoomTo(zoom + 1, clientToContainerPt(e.clientX, e.clientY));
      } else {
        const pct = clientToWorldPct(e.clientX, e.clientY);
        if (zoom === 1) scheduleTapCommit(pct);
        else commitSearchAt(pct);
      }
    } else if (mode === "pan" && zoom === 1) {
      // arrastre largo en vista completa: commit donde se soltó 🖐️
      const pct = pinPos ?? clientToWorldPct(e.clientX, e.clientY);
      setPinPos(null);
      commitSearchAt(pct);
    } else {
      setPinPos(null);
    }
  }

  function switchCity(name: string) {
    const zone = ZONES.find((z) => z.city === name);
    setCity(name, zone ? { label: zone.name, lat: zone.lat, lng: zone.lng } : undefined);
    setFilters({ zone: null });
    resetView();
  }

  const isDragging = dragMode !== null;

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative h-full min-h-[420px] touch-none select-none overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-b from-emerald-50 via-stone-50 to-amber-50/70 shadow-warm dark:from-emerald-950/40 dark:via-zinc-950/50 dark:to-orange-950/30",
        dragMode === "pan" && (zoom > 1 || pinPos) ? "cursor-grabbing" : "cursor-crosshair"
      )}
      onPointerDown={onPointerDownBackground}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => zoomTo(zoom + 1, clientToContainerPt(e.clientX, e.clientY))}
      role="application"
      aria-label={`Mapa interactivo de ${city}: toca o arrastra para mover la búsqueda`}
    >
      {/* Keyframes propios (pulso del pin, textura) — respetan prefers-reduced-motion */}
      <style>{MAP_CSS}</style>

      {/* ── Capa "mundo" (se transforma con zoom/pan) ── */}
      <div
        ref={worldRef}
        className="absolute inset-0"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          transition: isDragging ? "none" : "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {/* Textura sutil de puntos (más "mapa real", sin tiles externos) */}
        <div className="ps-map-dots absolute inset-0" aria-hidden />

        {national ? (
          <NationalBackdrop vacant={vacant} city={city} />
        ) : (
          <>
            <CityMapArt city={city} />

            {/* Radio de búsqueda — enfatizado y anclado al sector cuando hay uno seleccionado */}
            {sectorPos ? (
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-solid border-primary/70 bg-primary/15 shadow-[0_0_0_6px_color-mix(in_oklab,var(--primary)_10%,transparent)]"
                style={{ left: `${sectorPos.x}%`, top: `${sectorPos.y}%`, width: `${radiusXPct}%`, height: `${radiusYPct}%` }}
                aria-hidden
              />
            ) : (
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-primary/50 bg-primary/10"
                style={{ left: `${activePos.x}%`, top: `${activePos.y}%`, width: `${radiusXPct}%`, height: `${radiusYPct}%` }}
                aria-hidden
              />
            )}

            {/* Pines de prestadores (gradiente por categoría + emoji + etiqueta a zoom alto) */}
            {pins.map((p, i) => {
              const cm = categoryMeta(p.serviceCategories[0] ?? "OTROS");
              return (
                <button
                  key={p.id}
                  data-provider-id={p.id}
                  // el open por toque/click lo maneja onPointerUp (permite arrastrar desde el pin);
                  // este onClick solo responde a teclado (Enter/Espacio → detail === 0)
                  onClick={(e) => {
                    if (e.detail === 0) openProvider(p.id);
                  }}
                  title={`${p.businessName} — ${p.distanceKm !== null ? fmtDistance(p.distanceKm) : p.zoneName}`}
                  className="group absolute z-10 -translate-x-1/2 -translate-y-full"
                  style={{ left: `${p.pos.x}%`, top: `${p.pos.y}%`, zIndex: 10 + (i % 5) }}
                >
                  {/* escala inversa al zoom (anclada a la punta del pin) */}
                  <span className="block origin-bottom" style={{ transform: `scale(${1 / zoom})` }}>
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full rounded-bl-sm border-2 border-white bg-gradient-to-b shadow-md ring-1 ring-black/10 transition-transform duration-150 group-hover:scale-[1.15] group-active:scale-95 dark:border-zinc-900",
                        CAT_PIN_GRADIENT[cm.key] ?? "from-primary to-teal-700"
                      )}
                    >
                      <span className="text-[13px] leading-none drop-shadow-sm">{cm.emoji}</span>
                    </span>
                  </span>
                  <span
                    className="pointer-events-none absolute -top-9 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-full bg-foreground/95 px-2 py-1 text-[10px] font-bold text-background shadow-md backdrop-blur group-hover:block"
                    style={{ transform: `translateX(-50%) scale(${1 / zoom})` }}
                  >
                    {p.businessName} {p.distanceKm !== null ? `· ${fmtDistance(p.distanceKm)}` : ""}
                  </span>
                  {zoom >= 2 && (
                    <span
                      className="pointer-events-none absolute left-1/2 top-full mt-0.5 whitespace-nowrap rounded-full bg-background/95 px-1.5 py-0.5 text-[9px] font-bold text-foreground shadow-md ring-1 ring-border/60"
                      style={{ transform: `translateX(-50%) scale(${1 / zoom})` }}
                    >
                      {p.businessName}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Ubicación del usuario (arrastrable) */}
            <span
              className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${activePos.x}%`, top: `${activePos.y}%` }}
            >
              <span
                onPointerDown={onPinPointerDown}
                title="Arrástrame o toca el mapa para mover la búsqueda"
                role="button"
                aria-label={`Tu ubicación de búsqueda: ${loc.label} — arrastra para ajustar`}
                tabIndex={0}
                className={cn(
                  // ::after amplía el área táctil a ~44px sin cambiar el tamaño visual
                  "relative block h-3.5 w-3.5 cursor-grab rounded-full border-2 border-white bg-accent shadow after:absolute after:-inset-3.5 after:rounded-full after:content-['']",
                  dragMode === "pin" && "cursor-grabbing scale-150"
                )}
              />
              <span className={cn("ps-pin-pulse pointer-events-none absolute -inset-2.5 rounded-full bg-accent/50", dragMode === "pin" && "opacity-0")} aria-hidden />
              <span
                className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-2 py-0.5 text-[9px] font-black text-accent-foreground shadow-md"
                style={{ transform: `translateX(-50%) scale(${Math.max(0.6, 1 / zoom)})` }}
              >
                📍 {dragMode === "pin" ? "Suelta para buscar aquí" : loc.label}
              </span>
            </span>
          </>
        )}
      </div>

      {/* ── UI fija (fuera de la capa transformada) ── */}
      {/* Selector de ciudad */}
      <div className="absolute inset-x-3 top-3 z-30 flex flex-wrap gap-1.5" role="tablist" aria-label="Ciudad del mapa">
        {CITIES.map((c) => (
          <button
            key={c.name}
            role="tab"
            aria-selected={city === c.name}
            onClick={() => switchCity(c.name)}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              "rounded-xl px-3 py-1.5 text-[11px] font-black shadow-md backdrop-blur-md transition-all active:scale-95",
              city === c.name
                ? "bg-primary text-primary-foreground shadow-primary/20"
                : "bg-background/85 text-muted-foreground ring-1 ring-border/50 hover:bg-background hover:text-foreground"
            )}
          >
            {c.emoji} {c.name}
          </button>
        ))}
      </div>

      {/* Controles de zoom / vista */}
      <div className="absolute right-3 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-1.5">
        <button
          onClick={() => zoomTo(zoom + 1)}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={zoom >= 3}
          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-border/50 bg-background/90 shadow-lg backdrop-blur-md transition-all hover:bg-background active:scale-95 disabled:opacity-40"
          aria-label="Acercar mapa"
          title="Acercar (o doble click en el mapa)"
        >
          <Plus className="h-4 w-4" />
        </button>
        <span className="text-center text-[10px] font-black text-muted-foreground" aria-hidden>{zoom}×</span>
        <button
          onClick={() => zoomTo(zoom - 1)}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={zoom <= 1}
          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-border/50 bg-background/90 shadow-lg backdrop-blur-md transition-all hover:bg-background active:scale-95 disabled:opacity-40"
          aria-label="Alejar mapa"
          title="Alejar"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={resetView}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-border/50 bg-background/90 shadow-lg backdrop-blur-md transition-all hover:bg-background active:scale-95"
          aria-label="Vista completa de la ciudad"
          title="Vista completa de la ciudad"
        >
          <Frame className="h-4 w-4" />
        </button>
        {zoom > 1 && (
          <button
            onClick={() => centerOnPct({ x: userPos.x, y: userPos.y })}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex h-9 w-9 items-center justify-center rounded-2xl border border-border/50 bg-background/90 shadow-lg backdrop-blur-md transition-all hover:bg-background active:scale-95"
            aria-label="Centrar en mi ubicación de búsqueda"
            title="Centrar en mi ubicación de búsqueda"
          >
            <LocateFixed className="h-4 w-4 text-accent-foreground" />
          </button>
        )}
      </div>

      {/* Aviso durante el arrastre (pin o búsqueda en vivo) */}
      {dragMode && pinPos && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-full bg-foreground px-3 py-1.5 text-xs font-black text-background shadow-lg">
          🖐️ Suelta para buscar prestadores aquí
        </div>
      )}

      {/* Leyenda (no roba toques: pointer-events-none) */}
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-30 flex items-center justify-between gap-2 rounded-2xl border border-border/50 bg-background/85 px-3 py-2 text-[11px] font-semibold shadow-lg backdrop-blur-md">
        <span className="flex min-w-0 items-center gap-1.5">
          <Navigation className="h-3 w-3 shrink-0 text-accent-foreground" /> <span className="truncate">{loc.label}</span>
          {sector && (
            <span className="hidden shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black text-primary sm:inline-flex">
              🏘️ {sector.name}{sector.zone ? ` · Pq. ${sector.zone}` : ""}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-3 text-muted-foreground">
          <span className="hidden items-center gap-1 md:flex">👆 Toca o arrastra el mapa</span>
          <span className="flex items-center gap-1"><PawPrint className="h-3 w-3 text-primary" /> {pins.length}</span>
          <span className="hidden items-center gap-1 sm:flex"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /> 4.5+</span>
        </span>
      </div>

      {/* Tarjeta flotante de referencia de precio (baja a la esquina para no chocar con las ciudades en móvil) */}
      <div className="pointer-events-none absolute bottom-12 right-3 z-20 rounded-2xl border border-border/50 bg-background/90 px-2.5 py-1.5 text-[10px] font-bold shadow-lg backdrop-blur-md">
        🛁 Spa desde {fmtUsd(15)} · {fmtBs(15 * rate)}
      </div>
    </div>
  );
}

// ───────────────────────── Chip de slot de horario ─────────────────────────

export function SlotChip({ time, selected, disabled, onClick, reason }: {
  time: string; selected: boolean; disabled: boolean; onClick: () => void; reason?: string;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={disabled && reason ? reason : undefined}
      className={cn(
        "flex items-center justify-center gap-1 rounded-xl border px-3 py-2 text-sm font-bold transition-all",
        selected
          ? "border-primary bg-primary text-primary-foreground shadow-warm"
          : disabled
            ? "cursor-not-allowed border-transparent bg-muted/50 text-muted-foreground/50 line-through"
            : "border-border bg-card hover:border-primary/50 hover:bg-primary/5"
      )}
    >
      <Clock className="h-3.5 w-3.5" />
      {time}
    </button>
  );
}
