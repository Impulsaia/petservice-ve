/**
 * Inspección rápida de la DB local (solo lectura) para depurar el flujo de reservas.
 * Uso: bun scripts/inspect-db.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const users = await db.user.findMany({
    select: { id: true, email: true, name: true, role: true, active: true },
    orderBy: { role: "asc" },
  });
  console.log("=== USERS ===");
  for (const u of users) console.log(`${u.role.padEnd(8)} ${u.email.padEnd(30)} ${u.name} active=${u.active} id=${u.id}`);

  const pets = await db.pet.findMany({ select: { id: true, name: true, species: true, ownerId: true } });
  console.log(`\n=== PETS (${pets.length}) ===`);
  for (const p of pets) console.log(`${p.name.padEnd(12)} ${p.species} owner=${p.ownerId} id=${p.id}`);

  const bookings = await db.booking.findMany({
    select: { id: true, code: true, status: true, clientId: true, providerId: true, petId: true, serviceId: true, scheduledAt: true, priceUsd: true },
    orderBy: { scheduledAt: "desc" },
  });
  console.log(`\n=== BOOKINGS (${bookings.length}) ===`);
  for (const b of bookings) console.log(`${b.code} ${b.status.padEnd(15)} client=${b.clientId} provider=${b.providerId} pet=${b.petId} sched=${b.scheduledAt.toISOString()}`);

  const payments = await db.payment.findMany({ select: { id: true, bookingId: true, method: true, status: true, amountUsd: true } });
  console.log(`\n=== PAYMENTS (${payments.length}) ===`);
  for (const p of payments) console.log(`${p.status.padEnd(11)} ${p.method.padEnd(13)} $${p.amountUsd} booking=${p.bookingId}`);

  const providers = await db.provider.findMany({ select: { id: true, businessName: true, city: true, userId: true }, take: 8 });
  console.log("\n=== PROVIDERS (first 8) ===");
  for (const p of providers) console.log(`${p.businessName.padEnd(30)} ${p.city} user=${p.userId} id=${p.id}`);
}

main().finally(() => db.$disconnect());
