-- Slash command registry and interactions (docs/features/bot-gateway-and-slash-commands.md, phase 3).
-- Additive only: two new tables and one new enum; no existing column touched, no backfill.
--
-- down(): DROP TABLE "Interaction"; DROP TABLE "SlashCommand"; DROP TYPE "InteractionStatus";
-- (data-destroying: any in-flight interaction and every command registration is lost.)

-- CreateEnum
CREATE TYPE "InteractionStatus" AS ENUM ('PENDING', 'RESPONDED', 'TIMED_OUT');

-- CreateTable
CREATE TABLE "SlashCommand" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlashCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "invokerUserId" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "status" "InteractionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlashCommand_botId_idx" ON "SlashCommand"("botId");

-- CreateIndex
CREATE UNIQUE INDEX "SlashCommand_serverId_name_key" ON "SlashCommand"("serverId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Interaction_token_key" ON "Interaction"("token");

-- CreateIndex
CREATE INDEX "Interaction_botId_status_idx" ON "Interaction"("botId", "status");

-- AddForeignKey
ALTER TABLE "SlashCommand" ADD CONSTRAINT "SlashCommand_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlashCommand" ADD CONSTRAINT "SlashCommand_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "SlashCommand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
