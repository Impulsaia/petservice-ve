/**
 * PetService VE — Validadores compartidos para el CRUD de servicios.
 * Usados por /api/provider/services (dueño) y /api/admin/services (admin).
 */
import { cleanText } from "@/lib/petservice/auth";

export const SERVICE_CATEGORIES = [
  "GROOMING", "DELIVERY", "PET_SITTING", "DOG_WALKING", "TRAINING", "PET_TAXI", "SPA_MOVIL", "VET",
] as const;
export const SERVICE_MODALITIES = ["DOMICILIO", "PICKUP", "ONLINE"] as const;
export const PET_TYPES = ["PERRO", "GATO", "AVE", "ROEDOR", "OTRO"] as const;
export const PET_SIZES = ["S", "M", "L"] as const;

export interface ServiceInput {
  name: string;
  category: string;
  description: string;
  durationMin: number;
  priceUsd: number;
  priceToUsd: number | null;
  modality: string;
  petTypes: string;
  petSizes: string;
  extrasJson: string;
  active: boolean;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Valida el body de un servicio. Devuelve { data } o { error }.
 * `partial` = PATCH (solo campos presentes); `false` = POST (todos obligatorios).
 */
export function parseServiceBody(
  body: Record<string, unknown>,
  partial: boolean,
  current?: { priceUsd: number } | null
): { data?: Partial<ServiceInput>; error?: string } {
  const out: Partial<ServiceInput> = {};

  if (body.name !== undefined || !partial) {
    const name = cleanText(body.name, 80);
    if (name.length < 3) return { error: "El nombre del servicio debe tener al menos 3 caracteres" };
    out.name = name;
  }
  if (body.category !== undefined || !partial) {
    const category = cleanText(body.category, 20).toUpperCase();
    if (!(SERVICE_CATEGORIES as readonly string[]).includes(category)) {
      return { error: `Categoría inválida. Usa: ${SERVICE_CATEGORIES.join(", ")}` };
    }
    out.category = category;
  }
  if (body.description !== undefined || !partial) {
    const description = cleanText(body.description, 600);
    if (description.length < 10) return { error: "La descripción debe tener al menos 10 caracteres" };
    out.description = description;
  }
  if (body.durationMin !== undefined || !partial) {
    const durationMin = num(body.durationMin);
    if (durationMin === null || durationMin < 10 || durationMin > 600 || !Number.isInteger(durationMin)) {
      return { error: "durationMin debe ser un entero entre 10 y 600" };
    }
    out.durationMin = durationMin;
  }
  if (body.priceUsd !== undefined || !partial) {
    const priceUsd = num(body.priceUsd);
    if (priceUsd === null || priceUsd < 0.5 || priceUsd > 2000) {
      return { error: "priceUsd debe estar entre 0.5 y 2000" };
    }
    out.priceUsd = Math.round(priceUsd * 100) / 100;
  }
  if (body.priceToUsd !== undefined) {
    const priceToUsd = body.priceToUsd === null || body.priceToUsd === "" ? null : num(body.priceToUsd);
    if (priceToUsd !== null && (priceToUsd < 0.5 || priceToUsd > 2000)) {
      return { error: "priceToUsd debe estar entre 0.5 y 2000 (o null)" };
    }
    out.priceToUsd = priceToUsd === null ? null : Math.round(priceToUsd * 100) / 100;
  }
  if (body.modality !== undefined || !partial) {
    const modality = cleanText(body.modality, 12).toUpperCase() || "DOMICILIO";
    if (!(SERVICE_MODALITIES as readonly string[]).includes(modality)) {
      return { error: "Modality debe ser DOMICILIO, PICKUP u ONLINE" };
    }
    out.modality = modality;
  }
  if (body.petTypes !== undefined || !partial) {
    const raw = Array.isArray(body.petTypes) ? body.petTypes.map(String) : cleanText(body.petTypes, 60).split(",");
    const types = raw.map((t) => cleanText(t, 10).toUpperCase()).filter((t) => (PET_TYPES as readonly string[]).includes(t));
    if (types.length === 0) return { error: `petTypes inválido. Usa: ${PET_TYPES.join(", ")}` };
    out.petTypes = [...new Set(types)].join(",");
  }
  if (body.petSizes !== undefined || !partial) {
    const raw = Array.isArray(body.petSizes) ? body.petSizes.map(String) : cleanText(body.petSizes, 20).split(",");
    const sizes = raw.map((t) => cleanText(t, 2).toUpperCase()).filter((t) => (PET_SIZES as readonly string[]).includes(t));
    if (sizes.length === 0) return { error: "petSizes inválido. Usa: S, M, L" };
    out.petSizes = [...new Set(sizes)].join(",");
  }
  if (body.active !== undefined) {
    out.active = Boolean(body.active);
  } else if (!partial) {
    out.active = true;
  }
  if (body.extras !== undefined) {
    if (!Array.isArray(body.extras) || body.extras.length > 10) {
      return { error: "extras debe ser un array de máximo 10 elementos" };
    }
    const extras: { name: string; usd: number }[] = [];
    for (const e of body.extras) {
      if (typeof e !== "object" || e === null) return { error: "Extras inválidos" };
      const ex = e as Record<string, unknown>;
      const name = cleanText(ex.name, 50);
      const usd = num(ex.usd);
      if (name.length < 2 || usd === null || usd < 0 || usd > 500) {
        return { error: "Cada extra necesita name (2-50) y usd (0-500)" };
      }
      extras.push({ name, usd: Math.round(usd * 100) / 100 });
    }
    out.extrasJson = JSON.stringify(extras);
  } else if (!partial) {
    out.extrasJson = "[]";
  }

  // Regla de rango: priceToUsd debe ser ≥ priceUsd (el nuevo o el vigente en un PATCH)
  if (out.priceToUsd !== undefined && out.priceToUsd !== null) {
    const base = out.priceUsd ?? current?.priceUsd ?? 0;
    if (base > 0 && out.priceToUsd < base) return { error: "priceToUsd no puede ser menor que priceUsd" };
  }

  return { data: out };
}
