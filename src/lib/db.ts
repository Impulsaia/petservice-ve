import { PrismaClient } from '@prisma/client'
import { copyFileSync, existsSync } from 'fs'
import path from 'path'

/**
 * Modo DEMO para Vercel (serverless):
 * - /var/task es de solo lectura, pero /tmp es escribible por instancia.
 * - La SQLite sembrada viaja dentro del bundle (ver outputFileTracingIncludes en
 *   next.config.ts) y se copia a /tmp en el arranque en frío de cada instancia.
 * - Ideal para demo/presentación. Para producción real: Turso/Neon o Railway
 *   (ver docs/despliegue.md).
 */
function resolveDemoDatabaseUrl(): string | undefined {
  if (process.env.VERCEL !== '1') return undefined
  const source = process.env.DEMO_DB_SOURCE
  if (!source) return undefined
  try {
    const srcPath = path.isAbsolute(source) ? source : path.join(process.cwd(), source)
    const dst = '/tmp/petservice-demo.db'
    if (!existsSync(dst) && existsSync(srcPath)) {
      copyFileSync(srcPath, dst)
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
