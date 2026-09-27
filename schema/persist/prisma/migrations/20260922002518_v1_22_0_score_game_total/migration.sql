-- CreateTable
CREATE TABLE "ScoreGameTotal" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "maxValue" DOUBLE PRECISION,
    "maxAt" TIMESTAMP(3),
    "minValue" DOUBLE PRECISION,
    "minAt" TIMESTAMP(3),
    "sum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "count" INTEGER NOT NULL DEFAULT 0,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "trueCount" INTEGER NOT NULL DEFAULT 0,
    "lastValue" DOUBLE PRECISION,
    "lastAt" TIMESTAMP(3),
    "lastStr" TEXT,
    "lastBool" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreGameTotal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScoreGameTotal_gameId_key_key" ON "ScoreGameTotal"("gameId", "key");

-- AddForeignKey
ALTER TABLE "ScoreGameTotal" ADD CONSTRAINT "ScoreGameTotal_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
