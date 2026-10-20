import { PrismaClient } from '@prisma/client'
import { existsSync, renameSync, writeFileSync } from 'fs'
import { DEMO_DB_BASE64 } from './petservice/demoDb'

/**
 * Modo DEMO para Vercel (serverless):
 * - /var/task es de solo lectura, pero /tmp es escribible por instancia.
 * - La SQLite sembrada viaja EMBEBIDA en el código (demoDb.ts, base64) y se
 *   escribe en /tmp durante el arranque en frío de cada instancia. Esto es
 *   determinista: no depende del file-tracing de Next/Vercel.
 * - Escrituras de demo funcionan por instancia; los datos se restauran al
 *   reciclarse. Para producción real: Turso/Neon o Railway (docs/despliegue.md).
 */
function resolveDemoDatabaseUrl(): string | undefined {
  if (process.env.VERCEL !== '1') return undefined
  if (!DEMO_DB_BASE64) return undefined
  try {
    const dst = '/tmp/petservice-demo.db'
    if (!existsSync(dst)) {
      // Escritura atómica: archivo temporal + rename para evitar DBs parciales
      const tmp = `/tmp/petservice-demo.$${process.pid}.tmp`
      writeFileSync(tmp, Buffer.from(DEMO_DB_BASE64, 'base64'))
      renameSync(tmp, dst)
    }
    return `file:${dst}`
  } catch {
    return undefined
  }
}

const demoDatabaseUrl = resolveDemoDatabaseUrl()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'],
    ...(demoDatabaseUrl ? { datasourceUrl: demoDatabaseUrl } : {}),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
