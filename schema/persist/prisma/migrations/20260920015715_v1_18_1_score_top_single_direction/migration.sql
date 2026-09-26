/*
  Warnings:

  - You are about to drop the column `direction` on the `ScoreTopEntry` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "ScoreTopEntry_asc_idx";

-- DropIndex
DROP INDEX "ScoreTopEntry_desc_idx";

-- AlterTable
ALTER TABLE "ScoreTopEntry" DROP COLUMN "direction";

-- CreateIndex
CREATE INDEX "ScoreTopEntry_desc_idx" ON "ScoreTopEntry"("gameId", "key", "value" DESC, "endedAt");

-- CreateIndex
CREATE INDEX "ScoreTopEntry_asc_idx" ON "ScoreTopEntry"("gameId", "key", "value" ASC, "endedAt");
