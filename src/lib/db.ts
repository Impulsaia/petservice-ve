import { PrismaClient } from '@prisma/client'
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
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
 * existe):
 *  1. Arranque en frío: descarga el último snapshot desde el blob (o extrae
 *     la demo embebida si aún no existe).
 *  2. Cada request: ensureDbReady() verifica (throttle 2 s) si otra instancia
 *     subió un snapshot más nuevo y lo intercambia atómicamente.
 *  3. Tras cada escritura: las rutas llaman after(() => flushDb()) que sube
 *     un snapshot consistente (VACUUM INTO) al blob.
 * Sin token, degrada al comportamiento demo anterior (sin pérdida local; en
 * Vercel cada instancia seguiría siendo efímera).
 */

const DB_PATH = '/tmp/petservice-demo.db'
export const BLOB_PATHNAME = 'petservice-db.sqlite'

const blobToken = process.env.BLOB_READ_WRITE_TOKEN || ''
const blobEnabled = process.env.VERCEL === '1' && !!blobToken

/** Estado del snapshot local (qué versión del blob tenemos en disco) */
const state = {
  lastLoadedAt: 0,
  lastCheck: 0,
  dirty: false,
  flushing: null as Promise<void> | null,
}

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

/** Descarga el snapshot más reciente del blob compartido (null si no existe) */
async function downloadBlobSnapshot(): Promise<number | null> {
  const { list } = await import('@vercel/blob')
  const listing = await list({ prefix: BLOB_PATHNAME, limit: 10 })
  const blob = listing.blobs.find((b) => b.pathname === BLOB_PATHNAME)
  if (!blob) return null
  const res = await fetch(blob.url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`blob download ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeAtomic(DB_PATH, buf)
  return blob.uploadedAt ? new Date(blob.uploadedAt).getTime() : Date.now()
}

/** Verifica (con throttle) si otra instancia publicó datos más nuevos y los carga */
export async function ensureDbReady(): Promise<void> {
  if (!blobEnabled) return
  const now = Date.now()
  if (now - state.lastCheck < 2000) return
  state.lastCheck = now
  try {
    if (state.dirty) await flushDb()
    const { list } = await import('@vercel/blob')
    const listing = await list({ prefix: BLOB_PATHNAME, limit: 10 })
    const blob = listing.blobs.find((b) => b.pathname === BLOB_PATHNAME)
    if (!blob) return
    const uploadedAt = blob.uploadedAt ? new Date(blob.uploadedAt).getTime() : 0
    if (uploadedAt > state.lastLoadedAt + 1500) {
      const fresh = await downloadBlobSnapshot()
      if (fresh) {
        // Libera conexiones para que la próxima consulta abra el archivo nuevo
        try { await db.$disconnect() } catch { /* noop */ }
        state.lastLoadedAt = fresh
      }
    }
  } catch (e) {
    console.error('[dbSync] ensureDbReady falló:', e instanceof Error ? e.message : e)
  }
}

/** Sube un snapshot consistente al blob si hay cambios locales pendientes */
export async function flushDb(): Promise<void> {
  if (!blobEnabled || !state.dirty) return
  if (state.flushing) return state.flushing
  state.flushing = (async () => {
    const snapshot = '/tmp/petservice-snapshot.db'
    try {
      // VACUUM INTO captura una copia consistente aunque haya escrituras en curso
      try { unlinkSync(snapshot) } catch { /* no existía */ }
      await db.$executeRawUnsafe(`VACUUM INTO '${snapshot}'`)
      const { put } = await import('@vercel/blob')
      await put(BLOB_PATHNAME, readFileSync(snapshot), {
        access: 'public',
        allowOverwrite: true,
        addRandomSuffix: false,
      })
      state.dirty = false
      state.lastLoadedAt = Date.now()
    } catch (e) {
      // Sin token válido / sin red: el siguiente flush reintenta. No romper la request.
      console.error('[dbSync] flush al blob falló (se reintenta):', e instanceof Error ? e.message : e)
    } finally {
      state.flushing = null
    }
  })()
  return state.flushing
}

function markDirty(): void {
  if (blobEnabled) state.dirty = true
}

/**
 * Arranque en frío: prepara la DB desde el blob compartido (o de la demo
 * embebida) y ejecuta la fusión de catálogo si el deploy trae datos nuevos.
 */
async function initDatabaseFile(): Promise<void> {
  if (process.env.VERCEL !== '1') return
  if (blobEnabled) {
    try {
      const uploadedAt = await downloadBlobSnapshot()
      if (uploadedAt === null) {
        // Primera vez: siembra desde la demo embebida
        if (!extractDemoFileSync()) return
        state.lastLoadedAt = Date.now()
      } else {
        state.lastLoadedAt = uploadedAt
      }
    } catch (e) {
      console.error('[db] descarga de blob falló, se usa la demo embebida:', e instanceof Error ? e.message : e)
      if (!extractDemoFileSync()) return
      state.lastLoadedAt = Date.now()
    }
  } else {
    // Modo demo clásico: extraer si aún no existe en esta instancia
    if (!existsSync(DB_PATH) && !extractDemoFileSync()) return
    state.lastLoadedAt = Date.now()
  }
  // Fusión de catálogo: sube datos nuevos del deploy SIN tocar usuarios,
  // claves, reservas ni negocios creados manualmente.
  try {
    if (await mergeCatalogIfNewer(db)) {
      markDirty()
      await flushDb()
    }
  } catch (e) {
    console.error('[db] merge de catálogo falló:', e instanceof Error ? e.message : e)
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'],
    ...(process.env.VERCEL === '1' ? { datasourceUrl: `file:${DB_PATH}` } : {}),
  }).$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          if (/^(create|update|upsert|delete|createMany|updateMany|deleteMany)/.test(operation)) markDirty()
          return query(args)
        },
      },
    },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Inicialización ANTES de servir la primera request (el cliente es perezoso:
// no abre el archivo hasta la primera consulta, que ocurre dentro de init)
await initDatabaseFile()
