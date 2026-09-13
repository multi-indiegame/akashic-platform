import type { NicoliveSupportedModes } from "@akashic/game-configuration";
import type {
    NotificationType,
    ReportReason,
    ReportTargetType,
} from "@yasshi2525/persist-schema";

const authTypes = ["guest", "oauth"] as const;
type AuthType = (typeof authTypes)[number];

export interface User {
    id: string;
    name: string;
    image?: string;
    authType: AuthType;
}

export interface Guest extends User {
    authType: "guest";
}

export interface OAuthUser extends User {
    authType: "oauth";
}

export const GUEST_IDKEY = "guest_id";
export const GUEST_NAME = "ゲスト";
// 端末永続の識別子にする。セッション Cookie だと閉じるたびに guest_id が変わり、
// 端末内ミュートの匿名キーが全て変わってしまう
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const GAMELIST_LIMITS = 10;

export interface GameInfo {
    id: number;
    title: string;
    iconURL: string;
    description: string;
    credit: string;
    streaming: boolean;
    playCount: number;
    license?: string;
    publisher: {
        id: string;
        name: string;
        image?: string;
    };
    contentId: number;
    isFavorited: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export const PLAYLIST_LIMITS = 12;

export interface PlayInfo {
    id: number;
    playName: string;
    isLimited: boolean;
    requireSignIn: boolean;
    chatEnabled: boolean;
    game: { title: string; iconURL: string };
    gameMaster: {
        userId?: string;
        name: string;
        iconURL?: string;
        /** 未サインイン利用者が端末内ミュートで部屋を隠すのに使う */
        anonKey?: string;
    };
    participants: number;
    createdAt: Date;
}

export type AnonymousPlayInfo = Omit<PlayInfo, "playName" | "gameMaster"> & {
    /** 未サインイン利用者が端末内ミュートで部屋を隠すのに使う（身元は含まない） */
    ownerAnonKey?: string;
};

export const FEEDBACK_LIMITS = 10;

interface FeedbackAuthor {
    id?: string;
    name: string;
    iconURL?: string;
}

interface FeedbackReply {
    id: number;
    author: FeedbackAuthor;
    body: string;
    createdAt: Date;
}

export interface FeedbackPost {
    id: number;
    author: FeedbackAuthor;
    body: string;
    createdAt: Date;
    reply?: FeedbackReply;
}

export interface FeedbackGameSummary {
    id: number;
    title: string;
    iconURL: string;
}

export interface UserFeedbackItem {
    id: number;
    author: FeedbackAuthor;
    body: string;
    createdAt: Date;
    reply?: FeedbackReply;
    game: FeedbackGameSummary;
}

export const CONTENT_LOGLIST_LIMITS = 20;

export interface ContentLogInfo {
    playId: number;
    contentId: number;
    name: string;
    gameMaster: {
        userId?: string;
        name: string;
        iconURL?: string;
    };
    createdAt: Date;
    endedAt: Date | null;
    logUploadedAt: Date | null;
    logDeletedAt: Date | null;
    crashed: boolean;
    errorLogged: boolean;
    clientLogCount: number;
}

export interface ContentLogEntry {
    timestamp: string;
    level: "info" | "warn" | "error";
    playId: number;
    contentId: number;
    message: string;
}

export interface ClientCapturedLog {
    timestamp: number;
    level: "log" | "warn" | "error";
    message: string;
}

export type ClientLogEntry =
    | {
          type?: "log";
          timestamp: string;
          level: "log" | "warn" | "error";
          message: string;
      }
    | {
          type: "truncation_marker";
          timestamp: string;
      };

export interface ClientLogSubmission {
    id: number;
    clientId: string;
    userId: string | null;
    reporter: { name: string | null; image: string | null } | null;
    submittedAt: Date;
    entries: ClientLogEntry[];
    comments: string[];
}

const clientLogSubmitErrReasons = [
    "InvalidParams",
    "NotFound",
    "Unauthorized",
    "RateLimited",
    "InternalError",
] as const;
export type ClientLogSubmitErrorType =
    (typeof clientLogSubmitErrReasons)[number];
export type ClientLogSubmitResponse =
    | { ok: true }
    | {
          ok: false;
          reason: "RateLimited";
          retryAfterSeconds: number;
      }
    | {
          ok: false;
          reason: Exclude<ClientLogSubmitErrorType, "RateLimited">;
      };

const clientLogsGetErrReasons = [
    "InvalidParams",
    "Forbidden",
    "NotFound",
    "Deleted",
    "InternalError",
] as const;
export type ClientLogsGetErrorType = (typeof clientLogsGetErrReasons)[number];
export type ClientLogsGetResponse =
    | { ok: true; data: ClientLogSubmission[] }
    | { ok: false; reason: ClientLogsGetErrorType };

export const BOARD_MESSAGE_BODY_MAX = 200;
export const BOARD_MESSAGE_NAME_MAX = 20;

export const MUTE_LIMIT_DEFAULT = 200;
export const MUTE_LABEL_BODY_MAX = 40;
export const BAN_LIMIT_DEFAULT = 200;

export const REPORT_DETAIL_MAX = 1000;
export const CONTACT_BODY_MAX = 2000;
export const CONTACT_NAME_MAX = 40;

// 通報理由の表示ラベル。選択肢の順序もこの定義順に従う
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
    HARASSMENT: "嫌がらせ・誹謗中傷",
    INAPPROPRIATE: "不適切な内容・不快にさせる表現",
    PRIVACY: "個人情報・プライバシー侵害",
    SPAM: "スパム・宣伝",
    OTHER: "その他",
};

export const REPORT_REASONS = Object.keys(
    REPORT_REASON_LABELS,
) as ReportReason[];

export type ReportSource = "board" | "chat";

// 投稿以外の通報対象の指定に使う
export type ReportTargetInput =
    | { kind: "message"; source: ReportSource; messageId: number }
    | { kind: "play"; playId: number }
    | { kind: "user"; userId: string };

export type ReportFormState = {
    ok: boolean;
    message?: string;
    submitted: boolean;
    submittedAt?: number;
};

export type ContactFormState = {
    ok: boolean;
    message?: string;
    submitted: boolean;
    submittedAt?: number;
};

export type { ReportReason, ReportTargetType };

export interface LocalMuteEntry {
    anonKey: string;
    label: string;
    createdAt: number;
}

export interface MuteInfo {
    id: number;
    label: string;
    createdAt: Date;
}

const mutesGetErrReasons = ["Unauthorized", "InternalError"] as const;
export type MutesGetErrorType = (typeof mutesGetErrReasons)[number];
export type MutesGetResponse =
    { ok: true; data: MuteInfo[] } | { ok: false; reason: MutesGetErrorType };

export interface BanInfo {
    id: number;
    label: string;
    /** サインイン部屋主の全部屋 BAN なら true、ゲスト部屋主の部屋単位 BAN なら false */
    allRooms: boolean;
    createdAt: Date;
}

const bansGetErrReasons = ["Unauthorized", "InternalError"] as const;
export type BansGetErrorType = (typeof bansGetErrReasons)[number];
export type BansGetResponse =
    { ok: true; data: BanInfo[] } | { ok: false; reason: BansGetErrorType };

export interface MessageAuthorInfo {
    id?: string;
    name: string;
    iconURL?: string;
    /**
     * 投稿者を指すための匿名キー。閲覧者ごとに異なる値になるため、
     * 利用者同士で突き合わせても同一人物を特定できない。
     * 未サインイン利用者が端末内ミュートの対象を記録するのに使う。
     */
    anonKey?: string;
    /** 閲覧者自身の投稿。自分をミュート・BANできないよう UI で判定に使う */
    isSelf?: boolean;
}

export interface BoardMessageInfo {
    id: number;
    author: MessageAuthorInfo;
    body: string;
    createdAt: Date;
    /** サーバー側 (サインイン利用者) のミュート判定結果 */
    muted?: boolean;
}

const boardMessagesGetErrReasons = ["InternalError"] as const;
export type BoardMessagesGetErrorType =
    (typeof boardMessagesGetErrReasons)[number];
export type BoardMessagesGetResponse =
    | { ok: true; data: BoardMessageInfo[] }
    | { ok: false; reason: BoardMessagesGetErrorType };

export const PLAY_CHAT_BODY_MAX = 100;
export const PLAY_CHAT_NAME_MAX = 16;

export interface PlayChatMessageInfo {
    id: number;
    author: MessageAuthorInfo;
    body: string;
    createdAt: Date;
    /** サーバー側 (サインイン利用者) のミュート判定結果 */
    muted?: boolean;
}

const playChatGetErrReasons = [
    "InvalidParams",
    "NotFound",
    "Forbidden",
    "Disabled",
    "InternalError",
] as const;
export type PlayChatGetErrorType = (typeof playChatGetErrReasons)[number];
export type PlayChatGetResponse =
    | { ok: true; data: PlayChatMessageInfo[] }
    | { ok: false; reason: PlayChatGetErrorType };

export const NOTIFICATION_LIMITS = 10;

export interface NotificationInfo {
    id: number;
    unread: boolean;
    type: NotificationType;
    iconURL?: string;
    body: string;
    link?: string;
    createdAt: Date;
}

export interface UserProfile {
    id: string;
    name: string;
    handle?: string;
    image?: string;
    /**
     * 自分自身の場合のみ値が格納。サインイン中のプロパイダ
     */
    provider?: string;
}

export type UserNameFormState = {
    ok: boolean;
    submitted: boolean;
    name?: string;
    message?: string;
    submittedAt?: number;
};

export type UserHandleFormState = {
    ok: boolean;
    submitted: boolean;
    handle?: string;
    message?: string;
    submittedAt?: number;
};

// next.config.ts の serverActions.bodySizeLimit / proxyClientMaxBodySize は
// ゲームとアイコンを同一リクエストで送るため、両者の合計より多めにすること
export const GAME_FILE_MAX_MB = 30;
export const GAME_FILE_MAX_BYTES = GAME_FILE_MAX_MB * 1024 * 1024;
export const ICON_FILE_MAX_MB = 1;
export const ICON_FILE_MAX_BYTES = ICON_FILE_MAX_MB * 1024 * 1024;

export const supportedExternalPlugins = ["send", "coe", "coeLimited"];
export const supportedAkashicVersions = ["3"];
export const supportedAkashicModes: NicoliveSupportedModes[] = [
    "multi",
    "multi_admission",
];

const contentErrReasons = [
    "InvalidParams",
    "NoGameJson",
    "InvalidGameJson",
    "UnsupportedVersion",
    "UnsupportedMode",
    "GameFileTooLarge",
    "IconFileTooLarge",
    "Drain",
    "InternalError",
] as const;
export type ContentErrorType = (typeof contentErrReasons)[number];
export type ContentErrorResponse = {
    ok: false;
    reason: ContentErrorType;
};
export type ContentResponse =
    { ok: true; contentId: number } | ContentErrorResponse;

const deleteGameErrReasons = [
    "InvalidParams",
    "NotFound",
    "Drain",
    "InternalError",
] as const;
export type DeleteGameErrorType = (typeof deleteGameErrReasons)[number];
export type DeleteGameResponse =
    { ok: true } | { ok: false; reason: DeleteGameErrorType };

const gameErrReasons = ["InvalidParams", "NotFound", "InternalError"] as const;
export type GameErrorType = (typeof gameErrReasons)[number];
export type GameResponse =
    { ok: true; data: GameInfo } | { ok: false; reason: GameErrorType };

const favoriteErrReasons = ["Unauthorized", "InternalError"] as const;
export type FavoriteErrorType = (typeof favoriteErrReasons)[number];
export type FavoriteListResponse =
    { ok: true; data: GameInfo[] } | { ok: false; reason: FavoriteErrorType };

const playErrReasons = [
    "InvalidParams",
    "NotFound",
    "JoinWordRequired",
    "InvalidJoinWord",
    "SignInRequired",
    "Banned",
    "InternalError",
] as const;
export type PlayErrorType = (typeof playErrReasons)[number];

type PlayViewInfo =
    | ({ isActive: true } & ActivePlayViewInfo)
    | ({ isActive: false } & ClosedPlayViewInfo);

interface BasePlayViewInfo {
    playName: string;
    isLimited: boolean;
    requireSignIn: boolean;
    chatEnabled: boolean;
    /** 閲覧者がこの部屋の部屋主か。サーバーが認証種別込みで判定して返す */
    isGameMaster: boolean;
    game: GameInfo;
    gameMaster: {
        // ゲスト部屋主の gameMasterId は httpOnly な guest_id そのもので、
        // 応答に載せると参加者に詐称されるため id は返さない（部屋主判定は
        // 上の isGameMaster を使う）。userId は OAuth 利用者の公開 id のみ
        userId?: string;
        name: string;
        iconURL?: string;
        handle?: string;
    };
    createdAt: Date;
}

export interface ActivePlayViewInfo extends BasePlayViewInfo {
    playToken: string;
    /** ゲームに申告する playerId。guest_id を秘匿するため非可逆な派生値 */
    playerId: string;
    joinWord?: string;
    inviteHash?: string;
    width: number;
    height: number;
    external: string[];
    remainingMs: number;
    expiresAt: number;
}

export interface ClosedPlayViewInfo extends BasePlayViewInfo {
    endedAt?: Date;
}

export type PlayResponse =
    { ok: true; data: PlayViewInfo } | { ok: false; reason: PlayErrorType };

const playParticipantsErrReasons = ["InvalidParams", "InternalError"] as const;
export type PlayParticipantsErrorType =
    (typeof playParticipantsErrReasons)[number];
export type PlayParticipantsResponse =
    | { ok: true; participants: number }
    | { ok: false; reason: PlayParticipantsErrorType };

export type LiveInfo = {
    owner: {
        userId: string;
        name: string;
        iconURL?: string;
    };
} & (
    | {
          requiresJoinWord: true;
          reason:
              | "JoinWordRequired"
              | "InvalidJoinWord"
              | "SignInRequired"
              | "Banned";
      }
    | {
          requiresJoinWord: false;
          info?: ActivePlayViewInfo & { id: number };
      }
);

const liveErrReasons = ["NotFound", "InternalError"] as const;
export type LiveErrorType = (typeof liveErrReasons)[number];
export type LiveResponse =
    { ok: true; data: LiveInfo } | { ok: false; reason: LiveErrorType };

const feedbackErrReasons = [
    "InvalidParams",
    "NotFound",
    "InternalError",
] as const;
export type FeedbackErrorType = (typeof feedbackErrReasons)[number];
export type FeedbackResponse =
    | { ok: true; data: FeedbackPost[] }
    | { ok: false; reason: FeedbackErrorType };

const userProfileErrReasons = ["InvalidParams", "NotFound"] as const;
export type UserProfileErrorType = (typeof userProfileErrReasons)[number];
export type UserProfileResponse =
    | { ok: true; data: UserProfile }
    | { ok: false; reason: UserProfileErrorType };

const userFeedbackErrReasons = [
    "InvalidParams",
    "NotFound",
    "InternalError",
] as const;
export type UserFeedbackErrorType = (typeof userFeedbackErrReasons)[number];
export type UserFeedbackResponse =
    | { ok: true; data: UserFeedbackItem[] }
    | { ok: false; reason: UserFeedbackErrorType };

const userHandleErrReasons = [
    "Unauthorized",
    "EmptyHandle",
    "InvalidFormatHandle",
    "ForbiddenHandle",
    "HandleAlreadyExists",
    "InternalError",
] as const;
export type UserHandleErrorType = (typeof userHandleErrReasons)[number];
export type UserHandleResponse =
    { ok: true; handle: string } | { ok: false; reason: UserHandleErrorType };

const contentLogListErrReasons = [
    "InvalidParams",
    "Forbidden",
    "NotFound",
    "InternalError",
] as const;
export type ContentLogListErrorType = (typeof contentLogListErrReasons)[number];
export type ContentLogListResponse =
    | { ok: true; data: ContentLogInfo[] }
    | { ok: false; reason: ContentLogListErrorType };

const contentLogErrReasons = [
    "InvalidParams",
    "Forbidden",
    "NotFound",
    "Deleted",
    "InternalError",
] as const;
export type ContentLogErrorType = (typeof contentLogErrReasons)[number];
export type ContentLogResponse =
    string | { ok: false; reason: ContentLogErrorType };

const notificationErrReasons = ["NotAuthorized", "InternalError"] as const;
export type NotificationErrorType = (typeof notificationErrReasons)[number];
export type NotificationResponse =
    | { ok: true; data: NotificationInfo[] }
    | { ok: false; reason: NotificationErrorType };

export const messageKey = "message";
export const messages = {
    content: {
        registerSuccessful: "registerContentSuccessful",
        editSuccessful: "editContentSuccessful",
        deleteSuccessful: "deleteContentSuccessful",
    },
    play: {
        registerSuccessful: "registerPlaySuccessful",
        endSuccessful: "endPlaySuccessful",
    },
} as const;
