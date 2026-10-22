import { NextResponse } from "next/server";
import { db, ensureDbReady } from "@/lib/db";
import { notify } from "@/lib/petservice/server";

/**
 * GET /api/bookings/slots?providerId=...&date=yyyy-mm-dd&serviceId=...
 * Slots disponibles según horario del prestador y reservas existentes.
 */
export async function GET(req: Request) {
  await ensureDbReady();
  const { searchParams } = new URL(req.url);
  const providerId = searchParams.get("providerId");
  const date = searchParams.get("date");
  const serviceId = searchParams.get("serviceId");
  if (!providerId || !date) return NextResponse.json({ error: "providerId y date requeridos" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });

  const provider = await db.provider.findUnique({ where: { id: providerId } });
  if (!provider) return NextResponse.json({ error: "Prestador no encontrado" }, { status: 404 });

  const service = serviceId ? await db.service.findUnique({ where: { id: serviceId } }) : null;
  const durationMin = service?.durationMin ?? 60;
  const stepMin = durationMin <= 45 ? 30 : 60;

  // Horario del día (1=Lunes … 7=Domingo)
  const d = new Date(`${date}T12:00:00.000Z`);
  const weekday = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  const schedule = JSON.parse(provider.scheduleJson || "{}") as Record<string, [string, string][]>;
  let ranges = schedule[String(weekday)] ?? [];
  // Prestador sin agenda configurada ({}): agenda TENTATIVA 8:00–17:00 con pausa
  // de almuerzo para que los clientes puedan reservar de una vez (los slots no
  // desaparecen; el prestador puede ajustar su horario real desde su panel).
  const hasAnySchedule = Object.values(schedule).some((r) => Array.isArray(r) && r.length > 0);
  if (!hasAnySchedule) {
    ranges = [["08:00", "12:00"], ["14:00", "17:00"]];
  }

  // Slots ya ocupados (reservas activas del día)
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);
  const booked = await db.booking.findMany({
    where: {
      providerId,
      scheduledAt: { gte: dayStart, lte: dayEnd },
      status: { in: ["PENDIENTE_PAGO", "CONFIRMADA", "EN_CURSO"] },
    },
    select: { scheduledAt: true },
  });
  const bookedHours = new Set(booked.map((b) => b.scheduledAt.toISOString().slice(11, 16)));

  // Hora actual (UTC naive) para bloquear slots pasados del día de hoy
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  const slots: { time: string; available: boolean; reason?: string }[] = [];
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

  for (const [start, end] of ranges) {
    for (let m = toMin(start); m + durationMin <= toMin(end); m += stepMin) {
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      const time = `${hh}:${mm}`;
      let available = true;
      let reason: string | undefined;
      if (bookedHours.has(time)) {
        available = false;
        reason = "Ocupado";
      } else if (date === todayStr && m < nowMinutes + 60) {
        available = false;
        reason = "Ya pasó";
      }
      slots.push({ time, available, reason });
    }
  }

  return NextResponse.json({ date, weekday, slots, durationMin, tentative: !hasAnySchedule });
}
