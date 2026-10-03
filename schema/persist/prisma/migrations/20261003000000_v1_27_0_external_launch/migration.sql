-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "externalLaunch" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ContentExternal" (
    "contentId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ContentExternal_pkey" PRIMARY KEY ("contentId","name")
);

-- AddForeignKey
ALTER TABLE "ContentExternal" ADD CONSTRAINT "ContentExternal_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

