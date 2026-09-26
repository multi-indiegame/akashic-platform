import type { ScoreFieldSetting } from "@multi-indiegame/scoreboard-schema";

/**
 * 複数ランクインの上位 N 件の持ち方が変わるか。
 *
 * WHY: 積み直すと生レコードより前の上位記録を失うので、必要なときに限る。
 * 見出し・単位・代表値は表示時の選び方が変わるだけで、積み方には効かない。
 * 1 人 1 件だけのキーは主体ごとの歴代から引くので、向きを変えても積み直さない
 *
 * WHY: 編集画面で保存前に知らせるため、サーバーと同じ判定をクライアントでも使う
 */
export function affectsTopEntries(
    before: ScoreFieldSetting,
    after: ScoreFieldSetting,
): boolean {
    if (before.dedupe !== after.dedupe) {
        return true;
    }
    return after.dedupe === "all" && before.direction !== after.direction;
}
