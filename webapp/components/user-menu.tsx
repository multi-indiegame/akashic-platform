"use client";

import { MouseEvent, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import {
    IconButton,
    Menu,
    MenuItem,
    Stack,
    Typography,
    useTheme,
} from "@mui/material";
import {
    AddCircle,
    AccountCircle,
    FormatListBulleted,
    Help,
    ListAlt,
    Logout,
    MeetingRoom,
    Settings,
    VisibilityOff,
} from "@mui/icons-material";
import { User } from "@/lib/types";
import { useAuth } from "@/lib/client/useAuth";
import { useUserProfile } from "@/lib/client/useUserProfile";
import { UserLabel } from "./user-label";
import { SignInDialog } from "./sign-in-dialog";
import { NotificationBell } from "./notification-bell";

interface MenuProps {
    anchorEl?: HTMLElement;
    handleClose: () => void;
}

function AnonymousMenu({
    user,
    anchorEl,
    handleClose,
    onSignIn,
}: MenuProps & { user: User | null; onSignIn: () => void }) {
    const theme = useTheme();
    return (
        <Menu
            anchorEl={anchorEl}
            open={!!anchorEl}
            onClose={handleClose}
            onClick={handleClose}
        >
            <MenuItem onClick={onSignIn}>
                <Typography
                    variant="body1"
                    sx={{
                        color: theme.palette.primary.light,
                        borderStyle: "solid",
                        borderWidth: 1,
                        borderRadius: 2,
                        borderColor: theme.palette.primary.light,
                        p: 1,
                    }}
                >
                    サインイン
                </Typography>
            </MenuItem>
            {user?.authType === "guest" && (
                <MenuItem component={Link} href="/my-play" sx={{ py: 1.25 }}>
                    <FormatListBulleted />
                    <Typography variant="body1" sx={{ ml: 1 }}>
                        自分が作った部屋
                    </Typography>
                </MenuItem>
            )}
            <MenuItem
                component={Link}
                href="/settings/moderation"
                sx={{ py: 1.5 }}
            >
                <VisibilityOff />
                <Typography variant="body1" sx={{ ml: 1 }}>
                    モデレーション設定
                </Typography>
            </MenuItem>
        </Menu>
    );
}

interface AuthorizedMenuProps extends MenuProps {
    user: User;
}

function AuthorizedMenu({ user, anchorEl, handleClose }: AuthorizedMenuProps) {
    const theme = useTheme();
    const [signouting, setIsSignouting] = useState(false);
    const { profile } = useUserProfile(user.id);
    const handle = profile?.handle;

    function handleSignOut() {
        if (signouting) {
            return;
        }
        setIsSignouting(true);
        signOut();
    }

    return (
        <Menu
            anchorEl={anchorEl}
            open={!!anchorEl}
            onClose={handleClose}
            onClick={handleClose}
        >
            <MenuItem
                component={Link}
                href={`/user/${user.id}`}
                sx={{ py: 1.25 }}
            >
                <AccountCircle />
                <Typography variant="body1" sx={{ ml: 1 }}>
                    マイページ
                </Typography>
            </MenuItem>
            {handle && (
                <MenuItem
                    component={Link}
                    href={`/live/${handle}`}
                    sx={{ py: 1.25 }}
                >
                    <MeetingRoom />
                    <Typography variant="body1" sx={{ ml: 1 }}>
                        あなたの部屋
                    </Typography>
                </MenuItem>
            )}
            <MenuItem component={Link} href="/my-play" sx={{ py: 1.25 }}>
                <FormatListBulleted />
                <Typography variant="body1" sx={{ ml: 1 }}>
                    自分が作った部屋
                </Typography>
            </MenuItem>
            <MenuItem component={Link} href="/new-game" sx={{ py: 1.25 }}>
                <AddCircle />
                <Typography variant="body1" sx={{ ml: 1 }}>
                    ゲームを投稿
                </Typography>
            </MenuItem>
            <MenuItem component={Link} href="/edit-game" sx={{ py: 1.5 }}>
                <ListAlt />
                <Typography variant="body1" sx={{ ml: 1 }}>
                    投稿ゲーム一覧
                </Typography>
            </MenuItem>
            <MenuItem
                component={Link}
                href="/settings/moderation"
                divider={true}
                sx={{ py: 1.5 }}
            >
                <VisibilityOff />
                <Typography variant="body1" sx={{ ml: 1 }}>
                    モデレーション設定
                </Typography>
            </MenuItem>
            <MenuItem
                onClick={handleSignOut}
                disabled={signouting}
                sx={{ py: 1.5, color: theme.palette.text.secondary }}
            >
                <Logout />
                <Typography variant="body1" sx={{ ml: 1 }}>
                    サインアウト
                </Typography>
            </MenuItem>
        </Menu>
    );
}

export function UserMenu() {
    const [user] = useAuth();
    const [anchorEl, setAnchorEl] = useState<HTMLElement>();
    const [signInOpen, setSignInOpen] = useState(false);

    // usePlayLeaveGuard が割り込んでもメニューを閉じる動作を完了させる
    useEffect(() => {
        if (!anchorEl) {
            return;
        }
        const onDocClickCapture = () => {
            setTimeout(() => setAnchorEl(undefined), 0);
        };
        document.addEventListener("click", onDocClickCapture, true);
        return () => {
            document.removeEventListener("click", onDocClickCapture, true);
        };
    }, [anchorEl]);

    function handleClick(ev: MouseEvent<HTMLElement>) {
        setAnchorEl(ev.currentTarget);
    }

    function handleClose() {
        setAnchorEl(undefined);
    }

    return (
        <Stack
            direction="row"
            sx={{
                gap: { xs: 0, sm: 1 },
                alignItems: "center",
            }}
        >
            <UserLabel user={user} />
            <IconButton aria-label="help" component={Link} href="/help">
                <Help fontSize="large" />
            </IconButton>
            <NotificationBell />
            <IconButton aria-label="settings" onClick={handleClick}>
                <Settings fontSize="large" />
            </IconButton>
            {user?.authType !== "oauth" ? (
                <>
                    <AnonymousMenu
                        user={user}
                        handleClose={handleClose}
                        anchorEl={anchorEl}
                        onSignIn={() => setSignInOpen(true)}
                    />
                    <SignInDialog
                        trigger={{
                            action: "controlled",
                            open: signInOpen,
                            onClose: () => setSignInOpen(false),
                        }}
                    />
                </>
            ) : (
                <AuthorizedMenu
                    user={user}
                    handleClose={handleClose}
                    anchorEl={anchorEl}
                />
            )}
        </Stack>
    );
}
