import { PrismaClient } from "@prisma/client";

// Standard Next.js-Singleton-Pattern: verhindert, dass im Dev-Modus bei
// jedem Hot-Reload eine neue PrismaClient-Instanz (und damit ein neuer
// Connection-Pool) entsteht.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
