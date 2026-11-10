/**
 * PetService VE — Hornea el esquema ACTUAL dentro de la DB demo embebida.
 *
 * ¿Por qué existe? La demo embebida (src/lib/petservice/demoDb.ts) viaja dentro
 * del bundle serverless. Si el deploy trae columnas/tablas nuevas que la demo
 * NO tiene, en CADA cold start ensureSchemaColumns() hacía ALTERs y —peor—
 * disparaba un flushDb() ANTES de fusionar el blob compartido: si la lectura
 * del blob fallaba (red/consistencia), se publicaba la demo recién extraída y
 * se PISABAN los datos reales de producción (reservas, mascotas, usuarios →
 * "el historial desaparece al desloguear").
 *
 * Esta utilidad toma la demo embebida actual, le aplica EXACTAMENTE los mismos
 * ALTER/CREATE que ensureSchemaColumns haría en runtime (más la tabla de
 * tumbas DeletedRow) y regenera demoDb.ts. Resultado: los cold starts ya no
 * cambian el esquema, no marcan dirty y jamás suben un snapshot sin fusionar.
 *
 * Uso:  bun scripts/bake-demo-schema.ts
 */
import { writeFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { DEMO_DB_BASE64 } from "../src/lib/petservice/demoDb";

const TMP = "/tmp/petservice-bake.db";
const OUT = join(process.cwd(), "src", "lib", "petservice", "demoDb.ts");

/** MISMA lista que ensureSchemaColumns (src/lib/db.ts) — mantener en sincronía */
const WANTED: [string, string, string][] = [
  ["Provider", "suspensionNote", "TEXT"],
  // Monetización (Task 42)
  ["Provider", "plan", `TEXT NOT NULL DEFAULT 'FREE'`],
  ["Provider", "planExpiresAt", "DATETIME"],
  ["Provider", "adsBoostUntil", "DATETIME"],
  ["Provider", "commissionAcceptedAt", "DATETIME"],
  ["Provider", "commissionTermsVersion", "TEXT"],
  ["Settings", "subscriptionMonthlyUsd", "REAL NOT NULL DEFAULT 5"],
  ["Settings", "adsBoostWeeklyUsd", "REAL NOT NULL DEFAULT 3"],
  // Sincronización multi-instancia (Task 43)
  ["User", "updatedAt", "DATETIME"],
  ["Provider", "updatedAt", "DATETIME"],
  ["Service", "updatedAt", "DATETIME"],
  ["Pet", "updatedAt", "DATETIME"],
  ["Booking", "updatedAt", "DATETIME"],
  ["Payment", "updatedAt", "DATETIME"],
  ["Review", "updatedAt", "DATETIME"],
  ["Notification", "updatedAt", "DATETIME"],
  ["Settings", "updatedAt", "DATETIME"],
  ["PasswordReset", "updatedAt", "DATETIME"],
  ["City", "updatedAt", "DATETIME"],
  ["Sector", "updatedAt", "DATETIME"],
  ["CalendarEvent", "updatedAt", "DATETIME"],
  ["FirulaisLog", "updatedAt", "DATETIME"],
];

async function main() {
  writeFileSync(TMP, Buffer.from(DEMO_DB_BASE64, "base64"));
  const db = new PrismaClient({ datasourceUrl: `file:${TMP}` });

  const before = (await db.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM sqlite_master WHERE type='table'`)).map((r) => r.name);
  let added = 0;
  for (const [table, column, def] of WANTED) {
    const cols = (await db.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info('${table}')`)).map((r) => r.name);
    if (cols.length === 0) {
      console.warn(`⚠️ tabla ${table} no existe en la demo (se omite)`);
      continue;
    }
    if (!cols.includes(column)) {
      await db.$executeRawUnsafe(`ALTER TABLE '${table}' ADD COLUMN '${column}' ${def}`);
      added++;
      console.log(`+ ${table}.${column}`);
    }
  }
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "DeletedRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tableName" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "deletedAt" DATETIME NOT NULL
  )`);
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "DeletedRow_tableName_rowId_key" ON "DeletedRow"("tableName","rowId")`);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DeletedRow_tableName_idx" ON "DeletedRow"("tableName")`);
  await db.$executeRawUnsafe(`VACUUM`);
  await db.$disconnect();

  // Regenerar demoDb.ts (mismo formato que scripts/gen-demo-db.ts)
  const buf = await import("fs").then((m) => m.readFileSync(TMP));
  const b64 = buf.toString("base64");
  const hashBuf = new Bun.CryptoHasher("md5").update(b64).digest("hex");
  const after = await (async () => {
    const db2 = new PrismaClient({ datasourceUrl: `file:${TMP}` });
    const t = (await db2.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM sqlite_master WHERE type='table'`)).map((r) => r.name);
    await db2.$disconnect();
    return t;
  })();
  const content = `/**
 * AUTO-GENERADO por scripts/bake-demo-schema.ts (desde gen-demo-db.ts) — NO editar a mano.
 *
 * SQLite demo sembrada (marketplace PetService VE) en base64, con el ESQUEMA
 * del deploy ya horneado (columnas nuevas + tabla DeletedRow). Así los cold
 * starts NO ejecutan ALTERs ni suben snapshots antes de fusionar el blob
 * compartido (evita pisar datos reales de producción).
 *
 * Regenerar tras cambiar el seed:  bun prisma/seed.ts && bun scripts/gen-demo-db.ts && bun scripts/bake-demo-schema.ts
 */
export const DEMO_DB_BASE64 = "${b64}";

/** MD5 del contenido — versión de datos para la fusión de catálogo en producción */
export const DEMO_DB_HASH = "${hashBuf}";
`;
  writeFileSync(OUT, content);
  console.log(`\n✅ demoDb.ts regenerado: +${added} columnas, tablas antes [${before.length}] → después [${after.length}], ${Math.round(b64.length / 1024)} KB en base64`);
}

main().catch((e) => {
  console.error("❌ bake-demo-schema falló:", e);
  process.exit(1);
});
