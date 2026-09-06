-- CreateEnum
CREATE TYPE "RoomVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "TeamSide" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "RoomRole" AS ENUM ('HOST', 'TEAM_LEAD', 'MEMBER', 'SPECTATOR');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('PENDING', 'ACTIVE', 'REMOVED', 'BANNED');

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('LOBBY', 'READY', 'RUNNING', 'PAUSED', 'FINISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProgressType" AS ENUM ('WINS', 'POINTS', 'TASK');

-- CreateEnum
CREATE TYPE "AppliesTo" AS ENUM ('BOTH', 'TEAM_A', 'TEAM_B');

-- CreateEnum
CREATE TYPE "GameProgressStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "OverlayType" AS ENUM ('TEAM_COMPARISON', 'TEAM_A', 'TEAM_B', 'COMPACT', 'CURRENT_GAME', 'FULL_LIST', 'WINNER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'de',
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reduceMotion" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwitchConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "twitchLogin" TEXT NOT NULL,
    "twitchUserId" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwitchConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "passwordHash" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "maxMembersPerTeam" INTEGER NOT NULL DEFAULT 4,
    "startAt" TIMESTAMP(3),
    "timeLimitMinutes" INTEGER,
    "visibility" "RoomVisibility" NOT NULL DEFAULT 'PRIVATE',
    "allowMemberProgress" BOOLEAN NOT NULL DEFAULT true,
    "onlyTeamLeadEdits" BOOLEAN NOT NULL DEFAULT false,
    "requireHostConfirmation" BOOLEAN NOT NULL DEFAULT true,
    "requireJoinApproval" BOOLEAN NOT NULL DEFAULT false,
    "teamsLocked" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "side" "TeamSide" NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomMember" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "RoomRole" NOT NULL DEFAULT 'SPECTATOR',
    "teamId" TEXT,
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "isTeamLead" BOOLEAN NOT NULL DEFAULT false,
    "twitchLoginOverride" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomInvite" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "label" TEXT,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'LOBBY',
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "totalPausedMs" BIGINT NOT NULL DEFAULT 0,
    "endedAt" TIMESTAMP(3),
    "winnerTeamId" TEXT,
    "winnerConfirmedAt" TIMESTAMP(3),
    "pendingWinnerTeamId" TEXT,
    "pendingWinnerAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeGame" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "coverUrl" TEXT,
    "progressType" "ProgressType" NOT NULL DEFAULT 'WINS',
    "targetValue" INTEGER NOT NULL DEFAULT 1,
    "timeLimitMinutes" INTEGER,
    "rulesText" TEXT,
    "appliesTo" "AppliesTo" NOT NULL DEFAULT 'BOTH',
    "difficulty" INTEGER,
    "bonusPoints" INTEGER,
    "requireEvidence" BOOLEAN NOT NULL DEFAULT false,
    "requiresPreviousCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChallengeGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamGameProgress" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "status" "GameProgressStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastUpdatedById" TEXT,
    "lastUpdatedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TeamGameProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamGameProgressLog" (
    "id" TEXT NOT NULL,
    "progressId" TEXT NOT NULL,
    "actorId" TEXT,
    "delta" INTEGER NOT NULL,
    "previousValue" INTEGER NOT NULL,
    "newValue" INTEGER NOT NULL,
    "reverted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamGameProgressLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "progressId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "memberId" TEXT,
    "url" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OverlayConfiguration" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "type" "OverlayType" NOT NULL,
    "config" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OverlayConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OverlayToken" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "createdById" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OverlayToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "roomId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TwitchConnection_userId_key" ON "TwitchConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");

-- CreateIndex
CREATE INDEX "Room_hostId_idx" ON "Room"("hostId");

-- CreateIndex
CREATE INDEX "Team_roomId_idx" ON "Team"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_roomId_side_key" ON "Team"("roomId", "side");

-- CreateIndex
CREATE INDEX "RoomMember_roomId_idx" ON "RoomMember"("roomId");

-- CreateIndex
CREATE INDEX "RoomMember_userId_idx" ON "RoomMember"("userId");

-- CreateIndex
CREATE INDEX "RoomMember_teamId_idx" ON "RoomMember"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomMember_roomId_userId_key" ON "RoomMember"("roomId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomInvite_tokenHash_key" ON "RoomInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "RoomInvite_roomId_idx" ON "RoomInvite"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "Challenge_roomId_key" ON "Challenge"("roomId");

-- CreateIndex
CREATE INDEX "ChallengeGame_challengeId_idx" ON "ChallengeGame"("challengeId");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeGame_challengeId_order_key" ON "ChallengeGame"("challengeId", "order");

-- CreateIndex
CREATE INDEX "TeamGameProgress_teamId_idx" ON "TeamGameProgress"("teamId");

-- CreateIndex
CREATE INDEX "TeamGameProgress_gameId_idx" ON "TeamGameProgress"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamGameProgress_gameId_teamId_key" ON "TeamGameProgress"("gameId", "teamId");

-- CreateIndex
CREATE INDEX "TeamGameProgressLog_progressId_idx" ON "TeamGameProgressLog"("progressId");

-- CreateIndex
CREATE INDEX "Evidence_progressId_idx" ON "Evidence"("progressId");

-- CreateIndex
CREATE INDEX "ActivityEvent_roomId_createdAt_idx" ON "ActivityEvent"("roomId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OverlayConfiguration_roomId_type_key" ON "OverlayConfiguration"("roomId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "OverlayToken_tokenHash_key" ON "OverlayToken"("tokenHash");

-- CreateIndex
CREATE INDEX "OverlayToken_roomId_idx" ON "OverlayToken"("roomId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_roomId_idx" ON "Notification"("roomId");

-- AddForeignKey
ALTER TABLE "TwitchConnection" ADD CONSTRAINT "TwitchConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomInvite" ADD CONSTRAINT "RoomInvite_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomInvite" ADD CONSTRAINT "RoomInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeGame" ADD CONSTRAINT "ChallengeGame_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamGameProgress" ADD CONSTRAINT "TeamGameProgress_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "ChallengeGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamGameProgress" ADD CONSTRAINT "TeamGameProgress_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamGameProgressLog" ADD CONSTRAINT "TeamGameProgressLog_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "TeamGameProgress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamGameProgressLog" ADD CONSTRAINT "TeamGameProgressLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "TeamGameProgress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "RoomMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverlayConfiguration" ADD CONSTRAINT "OverlayConfiguration_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverlayToken" ADD CONSTRAINT "OverlayToken_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverlayToken" ADD CONSTRAINT "OverlayToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
