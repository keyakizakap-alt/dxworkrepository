// LINE Messaging API の Webhook / 送信メッセージのうち、このアプリで使う部分の型

export interface EventSource {
  type: "user" | "group" | "room";
  userId?: string;
  groupId?: string;
  roomId?: string;
}

export interface Mentionee {
  index: number;
  length: number;
  type: "user" | "all";
  userId?: string;
  isSelf?: boolean;
}

export interface TextMessageContent {
  id: string;
  type: "text";
  text: string;
  quoteToken?: string;
  quotedMessageId?: string;
  mention?: { mentionees: Mentionee[] };
}

export interface OtherMessageContent {
  id: string;
  type: "image" | "video" | "audio" | "file" | "location" | "sticker";
  quotedMessageId?: string;
}

interface BaseEvent {
  timestamp: number;
  source: EventSource;
  webhookEventId: string;
  deliveryContext?: { isRedelivery: boolean };
  mode?: "active" | "standby";
}

export type LineEvent =
  | (BaseEvent & { type: "message"; replyToken: string; message: TextMessageContent | OtherMessageContent })
  | (BaseEvent & { type: "postback"; replyToken: string; postback: { data: string } })
  | (BaseEvent & { type: "join"; replyToken: string })
  | (BaseEvent & { type: "leave" })
  | (BaseEvent & { type: "follow"; replyToken: string })
  | (BaseEvent & { type: "unfollow" })
  | (BaseEvent & { type: "unsend"; unsend: { messageId: string } })
  | (BaseEvent & { type: "memberJoined" | "memberLeft"; replyToken?: string });

export interface WebhookBody {
  destination: string;
  events: LineEvent[];
}

export interface QuickReplyItem {
  type: "action";
  action: { type: "postback"; label: string; data: string; displayText?: string };
}

export interface TextMessage {
  type: "text";
  text: string;
  quickReply?: { items: QuickReplyItem[] };
  quoteToken?: string;
}

export interface FlexMessage {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
  quickReply?: { items: QuickReplyItem[] };
}

export type LineMessage = TextMessage | FlexMessage;

export interface SentMessage {
  id: string;
}
