-- AlterTable
ALTER TABLE "MinecraftServer" ADD COLUMN "lastRconCheckAt" DATETIME;
ALTER TABLE "MinecraftServer" ADD COLUMN "lastRconOnline" BOOLEAN;
ALTER TABLE "MinecraftServer" ADD COLUMN "rconPasswordEncrypted" TEXT;
ALTER TABLE "MinecraftServer" ADD COLUMN "rconPort" INTEGER;
