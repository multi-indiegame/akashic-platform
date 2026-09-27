"use client";

import { createTheme, colors } from "@mui/material";

export const theme = createTheme({
    palette: {
        mode: "dark",
        primary: {
            main: colors.teal[500],
        },
        secondary: {
            main: colors.blue[500],
        },
        background: {
            default: colors.blueGrey[900],
            paper: colors.blueGrey[700],
        },
        text: {
            primary: colors.blueGrey[50],
            secondary: colors.blueGrey[200],
        },
    },
    components: {
        MuiDialog: {
            defaultProps: {
                // WHY: 既定の true だと閉じるトランジション中に背景の aria-hidden が残り、
                // トリガーへ戻したフォーカスと重なって Chrome が警告を出す (mui/material-ui#43106)
                closeAfterTransition: false,
                slotProps: {
                    transition: {
                        // WHY: トリガーが blur 済み・無効化・消滅などでフォーカスを戻せないと、
                        // フォーカスがダイアログ内に残ったままダイアログ自身に aria-hidden が付く
                        onExit: (node: HTMLElement) => {
                            const active = document.activeElement;
                            if (
                                active instanceof HTMLElement &&
                                node.contains(active)
                            ) {
                                active.blur();
                            }
                        },
                    },
                },
            },
        },
    },
});

export const verticalButtonSx = {
    "& .MuiButton-root": {
        px: 5,
    },
    // WHY: 縦に並ぶボタンでラベルを中央に置いたままアイコンの位置をそろえるため
    "& .MuiButton-startIcon": {
        position: "absolute",
        left: 16,
    },
} as const;
