// Wird von `npm run db:seed` bzw. automatisch nach `prisma migrate dev`
// ausgeführt. Die eigentliche Demo-Datengenerierung folgt in
// lib/demo/seed-demo-data.ts (Schritt "Demo-Modus"); hier nur der
// minimale Bootstrap, der immer laufen darf (Singleton-Settings-Zeile).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", demoModeEnabled: true },
  });
  console.log("Seed: AppSettings-Singleton sichergestellt.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
