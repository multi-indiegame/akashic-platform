-- AlterTable
ALTER TABLE "ScoreBest" ADD COLUMN     "recordCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trueCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ScoreboardFormat" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreboardFormat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScoreboardFormat_gameId_effectiveFrom_idx" ON "ScoreboardFormat"("gameId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreboardFormat_gameId_version_key" ON "ScoreboardFormat"("gameId", "version");

-- AddForeignKey
ALTER TABLE "ScoreboardFormat" ADD CONSTRAINT "ScoreboardFormat_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
