/**
 * Importa los negocios reales del estado Bolívar (Excel del 20-oct-2026)
 * como prestadores VERIFICADOS con badge REAL ✅.
 * Idempotente: se puede correr varias veces sin duplicar.
 * Uso: bun scripts/import-real-bolivar.ts
 */
import { syncRealBusinesses } from "@/lib/petservice/real-bolivar";

const result = await syncRealBusinesses(true);
console.log("\n════════ RESULTADO ════════");
console.log(`Creados: ${result.created} · Omitidos (ya existían): ${result.skipped}`);
console.log("Por ciudad:", JSON.stringify(result.byCity, null, 2));
process.exit(0);
