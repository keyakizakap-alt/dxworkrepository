// LINE Messaging API クライアント。チャネルアクセストークンはサーバー側だけで使う。

import type { LineMessage, SentMessage } from "./types";

export class LineApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
  /** 400/403/404 など、やり直しても成功しない失敗 */
  get permanent(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 429;
  }
}

export interface Profile {
  displayName: string;
}

export interface LineClient {
  reply(replyToken: string, messages: LineMessage[]): Promise<SentMessage[]>;
  /** retryKey を付けると、同じ送信を二重に行わない（X-Line-Retry-Key） */
  push(to: string, messages: LineMessage[], retryKey?: string): Promise<SentMessage[]>;
  getMemberProfile(chatType: "group" | "room", chatId: string, userId: string): Promise<Profile | null>;
  /** 友だち追加していないユーザーは取れない（null） */
  getFriendProfile(userId: string): Promise<Profile | null>;
  getMemberCount(chatType: "group" | "room", chatId: string): Promise<number | null>;
  /** LINE 側の今月の上限と使用数（取れなければ null） */
  getQuota(): Promise<{ limit: number | null; used: number } | null>;
  showLoading(userId: string): Promise<void>;
}

const API = "https://api.line.me";

export function httpLineClient(accessToken: string): LineClient {
  const call = async <T>(method: "GET" | "POST", path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      // レスポンス本文には送信内容が含まれることがあるので、ステータスだけ残す
      throw new LineApiError(res.status, `LINE API ${method} ${path.split("/").slice(0, 4).join("/")} failed: ${res.status}`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  };

  const optional = async <T>(fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof LineApiError && e.permanent) return null;
      throw e;
    }
  };

  return {
    async reply(replyToken, messages) {
      const r = await call<{ sentMessages?: SentMessage[] }>("POST", "/v2/bot/message/reply", { replyToken, messages });
      return r.sentMessages ?? [];
    },
    async push(to, messages, retryKey) {
      try {
        const r = await call<{ sentMessages?: SentMessage[] }>(
          "POST",
          "/v2/bot/message/push",
          { to, messages },
          retryKey ? { "X-Line-Retry-Key": retryKey } : {},
        );
        return r.sentMessages ?? [];
      } catch (e) {
        // 409 = 同じ retryKey で既に受け付け済み（送信済みとして扱う）
        if (e instanceof LineApiError && e.status === 409) return [];
        throw e;
      }
    },
    getMemberProfile(chatType, chatId, userId) {
      const kind = chatType === "group" ? "group" : "room";
      return optional(() => call<Profile>("GET", `/v2/bot/${kind}/${encodeURIComponent(chatId)}/member/${encodeURIComponent(userId)}`));
    },
    getFriendProfile(userId) {
      return optional(() => call<Profile>("GET", `/v2/bot/profile/${encodeURIComponent(userId)}`));
    },
    async getMemberCount(chatType, chatId) {
      const kind = chatType === "group" ? "group" : "room";
      const r = await optional(() => call<{ count: number }>("GET", `/v2/bot/${kind}/${encodeURIComponent(chatId)}/members/count`));
      return r?.count ?? null;
    },
    async getQuota() {
      try {
        const q = await call<{ type: "none" | "limited"; value?: number }>("GET", "/v2/bot/message/quota");
        const c = await call<{ totalUsage: number }>("GET", "/v2/bot/message/quota/consumption");
        return { limit: q.type === "limited" ? (q.value ?? null) : null, used: c.totalUsage };
      } catch {
        return null;
      }
    },
    async showLoading(userId) {
      try {
        await call("POST", "/v2/bot/chat/loading/start", { chatId: userId, loadingSeconds: 20 });
      } catch {
        // 表示できなくても処理は続ける
      }
    },
  };
}
