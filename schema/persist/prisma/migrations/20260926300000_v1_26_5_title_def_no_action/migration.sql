-- DropForeignKey
ALTER TABLE "ScoreTitle" DROP CONSTRAINT "ScoreTitle_defId_fkey";

-- AddForeignKey
ALTER TABLE "ScoreTitle" ADD CONSTRAINT "ScoreTitle_defId_fkey" FOREIGN KEY ("defId") REFERENCES "ScoreTitleDef"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
