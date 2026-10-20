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
