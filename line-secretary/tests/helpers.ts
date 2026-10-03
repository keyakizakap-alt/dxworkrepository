import { buildDeps, MOCK_CLOCK_KEY } from "../src/build-deps";
import type { Deps } from "../src/executor/deps";
import { handleEvent } from "../src/executor/handler";
import { runScheduler } from "../src/executor/scheduler";
import { MOCK_GROUP_ID, mockReplyToken } from "../src/line/mock-client";
import type { LineEvent, LineMessage } from "../src/line/types";
import { randomKeyBase64 } from "../src/store/crypto";
import { migrate, nodeSqliteDb } from "../src/store/node-sqlite";
import type { SqlDb } from "../src/store/sql";

export const ME = "U_mock_me";
export const TANAKA = "U_mock_tanaka";
export const SATO = "U_mock_sato";
export const GROUP = MOCK_GROUP_ID;

// 2026-10-03(土) 12:00 JST
export const BASE_NOW = Date.UTC(2026, 9, 3, 3, 0);

export interface Harness {
  db: SqlDb;
  deps: () => Promise<Deps>;
  say(chat: "dm" | "group", text: string, opts?: { user?: string; mention?: boolean; quotedId?: string }): Promise<Bot[]>;
  press(chat: "dm" | "group", data: string, user?: string): Promise<Bot[]>;
  advance(minutes: number): Promise<{ sent: number; failed: number }>;
  timeline(chat: "dm" | "group"): Promise<Bot[]>;
}

export interface Bot {
  id: string;
  sender: string;
  message: LineMessage;
  text: string;
  buttons: Array<{ label: string; data: string }>;
}

function toBot(row: { id: string; sender: string; payload: string }): Bot {
  const message = JSON.parse(row.payload) as LineMessage;
  const buttons: Array<{ label: string; data: string }> = [];
  let text: string;
  if (message.type === "text") {
    text = message.text;
  } else {
    const contents = message.contents as { body?: { contents?: Array<{ text?: string }> } };
    text = contents.body?.contents?.[0]?.text ?? message.altText;
    const footer = (message.contents as { footer?: { contents?: Array<{ action: { label: string; data: string } }> } }).footer;
    for (const b of footer?.contents ?? []) buttons.push({ label: b.action.label, data: b.action.data });
  }
  for (const q of message.quickReply?.items ?? []) buttons.push({ label: q.action.label, data: q.action.data });
  return { id: row.id, sender: row.sender, message, text, buttons };
}

export async function createHarness(env: Record<string, string> = {}): Promise<Harness> {
  const db = nodeSqliteDb(":memory:");
  await migrate(db);
  const fullEnv = { MOCK_MODE: "1", ENCRYPTION_KEY: randomKeyBase64(), BOT_NAME: "ことづて", ...env };
  // Mock の時計を固定の時刻に合わせる
  await db.run("INSERT INTO kv (key, value) VALUES (?, ?)", [MOCK_CLOCK_KEY, String(BASE_NOW - Date.now())]);
  const deps = () => buildDeps(fullEnv, db);
  const chatId = (chat: "dm" | "group") => (chat === "group" ? GROUP : ME);
  const source = (chat: "dm" | "group", user: string) =>
    chat === "group" ? { type: "group" as const, groupId: GROUP, userId: user } : { type: "user" as const, userId: user };
  let counter = 0;

  const newBotMessages = async (chat: "dm" | "group", before: number) => {
    const rows = await db.all<{ id: string; sender: string; payload: string }>(
      "SELECT id, sender, payload FROM mock_timeline WHERE chat_id = ? AND seq > ? AND sender = 'bot' ORDER BY seq",
      [chatId(chat), before],
    );
    return rows.map(toBot);
  };
  const maxSeq = async () => (await db.first<{ s: number | null }>("SELECT MAX(seq) AS s FROM mock_timeline"))?.s ?? 0;

  return {
    db,
    deps,
    async say(chat, text, opts = {}) {
      const before = await maxSeq();
      const d = await deps();
      const user = opts.user ?? ME;
      const id = `m_${++counter}`;
      const mention = "@ことづて";
      const body = opts.mention ? `${mention} ${text}` : text;
      await db.run(
        "INSERT INTO mock_timeline (id, chat_id, sender, user_id, payload, quoted_id, created_at, seq) VALUES (?, ?, 'user', ?, ?, ?, ?, ?)",
        [id, chatId(chat), user, JSON.stringify({ type: "text", text: body }), opts.quotedId ?? null, d.now(), before + 1],
      );
      await handleEvent(d, {
        type: "message",
        timestamp: d.now(),
        source: source(chat, user),
        webhookEventId: `ev_${counter}`,
        replyToken: mockReplyToken(chatId(chat)),
        message: {
          id,
          type: "text",
          text: body,
          quotedMessageId: opts.quotedId,
          mention: opts.mention
            ? { mentionees: [{ index: 0, length: mention.length, type: "user", userId: "U_bot", isSelf: true }] }
            : undefined,
        },
      } as LineEvent);
      return newBotMessages(chat, before);
    },
    async press(chat, data, user = ME) {
      const before = await maxSeq();
      const d = await deps();
      await handleEvent(d, {
        type: "postback",
        timestamp: d.now(),
        source: source(chat, user),
        webhookEventId: `ev_pb_${++counter}`,
        replyToken: mockReplyToken(chatId(chat)),
        postback: { data },
      } as LineEvent);
      return newBotMessages(chat, before);
    },
    async advance(minutes) {
      const cur = Number((await db.first<{ value: string }>("SELECT value FROM kv WHERE key = ?", [MOCK_CLOCK_KEY]))?.value ?? 0);
      await db.run("UPDATE kv SET value = ? WHERE key = ?", [String(cur + minutes * 60_000), MOCK_CLOCK_KEY]);
      return runScheduler(await deps());
    },
    async timeline(chat) {
      return newBotMessages(chat, 0);
    },
  };
}
