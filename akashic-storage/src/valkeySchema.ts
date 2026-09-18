import type { Permission } from "@akashic/amflow";
import { InvalidStatusError } from "@multi-indiegame/amflow-server-event-schema";

const keys = ["amf:token", "amf:startpoint", "amf:ticks"] as const;
type KeyType = (typeof keys)[number];

const keyNames = ["Token", "StartPoint", "TickChunk"] as const;
type KeyNameType = (typeof keyNames)[number];

export const ValkeyKey = {
    Token: "amf:token",
    TickChunk: "amf:ticks",
    StartPoint: "amf:startpoint",
} as const satisfies Record<KeyNameType, KeyType>;

export const genKey = (type: string, ...params: (string | number)[]) =>
    `${type}:${params
        .map((v) => {
            if (typeof v === "number") {
                return v.toString();
            } else {
                return v;
            }
        })
        .join(":")}`;

const activePermission: Permission = {
    readTick: true,
    writeTick: true,
    sendEvent: true,
    subscribeEvent: true,
    subscribeTick: true,
    maxEventPriority: 2,
};

const passivePermission: Permission = {
    readTick: true,
    writeTick: false,
    sendEvent: true,
    subscribeEvent: false,
    subscribeTick: true,
    maxEventPriority: 2,
};

const permissionType = ["active", "passive"] as const;
export type PermissionType = (typeof permissionType)[number];

export const toPermission = (permissionType: PermissionType) => {
    switch (permissionType) {
        case "active":
            return activePermission;
        case "passive":
            return passivePermission;
        default:
            console.warn(
                `invalid permissionType "${permissionType}" was specified.`,
            );
            // message はクライアントに送り返すのでセキュリティリスクを考慮し、入れていない
            throw new InvalidStatusError();
    }
};
