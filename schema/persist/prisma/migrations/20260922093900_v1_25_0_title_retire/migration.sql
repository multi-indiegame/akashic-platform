-- DropForeignKey
ALTER TABLE "ScoreTitle" DROP CONSTRAINT "ScoreTitle_defId_fkey";

-- AlterTable
ALTER TABLE "ScoreTitleDef" ADD COLUMN     "retiredAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "ScoreTitle" ADD CONSTRAINT "ScoreTitle_defId_fkey" FOREIGN KEY ("defId") REFERENCES "ScoreTitleDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
