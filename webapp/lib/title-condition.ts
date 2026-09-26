import type { TitleCondition } from "@multi-indiegame/scoreboard-schema";

export interface TitleFieldNames {
    [key: string]: { name: string; unit?: string };
}

export function describeConditions(
    conditions: TitleCondition[],
    fields: TitleFieldNames = {},
): string[] {
    return conditions.map((condition) => {
        if ("stat" in condition) {
            return `遊んだ回数が ${condition.value} ${opLabel(condition.op)}`;
        }
        const field = fields[condition.field] ?? { name: condition.field };
        if (typeof condition.value === "boolean") {
            return `${field.name} を達成`;
        }
        // WHY: 回数を見るときは記録の単位が当てはまらない
        const unit = condition.of === "count" ? "" : (field.unit ?? "");
        return `${field.name} の${ofLabel(condition.of)}が ${condition.value}${unit} ${opLabel(condition.op)}`;
    });
}

function opLabel(op: string): string {
    switch (op) {
        case ">=":
            return "以上";
        case ">":
            return "より大きい";
        case "<=":
            return "以下";
        case "<":
            return "より小さい";
        default:
            return "ちょうど";
    }
}

function ofLabel(of?: string): string {
    switch (of) {
        case "latest":
            return "最新の値";
        case "sum":
            return "合計";
        case "count":
            return "回数";
        default:
            return "最良値";
    }
}
