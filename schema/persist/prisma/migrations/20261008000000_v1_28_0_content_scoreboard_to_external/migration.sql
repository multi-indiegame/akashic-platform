-- WHY: ContentExternal の記録より前に投稿されたバージョンは行を持たない。scoreboard の宣言は
-- 列にしか残っていないため、列を消す前に行として移す (必須 / 任意は記録時の既定と同じく任意)
INSERT INTO "ContentExternal" ("contentId", "name", "required")
SELECT "id", 'scoreboard', false
FROM "Content"
WHERE "scoreboard"
ON CONFLICT DO NOTHING;

-- AlterTable
ALTER TABLE "Content" DROP COLUMN "scoreboard";
