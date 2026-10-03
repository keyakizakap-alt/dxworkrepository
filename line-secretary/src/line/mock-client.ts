// Mock Mode 用：LINE に送る代わりに、画面表示用の表へ書き込む

import type { SqlDb } from "../store/sql";
import type { LineClient, Profile } from "./client";
import type { LineMessage } from "./types";

export const MOCK_GROUP_ID = "C_mock_group";
export const MOCK_GROUP_NAME = "旅行の相談";
export const MOCK_USERS = [
  { userId: "U_mock_me", name: "凌吾", friend: true },
  { userId: "U_mock_tanaka", name: "田中", friend: false },
  { userId: "U_mock_sato", name: "佐藤", friend: true },
] as const;

export async function appendTimeline(
  db: SqlDb,
  entry: { id: string; chatId: string; sender: "user" | "bot"; userId: string | null; payload: unknown; quotedId?: string | null; now: number },
): Promise<void> {
  const seq = (await db.first<{ s: number | null }>("SELECT MAX(seq) AS s FROM mock_timeline"))?.s ?? 0;
  await db.run(
    "INSERT INTO mock_timeline (id, chat_id, sender, user_id, payload, quoted_id, created_at, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [entry.id, entry.chatId, entry.sender, entry.userId, JSON.stringify(entry.payload), entry.quotedId ?? null, entry.now, seq + 1],
  );
}

/** reply トークンにはどのトーク宛てかを埋め込んでいる（mock:<chatId>:<random>） */
export function mockReplyToken(chatId: string): string {
  return `mock:${chatId}:${crypto.randomUUID()}`;
}

export function mockLineClient(db: SqlDb, now: () => number): LineClient {
  const write = async (chatId: string, messages: LineMessage[]) => {
    const sent = [];
    for (const m of messages) {
      const id = `bot_${crypto.randomUUID()}`;
      await appendTimeline(db, { id, chatId, sender: "bot", userId: null, payload: m, now: now() });
      sent.push({ id });
    }
    return sent;
  };
  const find = (userId: string) => MOCK_USERS.find((u) => u.userId === userId);
  return {
    async reply(replyToken, messages) {
      const chatId = replyToken.split(":")[1];
      if (!chatId) throw new Error("invalid mock reply token");
      return write(chatId, messages);
    },
    async push(to, messages) {
      const user = find(to);
      if (user && !user.friend) throw new Error("mock: not a friend");
      return write(to, messages);
    },
    async getMemberProfile(_type, _chatId, userId): Promise<Profile | null> {
      const u = find(userId);
      return u ? { displayName: u.name } : null;
    },
    async getFriendProfile(userId) {
      const u = find(userId);
      return u?.friend ? { displayName: u.name } : null;
    },
    async getMemberCount() {
      return MOCK_USERS.length;
    },
    async getQuota() {
      return null;
    },
    async showLoading() {},
  };
}
