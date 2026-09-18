"use server";

import { prisma } from "@multi-indiegame/persist-schema";
import { getAuth } from "./auth";

export type NotificationActionState = {
    ok: boolean;
    message?: string;
};

export async function markNotificationReadAction(
    id: number,
): Promise<NotificationActionState> {
    const auth = await getAuth();
    if (!auth || auth.authType !== "oauth") {
        return {
            ok: false,
            message: "サインインが必要です。",
        };
    }

    await prisma.notification.updateMany({
        where: {
            userId: auth.id,
            id,
        },
        data: {
            unread: false,
        },
    });

    return {
        ok: true,
    };
}

export async function markAllNotificationsReadAction(): Promise<NotificationActionState> {
    const auth = await getAuth();
    if (!auth || auth.authType !== "oauth") {
        return {
            ok: false,
            message: "サインインが必要です。",
        };
    }

    await prisma.notification.updateMany({
        where: {
            userId: auth.id,
            unread: true,
        },
        data: {
            unread: false,
        },
    });

    return {
        ok: true,
    };
}
