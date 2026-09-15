import NextAuth, { Profile } from "next-auth";
import Google from "next-auth/providers/google";
import Twitter from "next-auth/providers/twitter";
import GitHub from "next-auth/providers/github";
import { prisma } from "@yasshi2525/persist-schema";
import { PrismaAdapter } from "@auth/prisma-adapter";

function asString(value: unknown) {
    return typeof value === "string" && value ? value : undefined;
}

// events.signIn には各プロバイダの profile() で正規化する前の生プロフィールが渡される
function extractProfileImage(provider: string, profile: Profile) {
    switch (provider) {
        case "google":
            return asString(profile.picture);
        case "github":
            return asString(profile.avatar_url);
        case "twitter": {
            const data = profile.data;
            if (typeof data !== "object" || data === null) {
                return undefined;
            }
            const image = asString(
                (data as Record<string, unknown>).profile_image_url,
            );
            // X が返す _normal は 48px で高 DPI では粗いため、同じ画像の 400px 版を使う
            return image?.replace(/_normal(\.\w+)?$/, "_400x400$1");
        }
        default:
            return undefined;
    }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
    adapter: PrismaAdapter(prisma),
    providers: [Google, Twitter, GitHub],
    events: {
        // Auth.js は既存アカウントでのサインイン時に User.image を更新しない。
        // サービス側でアイコンを変えると旧 URL は 404 になるため、サインインのたびに追随させる
        async signIn({ user, account, profile }) {
            if (!user.id || !account || !profile) {
                return;
            }
            const image = extractProfileImage(account.provider, profile);
            if (!image || image === user.image) {
                return;
            }
            try {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { image },
                });
            } catch (err) {
                // アイコン更新の失敗でサインイン自体を失敗させない
                console.warn(
                    `failed to update user image. (userId = "${user.id}")`,
                    err,
                );
            }
        },
    },
});
