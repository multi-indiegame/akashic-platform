import type {
    ScoreValueType,
    TitleCondition,
} from "@multi-indiegame/scoreboard-schema";
import {
    ScoreValueTypeCounts,
    describeTypeCounts,
    presentTypes,
    typeLabel,
} from "./score-value-type";

export interface TitleFieldNames {
    [key: string]: { name: string; unit?: string };
}

export interface TitleKeyTypes {
    [key: string]: {
        /** 届いた値の型ごとの数 */
        counts: ScoreValueTypeCounts;
        /** 見せ方で申告された型。記録が届く前はこれで判断する */
        declared?: ScoreValueType;
    };
}

/**
 * 条件がキーの値の種類に合わず、付与されない（されないことがある）ときの警告。
 *
 * WHY: 条件を満たすかは実際に届いた値で決まる。型の合わない条件は保存できても
 * 誰にも付与されず、投稿者からは気づけない。
 */
export function conditionWarning(
    condition: TitleCondition,
    keyTypes: TitleKeyTypes,
    fields: TitleFieldNames = {},
): string | undefined {
    if ("stat" in condition) {
        return undefined;
    }
    const keyType = keyTypes[condition.field];
    if (!keyType) {
        return undefined;
    }
    const reported = presentTypes(keyType.counts);
    const types =
        reported.length > 0
            ? reported
            : keyType.declared
              ? [keyType.declared]
              : [];
    if (types.length === 0) {
        return undefined;
    }
    const name = fields[condition.field]?.name ?? condition.field;
    if (types.length > 1) {
        return `${name} には値の種類が混在して登録されています（${describeTypeCounts(keyType.counts)}）。条件どおりに付与されないことがあります。`;
    }
    const type = types[0];
    if (typeof condition.value === "boolean") {
        return type === "boolean"
            ? undefined
            : `${name} の値は${typeLabel(type)}のため、「達成していれば付与する」では付与されません。`;
    }
    if (type === "string") {
        return `${name} の値は文字列のため、数として比べられず付与されません。`;
    }
    // WHY: 真偽値でも「回数」は true の回数として比べられる
    if (type === "boolean" && condition.of !== "count") {
        return `${name} の値は真偽値のため、${ofLabel(condition.of)}では付与されません。「回数」か「達成していれば付与する」を選んでください。`;
    }
    return undefined;
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
