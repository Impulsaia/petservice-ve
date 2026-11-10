import { PrismaClient, Prisma } from '@prisma/client'
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { DEMO_DB_BASE64 } from './petservice/demoDb'
import { mergeCatalogIfNewer } from './petservice/catalogMerge'

/**
 * Persistencia de la base de datos.
 *
 * ── Local (dev) ──────────────────────────────────────────────────────────
 * SQLite normal apuntada por DATABASE_URL (db/custom.db). Sin blob.
 *
 * ── Vercel (serverless) ─────────────────────────────────────────────────
 * /var/task es de solo lectura y /tmp es POR INSTANCIA: una SQLite suelta
 * en /tmp hace que cada instancia lambda tenga su propio mundo (reservas
 * invisibles entre usuarios, conciliaciones que "no se guardan", usuarios
 * que desaparecen, claves que no cambian).
 *
 * Solución: Vercel Blob como ALMACÉN COMPARTIDO (si BLOB_READ_WRITE_TOKEN
 * existe) con SINCRONIZACIÓN POR FUSIÓN (merge), no por reemplazo:
 *
 *  1. Arranque en frío: extrae la demo embebida como base local (si falta),
 *     añade columnas/tablas nuevas y FUSIONA el snapshot más reciente del
 *     blob (nunca lo reemplaza: los datos creados por usuarios jamás se
 *     pierden aunque la demo traiga filas extra).
 *  2. Cada request: ensureDbReady() verifica (throttle 2 s) si otra
 *     instancia publicó un snapshot más nuevo y lo FUSIONA en la DB local.
 *  3. Tras cada escritura: las rutas llaman after(() => flushDb()) que
 *     primero integra cualquier snapshot ajeno más nuevo (guard anti-pisar)
 *     y luego sube un snapshot consistente (VACUUM INTO) al blob.
 *  4. MUTEX DEL BLOB: solo UNA instancia sube a la vez (bloqueo con TTL en
 *     petservice-db.lock). Sin esto, dos snapshots completos publicados casi a
 *     la vez se pisaban (last-writer-wins a nivel ARCHIVO) y los datos de la
 *     instancia perdedora desaparecían de las demás: mascotas que no
 *     persistían, reservas invisibles, cola de conciliación vacía.
 *
 * Semántica del merge (por tabla replicada, ver REPLICATED_TABLES):
 *  - UNION: filas que existen en un lado y no en el otro se insertan
 *    (INSERT OR IGNORE respetando claves únicas).
 *  - ÚLTIMA ESCRITURA GANA POR FILA: si ambos lados tienen la fila, gana
 *    la de `updatedAt` más reciente (Prisma lo mantiene vía @updatedAt;
 *    filas viejas sin timestamp caen a `createdAt` y luego a 0).
 *  - BORRADOS: toda eliminación registra una "tumba" en DeletedRow
 *    (interceptado en el cliente extendido); las tumbas se replican y
 *    borran la fila en las demás instancias (evita resurrecciones).
 *  - Caso especial Settings (fila 'main', datos vivos como la tasa BCV):
 *    si AMBOS lados carecen de timestamp, gana el remoto (estado real de
 *    producción sobre la base demo del arranque).
 *
 * Sin token, degrada al comportamiento demo anterior (sin pérdida local; en
 * Vercel cada instancia seguiría siendo efímera).
 */

const DB_PATH = '/tmp/petservice-demo.db'
const REMOTE_PATH = '/tmp/petservice-remote.db'
const SNAPSHOT_PATH = '/tmp/petservice-snapshot.db'
export const BLOB_PATHNAME = 'petservice-db.sqlite'
export const LOCK_PATHNAME = 'petservice-db.lock'
/** Si el titular del lock no libera en este tiempo (lambda congelada/crash), otro toma el turno */
const LOCK_TTL_MS = 45_000
/** Identidad de ESTA instancia lambda (para saber si el lock es nuestro) */
const INSTANCE_ID = randomUUID()

const blobToken = process.env.BLOB_READ_WRITE_TOKEN || ''
const blobEnabled = process.env.VERCEL === '1' && !!blobToken

/** Estado del snapshot local (qué versión del blob tenemos integrada) */
const state = {
  lastLoadedAt: 0, // uploadedAt (reloj del blob) del último snapshot integrado
  lastCheck: 0,
  dirty: false,
  flushing: null as Promise<boolean> | null,
  merging: null as Promise<boolean> | null,
  // ANTI-WIPE: true si al menos una lectura del blob falló desde el arranque.
  // Mientras lastLoadedAt === 0 (nunca fusionamos nada) y este flag esté en
  // true, NO se sube ningún snapshot: subir la demo recién extraída sin haber
  // podido leer el blob podría pisar los datos reales de producción.
  pullErrored: false,
}

/** Tablas replicadas entre instancias. Todas usan PK "id". */
const REPLICATED_TABLES = [
  'User', 'Provider', 'Service', 'Pet', 'Booking', 'Payment', 'Review',
  'Notification', 'Settings', 'PasswordReset', 'City', 'Sector',
  'CrmContact', 'CalendarEvent', 'FirulaisEntry', 'FirulaisLog', 'DeletedRow',
] as const
const TOMBSTONE_TABLE = 'DeletedRow'

// ─────────────────────────── Utilidades de archivos ───────────────────────────

function extractDemoFileSync(): boolean {
  if (!DEMO_DB_BASE64) return false
  try {
    const tmp = `/tmp/petservice-demo.$${process.pid}.tmp`
    writeFileSync(tmp, Buffer.from(DEMO_DB_BASE64, 'base64'))
    renameSync(tmp, DB_PATH)
    return true
  } catch {
    return false
  }
}

function writeAtomic(dst: string, buf: Buffer): void {
  const tmp = `${dst}.$${process.pid}.tmp`
  writeFileSync(tmp, buf)
  renameSync(tmp, dst)
}

// ─────────────────────────── Cliente de fusión ───────────────────────────
// Cliente dedicado con UNA sola conexión: ATTACH/DETACH y todas las
// sentencias del merge comparten la misma conexión dentro de una transacción
// interactiva (atómica: si algo falla, la DB local queda intacta).

let mergeDbSingleton: PrismaClient | null = null
function getMergeDb(): PrismaClient {
  if (!mergeDbSingleton) {
    mergeDbSingleton = new PrismaClient({
      datasourceUrl: `file:${DB_PATH}?connection_limit=1`,
      log: ['error'],
    })
  }
  return mergeDbSingleton
}

interface ColInfo { name: string }

async function pragmaColumns(tx: Prisma.TransactionClient, table: string, alias: string): Promise<string[]> {
  const rows = await tx.$queryRawUnsafe<ColInfo[]>(
    `PRAGMA ${alias}.table_info('${table}')`
  )
  return rows.map((r) => r.name)
}

let savepointSeq = 0
/**
 * Ejecuta una sentencia del merge dentro de un SAVEPOINT propio: si falla
 * (p. ej. FK pendiente: una tumba de una mascota que aún tiene reservas en
 * esta instancia) se omite SIN abortar el resto de la fusión. El borrado
 * quedará pendiente y una fusión posterior lo reintenta.
 */
async function safeExec(tx: Prisma.TransactionClient, sql: string): Promise<number> {
  const sp = `sp_merge_${++savepointSeq}`
  await tx.$executeRawUnsafe(`SAVEPOINT ${sp}`)
  try {
    const r = await tx.$executeRawUnsafe(sql)
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${sp}`)
    return r
  } catch (e) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${sp}`)
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${sp}`)
    console.warn(
      `[dbSync] sentencia de merge omitida (${(e instanceof Error ? e.message : String(e)).slice(0, 140)})`
    )
    return 0
  }
}

/**
 * Fusiona el snapshot descargado en REMOTE_PATH con la DB local.
 * ok: la fusión terminó sin error global (aunque no cambiara nada).
 * changed: la DB local cambió (hay que publicar).
 */
async function mergeRemoteIntoLocal(): Promise<{ ok: boolean; changed: boolean }> {
  if (!existsSync(REMOTE_PATH)) return { ok: true, changed: false }
  const mdb = getMergeDb()

  const run = async (): Promise<{ ok: boolean; changed: boolean }> => {
    let changed = false
    // ATTACH fuera de la transacción (SQLite no permite ATTACH/DETACH dentro):
    // con connection_limit=1 todas las sentencias comparten ESTA conexión.
    try { await mdb.$executeRawUnsafe(`DETACH DATABASE remote`) } catch { /* no estaba */ }
    await mdb.$executeRawUnsafe(`ATTACH DATABASE '${REMOTE_PATH}' AS remote`)
    try {
      await mdb.$transaction(async (tx) => {
        // Esquemas de ambos lados
        const localTables = (
          await tx.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM sqlite_master WHERE type='table'`)
        ).map((r) => r.name)
        const remoteTables = (
          await tx.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM remote.sqlite_master WHERE type='table'`)
        ).map((r) => r.name)

        const hasLocalTombs = localTables.includes(TOMBSTONE_TABLE)
        const hasRemoteTombs = remoteTables.includes(TOMBSTONE_TABLE)

        for (const t of REPLICATED_TABLES) {
          if (!localTables.includes(t) || !remoteTables.includes(t)) continue
          const lcols = await pragmaColumns(tx, t, 'main')
          const rcols = await pragmaColumns(tx, t, 'remote')
          // Intersección de columnas (deploys en rodadura con esquemas distintos)
          const cols = rcols.filter((c) => lcols.includes(c))
          if (!cols.includes('id')) continue
          const colList = cols.map((c) => `"${c}"`).join(',')

          // 1) UNION — filas que solo existen en el remoto (respetando tumbas
          //    locales y claves únicas del lado local)
          const tombFilter = hasLocalTombs && t !== TOMBSTONE_TABLE
            ? ` WHERE "id" NOT IN (SELECT "rowId" FROM "main"."${TOMBSTONE_TABLE}" WHERE "tableName" = '${t}')`
            : ''
          const ins = `INSERT OR IGNORE INTO "main"."${t}" (${colList}) SELECT ${colList} FROM "remote"."${t}"${tombFilter}`
          const insRes = await safeExec(tx, ins)
          if (insRes > 0) changed = true

          // 2) ÚLTIMA ESCRITURA GANA — actualiza filas presentes en ambos lados
          if (t !== TOMBSTONE_TABLE && cols.includes('updatedAt')) {
            const dataCols = cols.filter((c) => c !== 'id' && c !== 'updatedAt')
            const verL = `COALESCE("main"."${t}"."updatedAt", ${lcols.includes('createdAt') ? `"main"."${t}"."createdAt"` : '0'}, 0)`
            const verR = `COALESCE(r."updatedAt", ${rcols.includes('createdAt') ? `r."createdAt"` : '0'}, 0)`
            if (dataCols.length > 0) {
              const sets = dataCols
                .map((c) => `"${c}" = (SELECT r."${c}" FROM "remote"."${t}" r WHERE r."id" = "main"."${t}"."id")`)
                .join(', ')
              // Caso especial Settings: sin timestamps en ambos lados gana el
              // remoto (estado vivo de producción sobre la base demo local).
              const settingsTiebreak = t === 'Settings'
                ? ` OR (r."updatedAt" IS NULL AND "main"."${t}"."updatedAt" IS NULL)`
                : ''
              const upd = `UPDATE "main"."${t}" SET ${sets} WHERE EXISTS (
                SELECT 1 FROM "remote"."${t}" r
                WHERE r."id" = "main"."${t}"."id"
                  AND (${verR} > ${verL}${settingsTiebreak})
              )`
              const updRes = await safeExec(tx, upd)
              if (updRes > 0) changed = true
            }
          }

          // 3) TUMBAS REMOTAS — borra localmente lo que otra instancia eliminó.
          //    Fila por fila: si una tiene FK pendiente (p. ej. la mascota
          //    recibió reservas en esta instancia) se omite sin romper el resto.
          if (hasRemoteTombs && t !== TOMBSTONE_TABLE) {
            const rowIds = await tx.$queryRawUnsafe<{ rowId: string }[]>(
              `SELECT "rowId" FROM "remote"."${TOMBSTONE_TABLE}" WHERE "tableName" = '${t}'`
            )
            for (const { rowId } of rowIds) {
              const safe = rowId.replace(/'/g, "''")
              const delRes = await safeExec(tx, `DELETE FROM "main"."${t}" WHERE "id" = '${safe}'`)
              if (delRes > 0) changed = true
            }
          }
        }
      })
    } finally {
      try { await mdb.$executeRawUnsafe(`DETACH DATABASE remote`) } catch { /* noop */ }
    }
    return { ok: true, changed }
  }

  // Un merge a la vez en esta instancia; reintento ligero ante SQLITE_BUSY
  const withMutex = async (): Promise<{ ok: boolean; changed: boolean }> => {
    if (state.merging) return state.merging
    state.merging = (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await run()
        } catch (e) {
          if (attempt === 2) {
            console.error('[dbSync] merge falló:', e instanceof Error ? e.message : e)
            return { ok: false, changed: false }
          }
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)))
        }
      }
      return { ok: false, changed: false }
    })()
    try {
      return await state.merging
    } finally {
      state.merging = null
    }
  }
  return withMutex()
}

// ─────────────────────────── Sincronización con el blob ───────────────────────────

interface RemoteSnapshot { url: string; uploadedAt: number }

async function listRemoteSnapshot(): Promise<RemoteSnapshot | null> {
  const { list } = await import('@vercel/blob')
  const listing = await list({ prefix: BLOB_PATHNAME, limit: 10 })
  const blob = listing.blobs.find((b) => b.pathname === BLOB_PATHNAME)
  if (!blob) return null
  return {
    url: blob.url,
    uploadedAt: blob.uploadedAt ? new Date(blob.uploadedAt).getTime() : Date.now(),
  }
}

/**
 * Si otra instancia publicó un snapshot más nuevo que el integrado, lo
 * descarga a un archivo temporal y lo FUSIONA (nunca reemplaza la DB local).
 *
 * El reloj del blob SOLO avanza si la fusión terminó bien: si falla
 * (SQLITE_BUSY x3), la próxima request re-descarga y re-intenta en vez de
 * dar por integrado un snapshot que no se aplicó.
 */
async function pullRemoteIfNewer(): Promise<boolean> {
  const remote = await listRemoteSnapshot()
  if (!remote || remote.uploadedAt <= state.lastLoadedAt) return false
  const res = await fetch(remote.url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`blob download ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeAtomic(REMOTE_PATH, buf)
  const merge = await mergeRemoteIntoLocal()
  if (merge.ok) state.lastLoadedAt = remote.uploadedAt
  if (merge.changed) markDirty() // publicar la fusión (p. ej. filas del arranque)
  return merge.changed
}

/** Sube un snapshot consistente al blob si hay cambios locales pendientes.
 *  Serializado con un mutex en el blob: si otra instancia está subiendo, esta
 *  omite la subida (queda dirty y la reintenta la próxima request) — así dos
 *  snapshots completos NUNCA se publican a la vez y ya no se pisan. */
export async function flushDb(): Promise<boolean> {
  if (!blobEnabled || !state.dirty) return true
  if (state.flushing) return state.flushing
  state.flushing = (async () => {
    try {
      // Guard anti-pisar: integra primero lo publicado por otras instancias
      // para que nuestro snapshot incluya SUS datos (merge bidireccional).
      try {
        await pullRemoteIfNewer()
      } catch (e) {
        state.pullErrored = true // anti-wipe: no subir sin haber leído el blob
        console.error('[dbSync] pull previo al flush falló:', e instanceof Error ? e.message : e)
      }

      // ── MUTEX del blob: pedir turno antes de subir ──
      let locked = await acquireLock()
      if (!locked) {
        const lock = await readLock()
        const stale = !lock || Date.now() - (lock.at || 0) > LOCK_TTL_MS
        if (stale) {
          // Titular muerto (lambda congelada/crash): tomamos el turno.
          locked = await takeLockOverwrite()
          if (locked) console.warn('[dbSync] lock vencido tomado por esta instancia')
        }
      }
      if (!locked) {
        // Otra instancia está subiendo AHORA MISMO. Nuestra data sigue local
        // (dirty) y se publicará en el próximo flush; mientras tanto ya
        // fusionamos lo ajeno (paso 1), así que la lectura es fresca.
        return true
      }

      try {
        // Re-pull dentro del lock: el titular anterior pudo publicar justo
        // entre nuestro primer pull y la adquisición del turno.
        try { await pullRemoteIfNewer() } catch { state.pullErrored = true /* el guard de abajo basta */ }

        // ── GUARD ANTI-WIPE ──
        // Si el blob existe pero esta instancia JAMÁS pudo leerlo desde su
        // arranque (algún pull con error y lastLoadedAt en 0), no subir: el
        // archivo local podría ser la demo recién extraída sin fusionar y
        // pisaríamos los datos reales de producción. dirty queda en true y la
        // próxima request reintenta la subida ya con los datos fusionados.
        if (state.pullErrored && state.lastLoadedAt === 0) {
          console.warn('[dbSync] flush OMITIDO (anti-wipe): nunca se pudo leer el blob; no se sube una DB sin fusionar')
          return false
        }

        // VACUUM INTO captura una copia consistente aunque haya escrituras en curso
        try { unlinkSync(SNAPSHOT_PATH) } catch { /* no existía */ }
        await db.$executeRawUnsafe(`VACUUM INTO '${SNAPSHOT_PATH}'`)
        const { put } = await import('@vercel/blob')
        await put(BLOB_PATHNAME, readFileSync(SNAPSHOT_PATH), {
          access: 'public',
          allowOverwrite: true,
          addRandomSuffix: false,
        })
        state.dirty = false
        // Ancla el reloj al DEL BLOB (no al local): las comparaciones de
        // uploadedAt son contra el reloj del almacén compartido y un desfase
        // del reloj de la lambda haría que se ignoren uploads ajenos.
        try {
          const own = await listRemoteSnapshot()
          state.lastLoadedAt = own?.uploadedAt ?? Date.now()
        } catch {
          state.lastLoadedAt = Date.now()
        }
        return true
      } finally {
        await releaseLock()
      }
    } catch (e) {
      // Sin token válido / sin red: dirty queda true y el próximo
      // ensureDbReady reintenta. No romper la request.
      console.error('[dbSync] flush al blob falló (se reintenta):', e instanceof Error ? e.message : e)
      return false
    } finally {
      state.flushing = null
    }
  })()
  return state.flushing
}

/** Verifica (con throttle) si otra instancia publicó datos más nuevos y los fusiona */
export async function ensureDbReady(): Promise<void> {
  if (!blobEnabled) return
  const now = Date.now()
  if (now - state.lastCheck < 2000) return
  state.lastCheck = now
  try {
    if (state.dirty) await flushDb() // puede omitir la subida si otra instancia tiene el turno
    // La fusión es por FILAS (UNION + última escritura gana) y nunca borra
    // filas locales sin tumba remota: es segura aunque haya escrituras locales
    // aún sin publicar, y mantiene la lectura fresca aunque el flush omitiera
    // la subida por el mutex.
    await pullRemoteIfNewer()
  } catch (e) {
    state.pullErrored = true // anti-wipe
    console.error('[dbSync] ensureDbReady falló:', e instanceof Error ? e.message : e)
  }
}

/**
 * Interno/operaciones: fusiona un archivo snapshot arbitrario en la DB local
 * usando el MISMO motor del blob (scripts/verify-blob-merge.ts).
 */
export async function mergeSnapshotForDebug(snapshotPath: string): Promise<boolean> {
  writeAtomic(REMOTE_PATH, readFileSync(snapshotPath))
  return mergeRemoteIntoLocal()
}

function markDirty(): void {
  if (blobEnabled) state.dirty = true
}

// ─────────────────────────── Mutex del blob (turno para subir) ───────────────────────────

interface LockInfo { holder: string; at: number }

async function lockPut(overwrite: boolean): Promise<boolean> {
  const { put } = await import('@vercel/blob')
  try {
    await put(LOCK_PATHNAME, JSON.stringify({ holder: INSTANCE_ID, at: Date.now() } satisfies LockInfo), {
      access: 'public',
      allowOverwrite: overwrite,
      addRandomSuffix: false,
      contentType: 'application/json',
    })
    return true
  } catch {
    // Ya existe (titular vivo) o error transitorio: NO es nuestro turno
    return false
  }
}

/** Intenta crear el lock SIN pisar (si existe, falla) */
function acquireLock(): Promise<boolean> {
  return lockPut(false)
}

/** Toma el lock pisando al titular vencido (solo tras TTL) */
function takeLockOverwrite(): Promise<boolean> {
  return lockPut(true)
}

/** Lee el lock actual (o null si no existe). Devuelve la url para poder liberarlo. */
async function readLock(): Promise<LockInfo | { holder: '?'; at: 0; url: string } | null> {
  try {
    const { list } = await import('@vercel/blob')
    const listing = await list({ prefix: LOCK_PATHNAME, limit: 5 })
    const blob = listing.blobs.find((b) => b.pathname === LOCK_PATHNAME)
    if (!blob) return null
    try {
      const res = await fetch(blob.url, { cache: 'no-store' })
      if (!res.ok) return { holder: '?', at: 0, url: blob.url }
      const j = JSON.parse(await res.text()) as LockInfo
      return { holder: String(j.holder ?? '?'), at: Number(j.at ?? 0), url: blob.url }
    } catch {
      return { holder: '?', at: 0, url: blob.url }
    }
  } catch {
    return null
  }
}

/** Libera el turno SOLO si sigue siendo nuestro (el TTL limpia el resto) */
async function releaseLock(): Promise<void> {
  try {
    const lock = await readLock()
    if (!lock || lock.holder !== INSTANCE_ID) return
    const { del } = await import('@vercel/blob')
    await del(lock.url)
  } catch {
    // Si no se pudo liberar, el TTL (45 s) permite a otras instancias tomar el turno
  }
}

// ─────────────────────────── Tumbas de borrado ───────────────────────────

type AnyArgs = { where?: Record<string, unknown> } & Record<string, unknown>

/**
 * Registra tumbas para las filas que una operación de borrado acaba de
 * eliminar (se llama DESPUÉS de que el delete tuvo éxito, para no dejar
 * tumbas de operaciones fallidas). Tumbas de una sola vez por instancia:
 * si una fila ya tiene tumba, INSERT OR IGNORE la conserva.
 */
async function recordTombstones(model: string, ids: string[]): Promise<void> {
  if (ids.length === 0 || model === TOMBSTONE_TABLE) return
  const now = new Date()
  await db.$executeRaw(
    Prisma.sql`INSERT OR IGNORE INTO "DeletedRow" ("id","tableName","rowId","deletedAt") VALUES ${Prisma.join(
      ids.map((rowId) => Prisma.sql`(${randomUUID()}, ${model}, ${rowId}, ${now})`)
    )}`
  )
}

// ─────────────────────────── Cliente principal ───────────────────────────

const globalForPrisma = globalThis as unknown as {
  prisma: DbClient | undefined
}

type DbClient = ReturnType<typeof buildDbClient>

function buildDbClient() {
  return new PrismaClient({
    log: ['error'],
    ...(process.env.VERCEL === '1' ? { datasourceUrl: `file:${DB_PATH}` } : {}),
  }).$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (/^(create|update|upsert|createMany|updateMany)/.test(operation)) markDirty()

          // Tumbas de borrado: captura los ids objetivo ANTES, ejecuta el
          // delete una sola vez y, si tuvo éxito, deja la tumba para el
          // merge multi-instancia (así una fila borrada no resucita).
          if (blobEnabled && model && (operation === 'delete' || operation === 'deleteMany')) {
            const mArgs = args as AnyArgs | undefined
            const where = mArgs?.where
            if (where) {
              let ids: string[] = []
              if (operation === 'delete' && typeof where.id === 'string') {
                ids = [where.id]
              } else if (operation === 'deleteMany') {
                try {
                  const delegateName = model[0].toLowerCase() + model.slice(1)
                  const delegate = (db as unknown as Record<
                    string,
                    { findMany: (a: unknown) => Promise<{ id: string }[]> }
                  >)[delegateName]
                  if (delegate) {
                    ids = (await delegate.findMany({ where, select: { id: true } })).map((r) => r.id)
                  }
                } catch (e) {
                  console.error('[dbSync] localización de filas a borrar falló:', e instanceof Error ? e.message : e)
                }
              }
              const result = await query(args) // si falla (FK), propaga sin tumba
              markDirty() // el borrado también es una escritura a publicar
              if (ids.length > 0) {
                try {
                  await recordTombstones(model, ids)
                } catch (e) {
                  // Nunca bloquear el borrado por un fallo de tumba
                  console.error('[dbSync] tumba de borrado falló:', e instanceof Error ? e.message : e)
                }
              }
              return result
            }
          }

          return query(args)
        },
      },
    },
  })
}

export const db: DbClient = globalForPrisma.prisma ?? buildDbClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

/**
 * Migración ligera e idempotente para la DB cargada (el blob de producción o
 * la demo embebida pueden venir de un deploy anterior sin las columnas nuevas).
 * SQLite: basta ALTER TABLE ADD COLUMN si falta.
 */
async function ensureSchemaColumns(): Promise<void> {
  try {
    // [tabla, columna, definición SQL] — añadir aquí las columnas nuevas de cada deploy
    const wanted: [string, string, string][] = [
      ['Provider', 'suspensionNote', 'TEXT'],
      // Monetización (Task 42)
      ['Provider', 'plan', `TEXT NOT NULL DEFAULT 'FREE'`],
      ['Provider', 'planExpiresAt', 'DATETIME'],
      ['Provider', 'adsBoostUntil', 'DATETIME'],
      ['Provider', 'commissionAcceptedAt', 'DATETIME'],
      ['Provider', 'commissionTermsVersion', 'TEXT'],
      ['Settings', 'subscriptionMonthlyUsd', 'REAL NOT NULL DEFAULT 5'],
      ['Settings', 'adsBoostWeeklyUsd', 'REAL NOT NULL DEFAULT 3'],
      // Sincronización multi-instancia (Task 43): updatedAt en todas las
      // tablas replicadas (nullable: filas viejas quedan en NULL)
      ['User', 'updatedAt', 'DATETIME'],
      ['Provider', 'updatedAt', 'DATETIME'],
      ['Service', 'updatedAt', 'DATETIME'],
      ['Pet', 'updatedAt', 'DATETIME'],
      ['Booking', 'updatedAt', 'DATETIME'],
      ['Payment', 'updatedAt', 'DATETIME'],
      ['Review', 'updatedAt', 'DATETIME'],
      ['Notification', 'updatedAt', 'DATETIME'],
      ['Settings', 'updatedAt', 'DATETIME'],
      ['PasswordReset', 'updatedAt', 'DATETIME'],
      ['City', 'updatedAt', 'DATETIME'],
      ['Sector', 'updatedAt', 'DATETIME'],
      ['CalendarEvent', 'updatedAt', 'DATETIME'],
    ]
    let changed = false
    for (const [table, column, def] of wanted) {
      const cols = (await db.$queryRawUnsafe<{ name: string }[]>(
        `PRAGMA table_info('${table}')`
      )).map((r) => r.name)
      if (cols.length === 0) continue // tabla no existe aún (no debería pasar)
      if (!cols.includes(column)) {
        await db.$executeRawUnsafe(`ALTER TABLE '${table}' ADD COLUMN '${column}' ${def}`)
        changed = true
      }
    }
    // Tabla de tumbas (puede no existir en la DB del blob de un deploy anterior)
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "DeletedRow" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "tableName" TEXT NOT NULL,
      "rowId" TEXT NOT NULL,
      "deletedAt" DATETIME NOT NULL
    )`)
    await db.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "DeletedRow_tableName_rowId_key" ON "DeletedRow"("tableName","rowId")`
    )
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "DeletedRow_tableName_idx" ON "DeletedRow"("tableName")`
    )
    if (changed) {
      // Solo marca dirty: la subida ÚNICA ocurre al final del arranque
      // (initDatabaseFile) DESPUÉS de fusionar el blob compartido. Subir aquí
      // —antes de la fusión— publicaría la demo recién extraída y pisaría los
      // datos reales de producción si la lectura del blob fallara.
      markDirty()
    }
  } catch (e) {
    console.error('[db] ensureSchemaColumns falló:', e instanceof Error ? e.message : e)
  }
}

/**
 * Arranque en frío: prepara la DB desde la demo embebida + el blob compartido
 * y ejecuta la fusión de catálogo si el deploy trae datos nuevos.
 *
 * Orden deliberado (ANTI-WIPE: NUNCA subir antes de fusionar):
 *  1. Archivo local base (demo embebida si falta) — NUNCA se pisa con el blob.
 *  2. Columnas/tablas nuevas en el archivo local (el merge las necesita).
 *     Solo marca dirty — jamás sube aquí.
 *  3. Fusión del snapshot más reciente del blob (los datos reales mandan).
 *  4. Fusión de catálogo del deploy (sube datos nuevos del deploy SIN tocar
 *     usuarios, claves, reservas ni negocios creados manualmente).
 *  5. UNA sola subida al final, ya con la demo + blob + catálogo fusionados.
 *     Con el guard anti-wipe, si la lectura del blob nunca funcionó no se
 *     sube nada (se reintenta por request) — la demo jamás pisa producción.
 */
async function initDatabaseFile(): Promise<void> {
  if (process.env.VERCEL !== '1') return
  if (!existsSync(DB_PATH) && !extractDemoFileSync()) return

  await ensureSchemaColumns()

  if (blobEnabled) {
    try {
      await pullRemoteIfNewer()
    } catch (e) {
      state.pullErrored = true // anti-wipe: el flush final no subirá sin fusión
      console.error('[db] fusión del blob en arranque falló (se reintenta por request):', e instanceof Error ? e.message : e)
    }
  }

  try {
    if (await mergeCatalogIfNewer(db)) markDirty()
  } catch (e) {
    console.error('[db] merge de catálogo falló:', e instanceof Error ? e.message : e)
  }

  // ÚNICA subida del arranque: ya con el blob fusionado (o con el guard
  // anti-wipe activo si la fusión falló — en ese caso no sube nada).
  if (state.dirty) await flushDb()
}

// Inicialización ANTES de servir la primera request (el cliente es perezoso:
// no abre el archivo hasta la primera consulta, que ocurre dentro de init)
await initDatabaseFile()
