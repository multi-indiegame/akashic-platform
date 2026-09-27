-- CreateTable
CREATE TABLE "ScoreboardArchive" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "formatVersion" INTEGER NOT NULL,
    "s3Key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreboardArchive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScoreboardArchive_gameId_month_idx" ON "ScoreboardArchive"("gameId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreboardArchive_gameId_month_key" ON "ScoreboardArchive"("gameId", "month");

-- AddForeignKey
ALTER TABLE "ScoreboardArchive" ADD CONSTRAINT "ScoreboardArchive_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
