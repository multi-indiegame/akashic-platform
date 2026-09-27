-- CreateTable
CREATE TABLE "PlayParticipant" (
    "id" SERIAL NOT NULL,
    "playId" INTEGER NOT NULL,
    "playerId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "userId" TEXT,
    "nameConsent" BOOLEAN NOT NULL DEFAULT false,
    "guestName" TEXT,
    "isGameMaster" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayParticipant_playId_idx" ON "PlayParticipant"("playId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayParticipant_playId_playerId_key" ON "PlayParticipant"("playId", "playerId");

-- AddForeignKey
ALTER TABLE "PlayParticipant" ADD CONSTRAINT "PlayParticipant_playId_fkey" FOREIGN KEY ("playId") REFERENCES "Play"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayParticipant" ADD CONSTRAINT "PlayParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
