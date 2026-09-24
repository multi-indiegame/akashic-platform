-- CreateTable
CREATE TABLE "ScoreSubject" (
    "subjectKey" TEXT NOT NULL,
    "userId" TEXT,
    "guestName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreSubject_pkey" PRIMARY KEY ("subjectKey")
);

-- CreateTable
CREATE TABLE "ScoreBest" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "maxValue" DOUBLE PRECISION,
    "maxAt" TIMESTAMP(3),
    "minValue" DOUBLE PRECISION,
    "minAt" TIMESTAMP(3),
    "sum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastValue" DOUBLE PRECISION,
    "lastAt" TIMESTAMP(3),
    "lastStr" TEXT,
    "lastBool" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreBest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScorePlayCount" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScorePlayCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScoreSubject_userId_idx" ON "ScoreSubject"("userId");

-- CreateIndex
CREATE INDEX "ScoreBest_gameId_key_maxValue_idx" ON "ScoreBest"("gameId", "key", "maxValue" DESC);

-- CreateIndex
CREATE INDEX "ScoreBest_gameId_key_minValue_idx" ON "ScoreBest"("gameId", "key", "minValue" ASC);

-- CreateIndex
CREATE INDEX "ScoreBest_subjectKey_idx" ON "ScoreBest"("subjectKey");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreBest_gameId_key_subjectKey_key" ON "ScoreBest"("gameId", "key", "subjectKey");

-- CreateIndex
CREATE INDEX "ScorePlayCount_gameId_count_idx" ON "ScorePlayCount"("gameId", "count" DESC);

-- CreateIndex
CREATE INDEX "ScorePlayCount_subjectKey_idx" ON "ScorePlayCount"("subjectKey");

-- CreateIndex
CREATE UNIQUE INDEX "ScorePlayCount_gameId_subjectKey_key" ON "ScorePlayCount"("gameId", "subjectKey");

-- AddForeignKey
ALTER TABLE "ScoreBest" ADD CONSTRAINT "ScoreBest_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScorePlayCount" ADD CONSTRAINT "ScorePlayCount_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
