-- CreateTable
CREATE TABLE "ScoreTopEntry" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "recordId" INTEGER,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreTopEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScoreTopEntry_desc_idx" ON "ScoreTopEntry"("gameId", "key", "direction", "value" DESC, "endedAt");

-- CreateIndex
CREATE INDEX "ScoreTopEntry_asc_idx" ON "ScoreTopEntry"("gameId", "key", "direction", "value" ASC, "endedAt");

-- CreateIndex
CREATE INDEX "ScoreTopEntry_subjectKey_idx" ON "ScoreTopEntry"("subjectKey");

-- AddForeignKey
ALTER TABLE "ScoreTopEntry" ADD CONSTRAINT "ScoreTopEntry_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
