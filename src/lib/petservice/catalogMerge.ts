import { PrismaClient } from '@prisma/client'
import { existsSync, renameSync, writeFileSync } from 'fs'
import { DEMO_DB_BASE64, DEMO_DB_HASH } from './demoDb'

/**
 * Fusión de catálogo entre el deploy (demoDb embebida) y la DB en producción
 * (blob compartido). Se ejecuta una vez por arranque en frío SOLO cuando el
 * hash de los datos sembrados cambió.
 *
 * Reglas (sin excepciones):
 *  - NUNCA se tocan contraseñas, emails ni datos de usuarios existentes.
 *  - NUNCA se borra nada: las reservas, pagos, mascotas, reseñas, CRM,
 *    notificaciones y eventos de calendario de producción son intocables.
 *  - Los negocios con source="MANUAL" (creados por usuarios reales) solo se
 *    INSERTAN si no existen; jamás se sobreescriben.
 *  - Catálogo importado (OSM/BOLIVAR/ZONA): se actualizan solo campos
 *    geográficos/ comerciales, nunca estado (status/badges/avatar) que pudo
 *    cambiar en producción.
 *  - Servicios/FAQ: solo se INSERTAN si faltan (las ediciones del
 *    admin en producción ganan).
 *  - Sectores: se insertan si faltan y se refresca su metadata geográfica
 *    (ciudad/parroquia/coords); nombre y estado activo los manda producción.
 */

const SEED_PATH = '/tmp/petservice-seed.db'

type AnyDb = any

function extractSeedFileSync(): boolean {
  if (!DEMO_DB_BASE64) return false
  try {
    if (existsSync(SEED_PATH)) return true
    const tmp = `/tmp/petservice-seed.$${process.pid}.tmp`
    writeFileSync(tmp, Buffer.from(DEMO_DB_BASE64, 'base64'))
    renameSync(tmp, SEED_PATH)
    return true
  } catch {
    return false
  }
}

export async function mergeCatalogIfNewer(db0: AnyDb): Promise<boolean> {
  if (!DEMO_DB_BASE64 || !DEMO_DB_HASH) return false

  // Tabla de metadatos de la DB en producción
  await db0.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_Meta" ("key" TEXT PRIMARY KEY, "value" TEXT)`)
  const metaRows = (await db0.$queryRawUnsafe<{ value: string }[]>(
    `SELECT value FROM "_Meta" WHERE key = 'dataHash'`
  )) as { value: string }[]
  const storedHash = metaRows?.[0]?.value ?? ''
  if (storedHash === DEMO_DB_HASH) return false

  if (!extractSeedFileSync()) return false

  const seed = new PrismaClient({ datasourceUrl: `file:${SEED_PATH}`, log: ['error'] })

  try {
    // 1) Usuarios: SOLO crear los que faltan (jamás actualizar → claves intactas)
    const seedUsers = await seed.user.findMany()
    const mainUserIds = new Set((await db0.user.findMany({ select: { id: true } })).map((u) => u.id))
    for (const u of seedUsers) {
      if (mainUserIds.has(u.id)) continue
      await db0.user.create({
        data: {
          id: u.id, email: u.email, phone: u.phone, name: u.name, role: u.role,
          passwordHash: u.passwordHash, googleId: u.googleId, avatarUrl: u.avatarUrl,
          active: u.active, createdAt: u.createdAt,
        },
      })
    }

    // 2) Ciudades: upsert (catálogo geográfico)
    for (const c of await seed.city.findMany()) {
      await db0.city.upsert({
        where: { id: c.id },
        create: { id: c.id, name: c.name, state: c.state, lat: c.lat, lng: c.lng, active: c.active },
        update: { name: c.name, state: c.state, lat: c.lat, lng: c.lng, active: c.active },
      })
    }

    // 3) Sectores: insertar los que faltan + refrescar la metadata geográfica
    //    (ciudad/parroquia/coords) de los existentes. `name` y `active` se
    //    respetan tal cual los dejó el admin en producción.
    const mainSectorIds = new Set((await db0.sector.findMany({ select: { id: true } })).map((s) => s.id))
    for (const s of await seed.sector.findMany()) {
      if (mainSectorIds.has(s.id)) {
        await db0.sector.update({
          where: { id: s.id },
          data: { cityName: s.cityName, zone: s.zone, lat: s.lat, lng: s.lng },
        })
        continue
      }
      await db0.sector.create({
        data: { id: s.id, cityName: s.cityName, name: s.name, zone: s.zone, lat: s.lat, lng: s.lng, active: s.active },
      })
    }

    // 4) Prestadores: MANUAL → solo insertar; importados → refresco geográfico
    const seedProviders = await seed.provider.findMany()
    for (const p of seedProviders) {
      const exists = await db0.provider.findUnique({ where: { id: p.id }, select: { id: true, bookingFlowJson: true } })
      if (!exists) {
        await db0.provider.create({
          data: {
            id: p.id, userId: p.userId, businessName: p.businessName, bio: p.bio, status: p.status,
            city: p.city, zoneName: p.zoneName, lat: p.lat, lng: p.lng, radiusKm: p.radiusKm,
            scheduleJson: p.scheduleJson, ratingAvg: p.ratingAvg, ratingCount: p.ratingCount,
            googleRating: p.googleRating, googleReviews: p.googleReviews, badges: p.badges,
            avatarUrl: p.avatarUrl, instagram: p.instagram, facebook: p.facebook, tiktok: p.tiktok,
            website: p.website, source: p.source, newUntil: p.newUntil,
            bookingFlowJson: p.bookingFlowJson, suspensionNote: p.suspensionNote,
          },
        })
        continue
      }
      if (p.source !== 'MANUAL') {
        // Refresco de catálogo: nunca status/badges/avatar/redes/newUntil (producción manda)
        // bookingFlowJson: contenido sembrado — se copia solo si en producción aún no existe
        await db0.provider.update({
          where: { id: p.id },
          data: {
            businessName: p.businessName, bio: p.bio, city: p.city, zoneName: p.zoneName,
            lat: p.lat, lng: p.lng, radiusKm: p.radiusKm,
            googleRating: p.googleRating, googleReviews: p.googleReviews, source: p.source,
            ...(p.bookingFlowJson && !exists.bookingFlowJson ? { bookingFlowJson: p.bookingFlowJson } : {}),
          },
        })
      }
    }

    // 5) Servicios: solo insertar los que faltan (precios editados en producción ganan)
    const mainServiceIds = new Set((await db0.service.findMany({ select: { id: true } })).map((x) => x.id))
    for (const s of await seed.service.findMany()) {
      if (mainServiceIds.has(s.id)) continue
      await db0.service.create({
        data: {
          id: s.id, providerId: s.providerId, category: s.category, name: s.name,
          description: s.description, durationMin: s.durationMin, priceUsd: s.priceUsd,
          priceToUsd: s.priceToUsd, modality: s.modality, petTypes: s.petTypes, petSizes: s.petSizes,
          extrasJson: s.extrasJson, active: s.active,
        },
      })
    }

    // 6) FAQ del asistente: solo insertar las que faltan
    const mainFaqIds = new Set((await db0.firulaisEntry.findMany({ select: { id: true } })).map((f) => f.id))
    for (const f of await seed.firulaisEntry.findMany()) {
      if (mainFaqIds.has(f.id)) continue
      await db0.firulaisEntry.create({
        data: { id: f.id, question: f.question, answer: f.answer, keywords: f.keywords, active: f.active },
      })
    }

    // 7) Settings: solo si no existen
    const mainSettings = await db0.settings.findUnique({ where: { id: 'main' } })
    if (!mainSettings) {
      const s = await seed.settings.findUnique({ where: { id: 'main' } })
      if (s) {
        await db0.settings.create({
          data: {
            id: 'main', usdToBs: s.usdToBs, commissionPct: s.commissionPct,
            defaultRadiusKm: s.defaultRadiusKm, usdToBsSource: s.usdToBsSource,
            usdToBsUpdatedAt: s.usdToBsUpdatedAt, autoRate: s.autoRate, gmapsApiKey: s.gmapsApiKey,
          },
        })
      }
    }

    // Marca la versión de datos fusionada
    await db0.$executeRawUnsafe(
      `INSERT INTO "_Meta" ("key","value") VALUES ('dataHash', ?)
       ON CONFLICT("key") DO UPDATE SET "value" = excluded."value"`,
      DEMO_DB_HASH
    )
    return true
  } finally {
    try { await seed.$disconnect() } catch { /* noop */ }
  }
}
