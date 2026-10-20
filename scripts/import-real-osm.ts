/**
 * PetService VE — Importación de negocios reales:
 *  1) ELIMINA todos los prestadores ficticios (sin badge REAL) y su historial demo
 *  2) INSERTA los negocios reales de OpenStreetMap (badge REAL) deduplicados
 *
 * Uso: bun scripts/import-real-osm.ts [--keep-fictional]
 */
import { wipeFictionalProviders, syncRealOsmBusinesses } from "@/lib/petservice/real-osm";

const keepFictional = process.argv.includes("--keep-fictional");

if (!keepFictional) {
  console.log("🧹 Eliminando prestadores ficticios y datos demo…");
  const wipe = await wipeFictionalProviders();
  console.log(`   - ${wipe.providers} prestadores ficticios eliminados`);
  console.log(`   - ${wipe.users} usuarios prestador huérfanos eliminados`);
  console.log(`   - ${wipe.bookings} reservas demo, ${wipe.reviews} reseñas demo, ${wipe.crm} contactos CRM demo`);
}

console.log("\n🌍 Insertando negocios reales de OpenStreetMap…");
const sync = await syncRealOsmBusinesses(true);
console.log(`\n════════ RESULTADO ════════`);
console.log(`Creados: ${sync.created} · Omitidos (ya existían): ${sync.skipped}`);
console.log("Por ciudad:", JSON.stringify(sync.byCity, null, 2));
process.exit(0);
