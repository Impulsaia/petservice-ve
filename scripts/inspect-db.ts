/**
 * Script temporal de inspección de la DB demo (se borra al final).
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const cities = await db.provider.groupBy({ by: ["city"], _count: { city: true } });
  console.log("PROVIDER CITIES:", JSON.stringify(cities));
  console.log("USERS:", await db.user.count());
  console.log("PETS:", await db.pet.count());
  console.log("BOOKINGS:", await db.booking.count());
  console.log("SERVICES:", await db.service.count());

  // Muestra de usuarios para identificar cuentas demo
  const sampleUsers = await db.user.findMany({
    select: { email: true, role: true, name: true, phone: true },
    take: 50,
  });
  for (const u of sampleUsers) console.log("USER:", u.email, "|", u.role, "|", u.name, "|", u.phone);

  // Booking con clientId + providerId + phone para CRM backfill
  const bookings = await db.booking.findMany({
    select: { id: true, clientId: true, providerId: true, priceUsd: true, status: true, scheduledAt: true, client: { select: { name: true, phone: true } } },
    take: 5,
  });
  console.log("SAMPLE BOOKINGS:", JSON.stringify(bookings, null, 1));
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
