/**
 * Verificación del motor de fusión (merge) del blob — SIMULA DOS INSTANCIAS.
 * Uso: bun scripts/verify-blob-merge.ts
 *
 * Escenarios:
 *  a) UNION: fila que solo existe en el remoto → se inserta (salvo tumba local)
 *  b) Última escritura gana: reserva con updatedAt más nuevo en el remoto gana
 *  c) Reverso: reserva con updatedAt más nuevo en el LOCAL se conserva
 *  d) Tumba remota: fila borrada en otra instancia se borra localmente
 *  e) Tumba local: fila con tumba local NO se reinserta desde el remoto
 *  f) Settings tiebreak: sin timestamps en ambos lados gana el remoto
 */
import { Database } from "bun:sqlite";
import { copyFileSync, rmSync, existsSync } from "fs";

const LOCAL = "/tmp/petservice-demo.db";
const REMOTE = "/tmp/test-merge-remote.db";

for (const f of [LOCAL, REMOTE, "/tmp/petservice-remote.db"]) {
  if (existsSync(f)) rmSync(f);
}

// ── 1) Estado "instancia A" (local) ──
copyFileSync("db/custom.db", LOCAL);
{
  const ldb = new Database(LOCAL);
  ldb.exec("DELETE FROM DeletedRow");
  // escenario f) requiere AMBOS lados sin updatedAt en Settings (empate real)
  ldb.exec(`UPDATE Settings SET "updatedAt"=NULL`);
  const owner = (ldb.query("SELECT id FROM User LIMIT 1").get() as { id: string }).id;
  // fila que SOLO existe localmente (debe sobrevivir al merge)
  ldb.exec(
    `INSERT INTO Pet (id, ownerId, name, species, size) VALUES ('petlocal01', '${owner}', 'SoloLocal', 'PERRO', 'S')`
  );
  // tumba local para 'petremote01' (que el remoto intentará insertar)
  ldb.exec(
    `INSERT INTO DeletedRow (id, tableName, rowId, deletedAt) VALUES ('tomb-local-1', 'Pet', 'petremote01', 1700000001000)`
  );
  // reverso: local actualiza una reserva MÁS RECIENTE que el remoto
  // (una DISTINTA de la primera — robusto aunque la DB tenga pocas reservas)
  const bk2 = (ldb.query(
    "SELECT id FROM Booking WHERE id != (SELECT id FROM Booking ORDER BY id LIMIT 1) ORDER BY id LIMIT 1"
  ).get() as { id: string } | null)?.id;
  if (!bk2) throw new Error("verify-blob-merge: se necesitan ≥2 reservas en db/custom.db");
  ldb.exec(`UPDATE Booking SET status='CANCELADA', "updatedAt"=1900000300000 WHERE id='${bk2}'`);
  ldb.close();
  globalThis.__bk2 = bk2;
}

// ── 2) Estado "instancia B" (remoto) ──
copyFileSync("db/custom.db", REMOTE);
let bk1 = "", lunaId = "";
{
  const rdb = new Database(REMOTE);
  rdb.exec("DELETE FROM DeletedRow");
  const owner = (rdb.query("SELECT id FROM User LIMIT 1").get() as { id: string }).id;
  // a) fila nueva solo en el remoto (con tumba local → NO debe insertarse)
  rdb.exec(
    `INSERT INTO Pet (id, ownerId, name, species, size) VALUES ('petremote01', '${owner}', 'SoloRemoto', 'GATO', 'S')`
  );
  // b) remoto actualiza una reserva con updatedAt más nuevo
  bk1 = (rdb.query("SELECT id FROM Booking ORDER BY id LIMIT 1").get() as { id: string }).id;
  rdb.exec(`UPDATE Booking SET status='CONFIRMADA', "updatedAt"=1900000100000 WHERE id='${bk1}'`);
  // d) tumba remota sobre mascota SIN reservas creada en ambos lados (borrable)
  rdb.exec(
    `INSERT INTO Pet (id, ownerId, name, species, size) VALUES ('pettomb01', '${owner}', 'A Borrar', 'GATO', 'S')`
  );
  rdb.exec(
    `INSERT INTO DeletedRow (id, tableName, rowId, deletedAt) VALUES ('tomb-remote-1', 'Pet', 'pettomb01', 1700000200000)`
  );
  // d2) tumba remota sobre 'Luna' (tiene reservas → el borrado se OMITE sin romper el merge)
  lunaId = (rdb.query("SELECT id FROM Pet WHERE name='Luna'").get() as { id: string })?.id ?? "";
  if (lunaId) {
    rdb.exec(
      `INSERT INTO DeletedRow (id, tableName, rowId, deletedAt) VALUES ('tomb-remote-2', 'Pet', '${lunaId}', 1700000250000)`
    );
  }
  // f) Settings sin timestamps en AMBOS lados → gana el remoto
  rdb.exec(`UPDATE Settings SET usdToBs=777.77, "updatedAt"=NULL WHERE id='main'`);
  rdb.close();
}

// ── 3) Ejecuta el merge real del módulo ──
const { mergeSnapshotForDebug } = await import("../src/lib/db");
const merge = await mergeSnapshotForDebug(REMOTE);
console.log("mergeSnapshotForDebug →", merge);
if (!merge.changed) {
  console.error("❌ El merge reportó 'sin cambios' pero había divergencias");
  process.exit(1);
}

// ── 4) Verificaciones ──
let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}
{
  const v = new Database(LOCAL);
  const q = (sql: string) => v.query(sql).all() as Record<string, unknown>[];

  const soloRemoto = q(`SELECT id FROM Pet WHERE id='petremote01'`);
  check("e) tumba local evita reinsertar 'SoloRemoto'", soloRemoto.length === 0);

  const soloLocal = q(`SELECT id FROM Pet WHERE id='petlocal01'`);
  check("fila solo-local 'SoloLocal' sobrevive", soloLocal.length === 1);

  const bk1St = q(`SELECT status FROM Booking WHERE id='${bk1}'`)[0]?.status;
  check("b) reserva actualizada en el remoto gana (CONFIRMADA)", bk1St === "CONFIRMADA", `status=${bk1St}`);

  const bk2St = q(`SELECT status FROM Booking WHERE id='${(globalThis as { __bk2?: string }).__bk2}'`)[0]?.status;
  check("c) reserva actualizada en el local se conserva (CANCELADA)", bk2St === "CANCELADA", `status=${bk2St}`);

  if (lunaId) {
    const luna = q(`SELECT id FROM Pet WHERE id='${lunaId}'`);
    check("d2) FK pendiente: tumba de mascota con reservas se omite (fila viva)", luna.length === 1);
    const lunaTomb = q(`SELECT id FROM DeletedRow WHERE rowId='${lunaId}'`);
    check("d2) tumba FK-pendiente replicada localmente para reintentos", lunaTomb.length === 1);
  }
  const tombPet = q(`SELECT id FROM Pet WHERE id='pettomb01'`);
  check("d) tumba remota borra la mascota sin reservas", tombPet.length === 0);

  const rate = q(`SELECT usdToBs FROM Settings WHERE id='main'`)[0]?.usdToBs;
  check("f) Settings: gana el remoto en empate sin timestamps", rate === 777.77, `usdToBs=${rate}`);

  const tombs = q(`SELECT COUNT(*) as n FROM DeletedRow`)[0]?.n;
  check("tumbas replicadas se unen (3)", tombs === 3, `n=${tombs}`);

  v.close();
}

console.log(failed === 0 ? "\n🎉 TODOS los escenarios del merge OK" : `\n💥 ${failed} verificaciones fallaron`);
process.exit(failed === 0 ? 0 : 1);
