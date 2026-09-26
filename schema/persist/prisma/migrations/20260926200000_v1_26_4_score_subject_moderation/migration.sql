-- AlterEnum
ALTER TYPE "ReportTargetType" ADD VALUE 'SCORE_SUBJECT';

-- CreateIndex
CREATE INDEX "PlayParticipant_playerId_idx" ON "PlayParticipant"("playerId");
