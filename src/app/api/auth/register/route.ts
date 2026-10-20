import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  hashPassword, createSessionToken, sessionCookie, rateLimit, clientIp,
  sameOriginOrError, readJson, isValidEmail, jsonError, passwordProblems, cleanText,
} from "@/lib/petservice/auth";
import { ZONES } from "@/lib/petservice/constants";

/**
 * POST /api/auth/register — registro público de clientes y prestadores
 * { name, email, phone, password, role: "CLIENT"|"PROVIDER", businessName?, city?, zoneName? }
 * Los prestadores quedan en estado PENDING hasta verificación del admin.
 */
export async function POST(req: Request) {
  const csrf = sameOriginOrError(req);
  if (csrf) return csrf;

  // 10/hora: estricto anti-abuso pero tolerante a IP compartida (gateway/preview)
  const ipLimit = rateLimit(`register:ip:${clientIp(req)}`, 10, 60 * 60_000);
  if (!ipLimit.ok) return jsonError("Demasiados registros desde esta conexión. Intenta más tarde.", 429, { retryAfterS: ipLimit.retryAfterS });

  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return jsonError("Solicitud inválida", 400);

  const name = cleanText(body.name, 80);
  const email = cleanText(body.email, 254).toLowerCase();
  const phone = cleanText(body.phone, 24);
  const password = typeof body.password === "string" ? body.password : "";
  const role = body.role === "PROVIDER" ? "PROVIDER" : "CLIENT";

  if (name.length < 3) return jsonError("Escribe tu nombre completo", 400);
  if (!isValidEmail(email)) return jsonError("Correo electrónico inválido", 400);
  if (!/^[+0-9 ()-]{7,24}$/.test(phone)) return jsonError("Teléfono inválido (ej: +58 412 555 0000)", 400);
  const pwProblem = passwordProblems(password);
  if (pwProblem) return jsonError(pwProblem, 400);

  let businessName = "";
  let city = "";
  let zoneName = "";
  let lat = 0;
  let lng = 0;

  if (role === "PROVIDER") {
    businessName = cleanText(body.businessName, 60);
    zoneName = cleanText(body.zoneName, 60);
    city = cleanText(body.city, 40);
    const zone = ZONES.find((z) => z.name === zoneName && z.city === city);
    if (businessName.length < 3) return jsonError("Escribe el nombre de tu negocio", 400);
    if (!zone) return jsonError("Selecciona una zona válida de la lista", 400);
    lat = zone.lat;
    lng = zone.lng;
  }

  const exists = await db.user.findUnique({ where: { email } });
  if (exists) return jsonError("Ese correo ya está registrado. Inicia sesión.", 409);

  const passwordHash = await hashPassword(password);
  const user = await db.user.create({
    data: { email, name, phone, role, passwordHash },
  });

  if (role === "PROVIDER") {
    await db.provider.create({
      data: {
        userId: user.id,
        businessName,
        bio: `Nuevo prestador en ${zoneName}. Completa tu perfil para recibir más reservas.`,
        status: "PENDING",
        city,
        zoneName,
        lat,
        lng,
        radiusKm: 6,
      },
    });
  }

  await db.notification.create({
    data: {
      userId: user.id,
      channel: "INAPP",
      template: "BIENVENIDA",
      body: role === "PROVIDER"
        ? `🐾 ¡Bienvenido a PetService VE, ${name.split(" ")[0]}! Tu negocio está en verificación. Te avisaremos por aquí.`
        : `🐾 ¡Bienvenido a PetService VE, ${name.split(" ")[0]}! Explora prestadores verificados cerca de ti.`,
      status: "ENVIADO",
    },
  });

  const res = NextResponse.json(
    { user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone } },
    { status: 201 }
  );
  res.headers.append("Set-Cookie", sessionCookie(createSessionToken(user.id)));
  return res;
}
