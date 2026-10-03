// Mock Mode 専用 API（LINE Developers の設定前に、LINE 風の画面で動きを確かめるため）。
// MOCK_MODE=1 のときだけ有効。本番では 404 を返す。

import { Hono } from "hono";
import type { AppEnv } from "../app";
import { MOCK_CLOCK_KEY } from "../build-deps";
import { handleEvent } from "../executor/handler";
import { runScheduler } from "../executor/scheduler";
import { appendTimeline, MOCK_GROUP_ID, MOCK_GROUP_NAME, MOCK_USERS, mockReplyToken } from "../line/mock-client";
import type { EventSource, LineEvent } from "../line/types";

const TABLES = [
  "chats",
  "members",
  "messages",
  "bot_messages",
  "tasks",
  "reminders",
  "pending_actions",
  "conv_states",
  "processed_events",
  "push_usage",
  "metrics_daily",
  "kv",
  "mock_timeline",
];

const ME = MOCK_USERS[0].userId;

function chatIdOf(chat: string): string {
  return chat === "group" ? MOCK_GROUP_ID : ME;
}

function sourceOf(chat: string, userId: string): EventSource {
  return chat === "group" ? { type: "group", groupId: MOCK_GROUP_ID, userId } : { type: "user", userId };
}

function base(chat: string, userId: string, now: number) {
  return {
    timestamp: now,
    source: sourceOf(chat, userId),
    webhookEventId: crypto.randomUUID(),
    deliveryContext: { isRedelivery: false },
    mode: "active" as const,
  };
}

export function mockRoutes() {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    const deps = await c.var.getDeps();
    if (!deps.config.mockMode) return c.json({ message: "not found" }, 404);
    await next();
  });

  app.post("/init", async (c) => {
    const deps = await c.var.getDeps();
    const db = c.var.db;
    const count = (await db.first<{ n: number }>("SELECT COUNT(*) AS n FROM mock_timeline"))?.n ?? 0;
    if (count === 0) {
      const now = deps.now();
      await handleEvent(deps, { ...base("dm", ME, now), type: "follow", replyToken: mockReplyToken(ME) } as LineEvent);
      await handleEvent(deps, {
        ...base("group", ME, now),
        type: "join",
        replyToken: mockReplyToken(MOCK_GROUP_ID),
      } as LineEvent);
    }
    return c.json({ ok: true });
  });

  app.get("/state", async (c) => {
    const deps = await c.var.getDeps();
    const db = c.var.db;
    const chat = c.req.query("chat") === "group" ? "group" : "dm";
    const chatId = chatIdOf(chat);
    const rows = await db.all<{
      id: string;
      sender: string;
      user_id: string | null;
      payload: string;
      quoted_id: string | null;
      created_at: number;
    }>("SELECT id, sender, user_id, payload, quoted_id, created_at FROM mock_timeline WHERE chat_id = ? ORDER BY seq", [chatId]);
    const viewer = c.req.query("user") ?? ME;
    const tasks = await deps.repo.listOpenTasks(chatId);
    const reminders = (await deps.repo.listScheduled(chatId, viewer)).filter(
      (r) => r.targetType === "chat" || r.targetId === viewer,
    );
    const nextAt = await deps.repo.nextReminderAt();
    return c.json({
      now: deps.now(),
      nextReminderAt: nextAt,
      chat: { id: chatId, name: chat === "group" ? MOCK_GROUP_NAME : deps.config.botName, type: chat },
      botName: deps.config.botName,
      users: MOCK_USERS,
      llm: deps.llm ? deps.llm.name : null,
      timeline: rows.map((r) => ({
        id: r.id,
        sender: r.sender,
        userId: r.user_id,
        message: JSON.parse(r.payload) as unknown,
        quotedId: r.quoted_id,
        at: r.created_at,
      })),
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, assignee: t.assignee, dueDate: t.dueDate })),
      reminders: reminders.map((r) => ({
        id: r.id,
        content: r.content,
        fireAt: r.fireAt,
        kind: r.kind,
        toSelf: r.targetType === "user",
      })),
    });
  });

  app.post("/send", async (c) => {
    const deps = await c.var.getDeps();
    const db = c.var.db;
    const body = await c.req.json<{ chat: string; userId?: string; text: string; mention?: boolean; quotedId?: string }>();
    const chat = body.chat === "group" ? "group" : "dm";
    const userId = chat === "group" ? (MOCK_USERS.find((u) => u.userId === body.userId)?.userId ?? ME) : ME;
    const now = deps.now();
    const id = `m_${crypto.randomUUID()}`;
    const mentionText = `@${deps.config.botName}`;
    const textValue = body.mention ? `${mentionText} ${body.text}` : body.text;
    await appendTimeline(db, {
      id,
      chatId: chatIdOf(chat),
      sender: "user",
      userId,
      payload: { type: "text", text: textValue },
      quotedId: body.quotedId ?? null,
      now,
    });
    await handleEvent(deps, {
      ...base(chat, userId, now),
      type: "message",
      replyToken: mockReplyToken(chatIdOf(chat)),
      message: {
        id,
        type: "text",
        text: textValue,
        quotedMessageId: body.quotedId,
        mention: body.mention
          ? { mentionees: [{ index: 0, length: mentionText.length, type: "user", userId: "U_bot", isSelf: true }] }
          : undefined,
      },
    } as LineEvent);
    return c.json({ ok: true });
  });

  app.post("/postback", async (c) => {
    const deps = await c.var.getDeps();
    const db = c.var.db;
    const body = await c.req.json<{ chat: string; userId?: string; data: string; label?: string }>();
    const chat = body.chat === "group" ? "group" : "dm";
    const userId = chat === "group" ? (MOCK_USERS.find((u) => u.userId === body.userId)?.userId ?? ME) : ME;
    const now = deps.now();
    if (body.label) {
      await appendTimeline(db, {
        id: `m_${crypto.randomUUID()}`,
        chatId: chatIdOf(chat),
        sender: "user",
        userId,
        payload: { type: "text", text: body.label },
        now,
      });
    }
    await handleEvent(deps, {
      ...base(chat, userId, now),
      type: "postback",
      replyToken: mockReplyToken(chatIdOf(chat)),
      postback: { data: body.data },
    } as LineEvent);
    return c.json({ ok: true });
  });

  /** 時計を進めて、送信時刻が来たお知らせを送る */
  app.post("/clock", async (c) => {
    const body = await c.req.json<{ minutes?: number; toNext?: boolean }>();
    let deps = await c.var.getDeps();
    const offset = Number((await deps.repo.getKv(MOCK_CLOCK_KEY)) ?? "0") || 0;
    let add = Math.max(0, Math.min(body.minutes ?? 0, 60 * 24 * 60)) * 60_000;
    if (body.toNext) {
      const next = await deps.repo.nextReminderAt();
      if (next !== null) add = Math.max(0, next - deps.now() + 1000);
    }
    await deps.repo.setKv(MOCK_CLOCK_KEY, String(offset + add));
    deps = await c.var.getDeps(true);
    const result = await runScheduler(deps);
    return c.json({ ok: true, now: deps.now(), ...result });
  });

  app.post("/reset", async (c) => {
    const db = c.var.db;
    for (const t of TABLES) await db.run(`DELETE FROM ${t}`);
    return c.json({ ok: true });
  });

  return app;
}
