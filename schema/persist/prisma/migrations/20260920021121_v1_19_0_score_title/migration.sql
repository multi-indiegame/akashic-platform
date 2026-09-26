-- CreateEnum
CREATE TYPE "ScoreTitleRank" AS ENUM ('NONE', 'BRONZE', 'SILVER', 'GOLD');

-- CreateTable
CREATE TABLE "ScoreTitleDef" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "rank" "ScoreTitleRank" NOT NULL DEFAULT 'NONE',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "imageKey" TEXT,
    "overlayRank" BOOLEAN NOT NULL DEFAULT false,
    "condition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreTitleDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreTitle" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" INTEGER NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "rank" "ScoreTitleRank" NOT NULL,
    "defId" INTEGER NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pinnedOrder" INTEGER,

    CONSTRAINT "ScoreTitle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScoreTitleDef_gameId_priority_idx" ON "ScoreTitleDef"("gameId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreTitleDef_gameId_categoryKey_rank_key" ON "ScoreTitleDef"("gameId", "categoryKey", "rank");

-- CreateIndex
CREATE INDEX "ScoreTitle_userId_gameId_idx" ON "ScoreTitle"("userId", "gameId");

-- CreateIndex
CREATE INDEX "ScoreTitle_gameId_idx" ON "ScoreTitle"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreTitle_userId_gameId_categoryKey_key" ON "ScoreTitle"("userId", "gameId", "categoryKey");

-- AddForeignKey
ALTER TABLE "ScoreTitleDef" ADD CONSTRAINT "ScoreTitleDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreTitle" ADD CONSTRAINT "ScoreTitle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreTitle" ADD CONSTRAINT "ScoreTitle_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreTitle" ADD CONSTRAINT "ScoreTitle_defId_fkey" FOREIGN KEY ("defId") REFERENCES "ScoreTitleDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;
