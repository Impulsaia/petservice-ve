/**
 * Limpia el usuario QA temporal usado por los smoke tests.
 * Uso: bun scripts/cleanup-qa.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const u = await db.user.findUnique({ where: { email: "qa.temp@demo.ve" } });
  if (!u) {
    console.log("Sin usuario QA que limpiar");
    return;
  }
  // Reservas de la mascota QA: la mascota se borró en el test, no debería haber nada
  const deletedResets = await db.passwordReset.deleteMany({ where: { userId: u.id } });
  await db.notification.deleteMany({ where: { userId: u.id } });
  await db.user.delete({ where: { id: u.id } });
  console.log(`✅ Usuario QA eliminado (passwordResets borrados: ${deletedResets.count})`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
