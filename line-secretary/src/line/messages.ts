// 返信メッセージの組み立て。LINE になじむ、白地＋LINE グリーンのボタンだけのシンプルな見た目。

import type { FlexMessage, LineMessage, QuickReplyItem, TextMessage } from "./types";

const GREEN = "#06C755";

export interface Button {
  label: string;
  data: string;
  primary?: boolean;
}

export function text(t: string, quick?: QuickReplyItem[]): TextMessage {
  return quick && quick.length > 0 ? { type: "text", text: t, quickReply: { items: quick.slice(0, 13) } } : { type: "text", text: t };
}

export function quickItem(label: string, data: string): QuickReplyItem {
  // ラベルは 20 文字まで
  const l = label.length > 20 ? `${label.slice(0, 19)}…` : label;
  return { type: "action", action: { type: "postback", label: l, data, displayText: label } };
}

/** 本文＋ボタン（[登録する] [変更する] など）のカード */
export function card(body: string, buttons: Button[]): FlexMessage {
  return {
    type: "flex",
    altText: body.replace(/\n+/g, " ").slice(0, 380),
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        contents: [{ type: "text", text: body, wrap: true, size: "md", color: "#111111", lineSpacing: "4px" }],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        paddingAll: "12px",
        paddingTop: "0px",
        contents: buttons.map((b) => ({
          type: "button",
          style: b.primary ? "primary" : "secondary",
          color: b.primary ? GREEN : "#EFF1F3",
          height: "sm",
          action: { type: "postback", label: b.label, data: b.data, displayText: b.label },
        })),
      },
    },
  };
}

export function messageText(m: LineMessage): string {
  return m.type === "text" ? m.text : m.altText;
}
