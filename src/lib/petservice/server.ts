import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Utilidades compartidas de negocio para las APIs de PetService */

export async function getSettings() {
  let s = await db.settings.findUnique({ where: { id: "main" } });
  if (!s) {
    s = await db.settings.create({ data: { id: "main" } });
  }
  return s;
}

/**
 * Crea una reserva con código único PS-0001 (secuencial + sufijo anti-colisión).
 * Si dos reservas se crean a la vez, reintenta con sufijo aleatorio (P2002).
 */
export async function createBookingWithCode<T extends Record<string, unknown>>(
  data: Omit<T, "code"> & { code?: string }
) {
  const count = await db.booking.count();
  const base = `PS-${String(count + 1).padStart(4, "0")}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = attempt === 0 ? base : `${base.slice(0, 7)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    try {
      return await db.booking.create({ data: { ...(data as object), code } });
    } catch (e) {
      const isUniqueViolation = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (!isUniqueViolation || attempt === 3) throw e;
    }
  }
  throw new Error("No se pudo generar el código de reserva");
}

/** Crea una notificación WhatsApp simulada (log auditable) */
export async function notify(userId: string, template: string, body: string, status = "ENVIADO") {
  return db.notification.create({ data: { userId, channel: "WHATSAPP", template, body, status } });
}

export function money(usd: number, rate: number) {
  return {
    priceUsd: Math.round(usd * 100) / 100,
    priceBs: Math.round(usd * rate * 100) / 100,
  };
}

/** Devuelve el Provider asociado al usuario de la sesión (o null) */
export function getProviderOf(userId: string) {
  return db.provider.findUnique({ where: { userId } });
}

/**
 * Auto-hook CRM: al crear una reserva se registra/actualiza el contacto del
 * prestador (upsert por providerId + userId). Incrementa visitas y gasto,
 * marca ACTIVO (VIP con ≥3 visitas o gasto alto) y deja rastro de la mascota.
 * Nunca lanza: el CRM es un extra y no debe romper la reserva.
 */
export async function upsertCrmFromBooking(input: {
  providerId: string;
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  petName: string | null;
  petType: string | null;
  priceUsd: number;
}): Promise<void> {
  try {
    const existing = await db.crmContact.findFirst({
      where: { providerId: input.providerId, userId: input.userId },
    });
    if (existing) {
      const totalVisits = existing.totalVisits + 1;
      const totalSpentUsd = Math.round((existing.totalSpentUsd + input.priceUsd) * 100) / 100;
      await db.crmContact.update({
        where: { id: existing.id },
        data: {
          totalVisits,
          totalSpentUsd,
          lastVisitAt: new Date(),
          status: totalVisits >= 3 || totalSpentUsd >= 120 ? "VIP" : existing.status === "NUEVO" ? "ACTIVO" : existing.status,
          source: existing.source === "MANUAL" ? "RESERVA" : existing.source,
          phone: existing.phone ?? input.phone,
          petName: input.petName ?? existing.petName,
          petType: input.petType ?? existing.petType,
          updatedAt: new Date(),
        },
      });
    } else {
      await db.crmContact.create({
        data: {
          providerId: input.providerId,
          userId: input.userId,
          name: input.name,
          phone: input.phone,
          email: input.email,
          petName: input.petName,
          petType: input.petType,
          status: "ACTIVO",
          source: "RESERVA",
          totalVisits: 1,
          totalSpentUsd: input.priceUsd,
          lastVisitAt: new Date(),
        },
      });
    }
  } catch (e) {
    console.error("CRM auto-hook error (no bloquea la reserva):", e);
  }
}
