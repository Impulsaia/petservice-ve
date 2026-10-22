/**
 * Restaura db/custom.db desde el módulo embebido demoDb.ts (base64).
 * Uso: bun scripts/restore-db-from-demo.ts [--force]
 */
import { writeFileSync, readFileSync, existsSync, copyFileSync } from "fs";
import { join } from "path";
import { DEMO_DB_BASE64 } from "../src/lib/petservice/demoDb";

const dst = join(process.cwd(), "db", "custom.db");
if (existsSync(dst) && !process.argv.includes("--force")) {
  copyFileSync(dst, dst + ".bak");
  console.log("Respaldo previo: db/custom.db.bak");
}
writeFileSync(dst, Buffer.from(DEMO_DB_BASE64, "base64"));
console.log("✅ db/custom.db restaurada desde demoDb.ts");
