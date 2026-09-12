import { PrismaClient } from "@prisma/client";

// Standard-Singleton-Pattern für Prisma unter Next.js Hot-Reload (verhindert
// zu viele offene SQLite-Verbindungen im Dev-Modus).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
