-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LinkCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LinkCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MinecraftAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "uuid" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "userId" TEXT,
    "firstSeenAt" DATETIME,
    "lastSeenAt" DATETIME,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MinecraftAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MinecraftServer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 25565,
    "minecraftVersion" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "foundedAt" DATETIME,
    "lastStartedAt" DATETIME,
    "setupCompletedAt" DATETIME,
    "lastSlpCheckAt" DATETIME,
    "lastSlpOnline" BOOLEAN,
    "lastSlpPlayers" INTEGER,
    "lastSlpMaxPlayers" INTEGER,
    "lastSlpMotd" TEXT,
    "lastSlpVersion" TEXT,
    "lastSlpLatencyMs" INTEGER,
    "agentApiKeyHash" TEXT,
    "agentKeyGeneratedAt" DATETIME,
    "lastAgentContactAt" DATETIME,
    "reportedCapabilities" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StatusSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "online" BOOLEAN NOT NULL,
    "playersOnline" INTEGER,
    "playersMax" INTEGER,
    "motd" TEXT,
    "latencyMs" INTEGER,
    "source" TEXT NOT NULL,
    CONSTRAINT "StatusSnapshot_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "MinecraftServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServerHealthSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tps" REAL,
    "tickTimeMs" REAL,
    "memoryUsedMb" INTEGER,
    "memoryMaxMb" INTEGER,
    "playerCount" INTEGER,
    CONSTRAINT "ServerHealthSnapshot_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "MinecraftServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerStatSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "minecraftAccountId" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "playtimeTicks" INTEGER NOT NULL,
    "blocksMinedTotal" INTEGER NOT NULL,
    "mobKillsTotal" INTEGER NOT NULL,
    "deathsTotal" INTEGER NOT NULL,
    CONSTRAINT "PlayerStatSnapshot_minecraftAccountId_fkey" FOREIGN KEY ("minecraftAccountId") REFERENCES "MinecraftAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerBlockStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "minecraftAccountId" TEXT NOT NULL,
    "blockKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerBlockStat_minecraftAccountId_fkey" FOREIGN KEY ("minecraftAccountId") REFERENCES "MinecraftAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerMobStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "minecraftAccountId" TEXT NOT NULL,
    "mobKey" TEXT NOT NULL,
    "kills" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerMobStat_minecraftAccountId_fkey" FOREIGN KEY ("minecraftAccountId") REFERENCES "MinecraftAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerDistanceStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "minecraftAccountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cm" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerDistanceStat_minecraftAccountId_fkey" FOREIGN KEY ("minecraftAccountId") REFERENCES "MinecraftAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerAdvancement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "minecraftAccountId" TEXT NOT NULL,
    "advancementKey" TEXT NOT NULL,
    "unlockedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerAdvancement_minecraftAccountId_fkey" FOREIGN KEY ("minecraftAccountId") REFERENCES "MinecraftAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "minecraftAccountId" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL,
    "leftAt" DATETIME,
    CONSTRAINT "PlayerSession_minecraftAccountId_fkey" FOREIGN KEY ("minecraftAccountId") REFERENCES "MinecraftAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeathEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "minecraftAccountId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "message" TEXT,
    "x" REAL,
    "y" REAL,
    "z" REAL,
    "dimension" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeathEvent_minecraftAccountId_fkey" FOREIGN KEY ("minecraftAccountId") REFERENCES "MinecraftAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServerEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isAutomatic" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerEvent_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "MinecraftServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServerEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Modpack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "iconUrl" TEXT,
    "modrinthProjectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Modpack_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "MinecraftServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModpackVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modpackId" TEXT NOT NULL,
    "versionNumber" TEXT NOT NULL,
    "minecraftVersion" TEXT NOT NULL,
    "loader" TEXT NOT NULL,
    "changelog" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "fileName" TEXT,
    "filePath" TEXT,
    "fileSizeBytes" INTEGER,
    "modrinthVersionId" TEXT,
    "modrinthDownloadUrl" TEXT,
    "modList" TEXT,
    "releasedAt" DATETIME,
    "publishedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModpackVersion_modpackId_fkey" FOREIGN KEY ("modpackId") REFERENCES "Modpack" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ModpackVersion_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MapMarker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL,
    "z" REAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'SERVER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MapMarker_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "MinecraftServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MapMarker_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MapDrawing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "points" TEXT NOT NULL,
    "text" TEXT,
    "color" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'SERVER',
    "layerName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MapDrawing_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "MinecraftServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MapDrawing_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Portal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL,
    "z" REAL NOT NULL,
    "linkedPortalId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Portal_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "MinecraftServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Portal_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Portal_linkedPortalId_fkey" FOREIGN KEY ("linkedPortalId") REFERENCES "Portal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BuildProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "dimension" TEXT,
    "x" REAL,
    "y" REAL,
    "z" REAL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BuildProject_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "MinecraftServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BuildProject_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "BuildProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "assigneeUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "BuildProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectTask_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "needed" INTEGER NOT NULL,
    "gathered" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ProjectMaterial_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "BuildProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServerGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metric" TEXT NOT NULL,
    "target" REAL NOT NULL,
    "startAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerGoal_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "MinecraftServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServerGoal_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "demoModeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkCode_code_key" ON "LinkCode"("code");

-- CreateIndex
CREATE INDEX "LinkCode_userId_idx" ON "LinkCode"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MinecraftAccount_uuid_key" ON "MinecraftAccount"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "MinecraftAccount_userId_key" ON "MinecraftAccount"("userId");

-- CreateIndex
CREATE INDEX "MinecraftAccount_username_idx" ON "MinecraftAccount"("username");

-- CreateIndex
CREATE INDEX "StatusSnapshot_serverId_capturedAt_idx" ON "StatusSnapshot"("serverId", "capturedAt");

-- CreateIndex
CREATE INDEX "ServerHealthSnapshot_serverId_capturedAt_idx" ON "ServerHealthSnapshot"("serverId", "capturedAt");

-- CreateIndex
CREATE INDEX "PlayerStatSnapshot_minecraftAccountId_capturedAt_idx" ON "PlayerStatSnapshot"("minecraftAccountId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerBlockStat_minecraftAccountId_blockKey_key" ON "PlayerBlockStat"("minecraftAccountId", "blockKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerMobStat_minecraftAccountId_mobKey_key" ON "PlayerMobStat"("minecraftAccountId", "mobKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerDistanceStat_minecraftAccountId_type_key" ON "PlayerDistanceStat"("minecraftAccountId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerAdvancement_minecraftAccountId_advancementKey_key" ON "PlayerAdvancement"("minecraftAccountId", "advancementKey");

-- CreateIndex
CREATE INDEX "PlayerSession_minecraftAccountId_joinedAt_idx" ON "PlayerSession"("minecraftAccountId", "joinedAt");

-- CreateIndex
CREATE INDEX "DeathEvent_minecraftAccountId_occurredAt_idx" ON "DeathEvent"("minecraftAccountId", "occurredAt");

-- CreateIndex
CREATE INDEX "ServerEvent_serverId_occurredAt_idx" ON "ServerEvent"("serverId", "occurredAt");

-- CreateIndex
CREATE INDEX "ModpackVersion_modpackId_isCurrent_idx" ON "ModpackVersion"("modpackId", "isCurrent");

-- CreateIndex
CREATE INDEX "MapMarker_serverId_dimension_idx" ON "MapMarker"("serverId", "dimension");

-- CreateIndex
CREATE INDEX "MapDrawing_serverId_dimension_idx" ON "MapDrawing"("serverId", "dimension");

-- CreateIndex
CREATE UNIQUE INDEX "Portal_linkedPortalId_key" ON "Portal"("linkedPortalId");

-- CreateIndex
CREATE INDEX "Portal_serverId_dimension_idx" ON "Portal"("serverId", "dimension");

-- CreateIndex
CREATE INDEX "BuildProject_serverId_status_idx" ON "BuildProject"("serverId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");
