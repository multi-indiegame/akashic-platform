-- CreateTable
CREATE TABLE "ScoreRecord" (
    "id" SERIAL NOT NULL,
    "playId" INTEGER NOT NULL,
    "playerId" TEXT,
    "gameId" INTEGER NOT NULL,
    "contentId" INTEGER NOT NULL,
    "subjectKey" TEXT,
    "reflectedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3) NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreValue" (
    "id" SERIAL NOT NULL,
    "recordId" INTEGER NOT NULL,
    "gameId" INTEGER NOT NULL,
    "contentId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "numValue" DOUBLE PRECISION,
    "strValue" TEXT,
    "boolValue" BOOLEAN,
    "subjectKey" TEXT,
    "endedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScoreRecord_gameId_endedAt_idx" ON "ScoreRecord"("gameId", "endedAt");

-- CreateIndex
-- 同じプレイの同じプレイヤーは 1 行に保つ。部屋そのものの記録は playerId が
-- NULL なので、NULL 同士も等価に扱う NULLS NOT DISTINCT を使う（PostgreSQL 15+）。
-- Prisma は NULLS 節を扱わないので schema.prisma 側は素の @@unique（同名）として
-- 保持され drift は出ない。
CREATE UNIQUE INDEX "ScoreRecord_play_player_key" ON "ScoreRecord"("playId", "playerId") NULLS NOT DISTINCT;

-- CreateIndex
CREATE INDEX "ScoreValue_recordId_idx" ON "ScoreValue"("recordId");

-- CreateIndex
CREATE INDEX "ScoreValue_gameId_key_numValue_idx" ON "ScoreValue"("gameId", "key", "numValue" DESC);

-- CreateIndex
CREATE INDEX "ScoreValue_gameId_key_endedAt_idx" ON "ScoreValue"("gameId", "key", "endedAt" DESC);

-- CreateIndex
CREATE INDEX "ScoreValue_subjectKey_gameId_key_idx" ON "ScoreValue"("subjectKey", "gameId", "key");

-- AddForeignKey
ALTER TABLE "ScoreRecord" ADD CONSTRAINT "ScoreRecord_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreValue" ADD CONSTRAINT "ScoreValue_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ScoreRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreValue" ADD CONSTRAINT "ScoreValue_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
