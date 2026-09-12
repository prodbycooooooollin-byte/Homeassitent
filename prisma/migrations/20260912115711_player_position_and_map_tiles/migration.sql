-- AlterTable
ALTER TABLE "MinecraftAccount" ADD COLUMN "posDimension" TEXT;
ALTER TABLE "MinecraftAccount" ADD COLUMN "posUpdatedAt" DATETIME;
ALTER TABLE "MinecraftAccount" ADD COLUMN "posX" REAL;
ALTER TABLE "MinecraftAccount" ADD COLUMN "posY" REAL;
ALTER TABLE "MinecraftAccount" ADD COLUMN "posZ" REAL;

-- AlterTable
ALTER TABLE "MinecraftServer" ADD COLUMN "mapTileUrlTemplate" TEXT;
