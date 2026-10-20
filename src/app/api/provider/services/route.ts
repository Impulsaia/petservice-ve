import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, sameOriginOrError, readJson, jsonError } from "@/lib/petservice/auth";
import { getProviderOf } from "@/lib/petservice/server";
import { parseServiceBody } from "@/lib/petservice/validators";

/**
 * GET /api/provider/services — servicios del negocio del prestador autenticado.
 * Respuesta: { services: [...] } (ordenados por categoría y nombre)
 */
export async function GET(req: Request) {
  const auth = await requireRole(req, "PROVIDER");
  if (auth instanceof NextResponse) return auth;

  const provider = await getProviderOf(auth.id);
  if (!provider) return jsonError("Perfil de prestador no encontrado", 404);

  const services = await db.service.findMany({
    where: { providerId: provider.id },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ services, provider: { id: provider.id, businessName: provider.businessName } });
}

/**
 * POST /api/provider/services — crea un servicio propio.
 * Body: { name, category, description, durationMin, priceUsd, priceToUsd?, modality, petTypes, petSizes, extras?, active? }
 */
export async function POST(req: Request) {
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  const auth = await requireRole(req, "PROVIDER");
  if (auth instanceof NextResponse) return auth;

  const provider = await getProviderOf(auth.id);
  if (!provider) return jsonError("Perfil de prestador no encontrado", 404);

  const body = await readJson<Record<string, unknown>>(req, 16_384);
  if (!body) return jsonError("Solicitud inválida", 400);

  const parsed = parseServiceBody(body, false);
  if (parsed.error || !parsed.data) return jsonError(parsed.error ?? "Datos inválidos", 400);

  // Límite razonable: 30 servicios por negocio
  const count = await db.service.count({ where: { providerId: provider.id } });
  if (count >= 30) return jsonError("Alcanzaste el máximo de 30 servicios. Desactiva alguno para crear otro.", 409);

  const service = await db.service.create({
    data: { ...parsed.data, providerId: provider.id } as { providerId: string; name: string; category: string; description: string; durationMin: number; priceUsd: number; priceToUsd: number | null; modality: string; petTypes: string; petSizes: string; extrasJson: string; active: boolean },
  });
  return NextResponse.json({ service }, { status: 201 });
}
