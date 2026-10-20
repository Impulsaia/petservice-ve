/**
 * PetService VE — Generador del módulo de DB demo embebida
 *
 * Convierte la SQLite sembrada en un módulo TS con el contenido en base64.
 * Así la base de datos demo viaja SIEMPRE dentro del bundle de las funciones
 * serverless, sin depender del file-tracing (que es inconsistente entre
 * builds remotos y `vercel build` local/Turbopack).
 *
 * Uso:  bun scripts/gen-demo-db.ts
 *  - Lee db/custom.db (la DB sembrada local)
 *  - Escribe src/lib/petservice/demoDb.ts
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const SRC = join(process.cwd(), "db", "custom.db");
const OUT = join(process.cwd(), "src", "lib", "petservice", "demoDb.ts");

try {
  const buf = readFileSync(SRC);
  const b64 = buf.toString("base64");
  const content = `/**
 * AUTO-GENERADO por scripts/gen-demo-db.ts — NO editar a mano.
 *
 * SQLite demo sembrada (marketplace PetService VE) en base64.
 * Se decodifica y escribe en /tmp durante el arranque en frío de las
 * funciones serverless (ver src/lib/db.ts).
 *
 * Regenerar tras cambiar el seed:  bun prisma/seed.ts && bun scripts/gen-demo-db.ts
 */
export const DEMO_DB_BASE64 = "${b64}";
`;
  writeFileSync(OUT, content);
  console.log(
    `✅ demoDb.ts generado (${Math.round(b64.length / 1024)} KB en base64, DB original ${Math.round(buf.length / 1024)} KB)`
  );
} catch (e) {
  console.error("❌ No se pudo leer db/custom.db:", e);
  process.exit(1);
}
