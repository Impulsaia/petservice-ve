/**
 * PetService VE — utilidades de etiquetas (tags) del CRM-lite WhatsApp.
 * Archivo colocado junto a las rutas /api/crm (no es una ruta: solo helpers).
 *
 * Reglas de negocio (Task 26-d):
 * - Las etiquetas se persisten como UN string coma-separado en CrmContact.tags
 *   (p.ej. "Gatos,Adeuda,Emergencia") — sin cambios de schema.
 * - Trim por etiqueta, máx 60 caracteres por etiqueta, máx 8 etiquetas.
 * - Deduplicación case-insensitive ("vip" y "VIP" son la misma etiqueta).
 *
 * NOTA DE IMPLEMENTACIÓN (lectura/escritura por SQL crudo): el Prisma Client
 * cargado en el proceso del dev server pudo generarse ANTES de añadir la
 * columna `tags` (fallaría con "Unknown argument `tags`" hasta el próximo
 * restart). Leer/escribir la columna con $queryRaw/$executeRaw funciona igual
 * con el client viejo o el nuevo, así que las rutas no dependen de un restart.
 */

import { db } from "@/lib/db";

export const MAX_TAGS = 8;
export const MAX_TAG_LEN = 60;

/** Normaliza la entrada de etiquetas (string "a, b" o array de strings) → string coma-separado. */
export function normalizeTagsInput(input: unknown): string {
  if (input === undefined || input === null) return "";
  const raw = typeof input === "string"
    ? input
    : Array.isArray(input)
      ? input.filter((t): t is string => typeof t === "string").join(",")
      : "";
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const piece of raw.split(",")) {
    const tag = piece.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, MAX_TAG_LEN);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags.join(",");
}

/** Mapa {idContacto → tags} de TODOS los contactos del prestador (1 query cruda). */
export async function fetchTagsByProvider(providerId: string): Promise<Map<string, string>> {
  const rows = await db.$queryRaw<{ id: string; tags: string }[]>`SELECT id, tags FROM CrmContact WHERE providerId = ${providerId}`;
  return new Map(rows.map((r) => [r.id, r.tags]));
}

/** Etiquetas actuales de un contacto (string coma-separado, "" si no tiene). */
export async function fetchTagsOf(contactId: string): Promise<string> {
  const rows = await db.$queryRaw<{ tags: string }[]>`SELECT tags FROM CrmContact WHERE id = ${contactId}`;
  return rows[0]?.tags ?? "";
}

/** Guarda las etiquetas de un contacto (string ya normalizado). */
export async function writeTags(contactId: string, tags: string): Promise<void> {
  await db.$executeRaw`UPDATE CrmContact SET tags = ${tags} WHERE id = ${contactId}`;
}
