import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, sameOriginOrError, readJson, jsonError } from "@/lib/petservice/auth";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * PATCH /api/provider/schedule — el prestador define su horario semanal.
 * Body: { schedule: {"1":[["08:00","12:00"],["14:00","18:00"]], … } } (1=Lunes…7=Domingo)
 * Validaciones: máx 2 tramos/día, cada tramo "HH:MM"–"HH:MM" con inicio < fin.
 * Un schedule vacío ({}) activa horarios tentativos 8:00–17:00 en el asistente.
 */
export async function PATCH(req: Request) {
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== "PROVIDER") return jsonError("Solo para prestadores", 403);

  const provider = await db.provider.findUnique({ where: { userId: auth.id } });
  if (!provider) return jsonError("Perfil de prestador no encontrado", 404);

  const body = await readJson<Record<string, unknown>>(req, 4096);
  if (!body || typeof body.schedule !== "object" || body.schedule === null) {
    return jsonError("schedule requerido", 400);
  }

  const raw = body.schedule as Record<string, unknown>;
  const clean: Record<string, [string, string][]> = {};

  for (const [day, value] of Object.entries(raw)) {
    if (!["1", "2", "3", "4", "5", "6", "7"].includes(day)) return jsonError(`Día inválido: ${day}`, 400);
    if (!Array.isArray(value) || value.length === 0 || value.length > 2) {
      return jsonError(`El día ${day} debe tener entre 1 y 2 tramos horarios`, 400);
    }
    const ranges: [string, string][] = [];
    for (const r of value) {
      if (!Array.isArray(r) || r.length !== 2 || typeof r[0] !== "string" || typeof r[1] !== "string") {
        return jsonError(`Tramo inválido en el día ${day}`, 400);
      }
      if (!TIME_RE.test(r[0]) || !TIME_RE.test(r[1])) return jsonError(`Horas inválidas en el día ${day} (usa HH:MM)`, 400);
      const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
      if (toMin(r[0]) >= toMin(r[1])) return jsonError(`En el día ${day}, la hora de inicio debe ser menor a la de fin`, 400);
      ranges.push([r[0], r[1]]);
    }
    clean[day] = ranges;
  }

  await db.provider.update({
    where: { id: provider.id },
    data: { scheduleJson: JSON.stringify(clean) },
  });

  return NextResponse.json({ ok: true, schedule: clean });
}
