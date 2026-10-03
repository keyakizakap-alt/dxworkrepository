// アプリの保存処理。暗号化が必要な列はここで暗号化・復号する。
// 管理画面からは import しない（eslint の no-restricted-imports で禁止）。

import type { Cipher } from "./crypto";
import type { SqlDb } from "./sql";

export type ChatType = "group" | "room" | "user";

export interface Chat {
  id: string;
  type: ChatType;
  storeMessages: boolean;
}

export interface StoredMessage {
  id: string;
  userId: string | null;
  text: string;
  createdAt: number;
}

export interface Task {
  id: string;
  chatId: string;
  title: string;
  assignee: string | null;
  assigneeUserId: string | null;
  dueDate: string | null;
  status: "open" | "done" | "canceled";
  createdBy: string | null;
  createdAt: number;
}

export type ReminderKind = "reminder" | "broadcast";

export interface Reminder {
  id: string;
  chatId: string;
  targetId: string;
  targetType: "chat" | "user";
  kind: ReminderKind;
  content: string;
  fireAt: number;
  status: "scheduled" | "sent" | "failed" | "canceled";
  attempts: number;
  cost: number;
  createdBy: string | null;
  createdAt: number;
}

export interface Pending<P = unknown> {
  id: string;
  chatId: string;
  requesterId: string | null;
  kind: string;
  payload: P;
  status: "waiting" | "done" | "canceled";
  expiresAt: number;
}

export interface ConvState<P = unknown> {
  kind: string;
  payload: P;
  expiresAt: number;
}

interface TaskRow {
  id: string;
  chat_id: string;
  title_enc: string;
  assignee_enc: string | null;
  assignee_user_id: string | null;
  due_date: string | null;
  status: Task["status"];
  created_by: string | null;
  created_at: number;
}

interface ReminderRow {
  id: string;
  chat_id: string;
  target_id: string;
  target_type: Reminder["targetType"];
  kind: ReminderKind;
  content_enc: string;
  fire_at: number;
  status: Reminder["status"];
  attempts: number;
  cost: number;
  created_by: string | null;
  created_at: number;
}

export function newId(): string {
  return crypto.randomUUID();
}

export class Repo {
  constructor(
    private readonly db: SqlDb,
    private readonly cipher: Cipher,
  ) {}

  private enc(s: string): Promise<string> {
    return this.cipher.encrypt(s);
  }

  private async encOpt(s: string | null | undefined): Promise<string | null> {
    return s ? this.cipher.encrypt(s) : null;
  }

  private dec(s: string): Promise<string> {
    return this.cipher.decrypt(s);
  }

  private async decOpt(s: string | null): Promise<string | null> {
    return s ? this.cipher.decrypt(s) : null;
  }

  // ---------- chats ----------
  async ensureChat(id: string, type: ChatType, now: number): Promise<Chat> {
    await this.db.run(
      "INSERT OR IGNORE INTO chats (id, type, store_messages, created_at) VALUES (?, ?, 1, ?)",
      [id, type, now],
    );
    return (await this.getChat(id)) ?? { id, type, storeMessages: true };
  }

  async getChat(id: string): Promise<Chat | null> {
    const r = await this.db.first<{ id: string; type: ChatType; store_messages: number }>(
      "SELECT id, type, store_messages FROM chats WHERE id = ?",
      [id],
    );
    return r ? { id: r.id, type: r.type, storeMessages: r.store_messages === 1 } : null;
  }

  async setStoreMessages(chatId: string, on: boolean): Promise<void> {
    await this.db.run("UPDATE chats SET store_messages = ? WHERE id = ?", [on ? 1 : 0, chatId]);
    if (!on) await this.db.run("DELETE FROM messages WHERE chat_id = ?", [chatId]);
  }

  /** ボットがグループから外れたときなど：そのトークのデータを全部消す */
  async deleteChatData(chatId: string): Promise<void> {
    for (const table of ["messages", "bot_messages", "tasks", "pending_actions", "conv_states", "members"]) {
      await this.db.run(`DELETE FROM ${table} WHERE chat_id = ?`, [chatId]);
    }
    await this.db.run("DELETE FROM reminders WHERE chat_id = ? AND status = 'scheduled'", [chatId]);
    await this.db.run("UPDATE reminders SET content_enc = '' WHERE chat_id = ?", [chatId]);
    await this.db.run("DELETE FROM chats WHERE id = ?", [chatId]);
  }

  // ---------- members ----------
  async upsertMember(chatId: string, userId: string, name: string, now: number): Promise<void> {
    await this.db.run(
      `INSERT INTO members (chat_id, user_id, name_enc, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(chat_id, user_id) DO UPDATE SET name_enc = excluded.name_enc, updated_at = excluded.updated_at`,
      [chatId, userId, await this.enc(name), now],
    );
  }

  async getMember(chatId: string, userId: string): Promise<{ name: string; updatedAt: number } | null> {
    const r = await this.db.first<{ name_enc: string | null; updated_at: number }>(
      "SELECT name_enc, updated_at FROM members WHERE chat_id = ? AND user_id = ?",
      [chatId, userId],
    );
    if (!r?.name_enc) return null;
    return { name: await this.dec(r.name_enc), updatedAt: r.updated_at };
  }

  async listMembers(chatId: string): Promise<Array<{ userId: string; name: string }>> {
    const rows = await this.db.all<{ user_id: string; name_enc: string | null }>(
      "SELECT user_id, name_enc FROM members WHERE chat_id = ?",
      [chatId],
    );
    const out: Array<{ userId: string; name: string }> = [];
    for (const r of rows) if (r.name_enc) out.push({ userId: r.user_id, name: await this.dec(r.name_enc) });
    return out;
  }

  // ---------- messages（一時保存）----------
  async saveMessage(m: { id: string; chatId: string; userId: string | null; text: string; now: number; ttlMs: number }) {
    await this.db.run(
      "INSERT OR IGNORE INTO messages (id, chat_id, user_id, text_enc, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
      [m.id, m.chatId, m.userId, await this.enc(m.text), m.now, m.now + m.ttlMs],
    );
  }

  async getMessage(id: string): Promise<StoredMessage | null> {
    const r = await this.db.first<{ id: string; user_id: string | null; text_enc: string; created_at: number }>(
      "SELECT id, user_id, text_enc, created_at FROM messages WHERE id = ?",
      [id],
    );
    return r ? { id: r.id, userId: r.user_id, text: await this.dec(r.text_enc), createdAt: r.created_at } : null;
  }

  async listMessagesSince(chatId: string, since: number, limit = 200): Promise<StoredMessage[]> {
    const rows = await this.db.all<{ id: string; user_id: string | null; text_enc: string; created_at: number }>(
      `SELECT id, user_id, text_enc, created_at FROM messages
       WHERE chat_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT ?`,
      [chatId, since, limit],
    );
    const out: StoredMessage[] = [];
    for (const r of rows.reverse()) {
      out.push({ id: r.id, userId: r.user_id, text: await this.dec(r.text_enc), createdAt: r.created_at });
    }
    return out;
  }

  /** 直前の発言（「これやることにして」の「これ」を探す） */
  async previousMessage(chatId: string, beforeMs: number, excludeId: string): Promise<StoredMessage | null> {
    const r = await this.db.first<{ id: string; user_id: string | null; text_enc: string; created_at: number }>(
      `SELECT id, user_id, text_enc, created_at FROM messages
       WHERE chat_id = ? AND created_at <= ? AND id != ? ORDER BY created_at DESC LIMIT 1`,
      [chatId, beforeMs, excludeId],
    );
    return r ? { id: r.id, userId: r.user_id, text: await this.dec(r.text_enc), createdAt: r.created_at } : null;
  }

  async deleteMessage(id: string): Promise<void> {
    await this.db.run("DELETE FROM messages WHERE id = ?", [id]);
  }

  // ---------- bot messages ----------
  async saveBotMessage(id: string, chatId: string, ref: { type: string; id: string } | null, now: number, ttlMs: number) {
    await this.db.run(
      "INSERT OR IGNORE INTO bot_messages (id, chat_id, ref_type, ref_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, chatId, ref?.type ?? null, ref?.id ?? null, now, now + ttlMs],
    );
  }

  async getBotMessage(id: string): Promise<{ refType: string | null; refId: string | null } | null> {
    const r = await this.db.first<{ ref_type: string | null; ref_id: string | null }>(
      "SELECT ref_type, ref_id FROM bot_messages WHERE id = ?",
      [id],
    );
    return r ? { refType: r.ref_type, refId: r.ref_id } : null;
  }

  // ---------- tasks ----------
  private async toTask(r: TaskRow): Promise<Task> {
    return {
      id: r.id,
      chatId: r.chat_id,
      title: await this.dec(r.title_enc),
      assignee: await this.decOpt(r.assignee_enc),
      assigneeUserId: r.assignee_user_id,
      dueDate: r.due_date,
      status: r.status,
      createdBy: r.created_by,
      createdAt: r.created_at,
    };
  }

  async createTask(t: Omit<Task, "id" | "status" | "createdAt">, now: number): Promise<Task> {
    const id = newId();
    await this.db.run(
      `INSERT INTO tasks (id, chat_id, title_enc, assignee_enc, assignee_user_id, due_date, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      [id, t.chatId, await this.enc(t.title), await this.encOpt(t.assignee), t.assigneeUserId, t.dueDate, t.createdBy, now],
    );
    return { ...t, id, status: "open", createdAt: now };
  }

  async getTask(id: string): Promise<Task | null> {
    const r = await this.db.first<TaskRow>("SELECT * FROM tasks WHERE id = ?", [id]);
    return r ? this.toTask(r) : null;
  }

  async listOpenTasks(chatId: string): Promise<Task[]> {
    const rows = await this.db.all<TaskRow>(
      "SELECT * FROM tasks WHERE chat_id = ? AND status = 'open' ORDER BY (due_date IS NULL), due_date, created_at",
      [chatId],
    );
    return Promise.all(rows.map((r) => this.toTask(r)));
  }

  async latestTask(chatId: string): Promise<Task | null> {
    const r = await this.db.first<TaskRow>(
      "SELECT * FROM tasks WHERE chat_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1",
      [chatId],
    );
    return r ? this.toTask(r) : null;
  }

  async setTaskStatus(id: string, status: Task["status"], now: number): Promise<boolean> {
    const r = await this.db.run(
      "UPDATE tasks SET status = ?, completed_at = ? WHERE id = ? AND status != ?",
      [status, status === "done" ? now : null, id, status],
    );
    return r.changes > 0;
  }

  async setTaskAssignee(id: string, assignee: string, assigneeUserId: string | null): Promise<void> {
    await this.db.run("UPDATE tasks SET assignee_enc = ?, assignee_user_id = ? WHERE id = ?", [
      await this.enc(assignee),
      assigneeUserId,
      id,
    ]);
  }

  // ---------- reminders ----------
  private async toReminder(r: ReminderRow): Promise<Reminder> {
    return {
      id: r.id,
      chatId: r.chat_id,
      targetId: r.target_id,
      targetType: r.target_type,
      kind: r.kind,
      content: r.content_enc ? await this.dec(r.content_enc) : "",
      fireAt: r.fire_at,
      status: r.status,
      attempts: r.attempts,
      cost: r.cost,
      createdBy: r.created_by,
      createdAt: r.created_at,
    };
  }

  async createReminder(
    r: Omit<Reminder, "id" | "status" | "attempts" | "createdAt">,
    now: number,
  ): Promise<Reminder> {
    const id = newId();
    await this.db.run(
      `INSERT INTO reminders (id, chat_id, target_id, target_type, kind, content_enc, fire_at, status, attempts, cost, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', 0, ?, ?, ?)`,
      [id, r.chatId, r.targetId, r.targetType, r.kind, await this.enc(r.content), r.fireAt, r.cost, r.createdBy, now],
    );
    return { ...r, id, status: "scheduled", attempts: 0, createdAt: now };
  }

  async getReminder(id: string): Promise<Reminder | null> {
    const r = await this.db.first<ReminderRow>("SELECT * FROM reminders WHERE id = ?", [id]);
    return r ? this.toReminder(r) : null;
  }

  /** このトークで依頼された、または自分宛ての送信予定 */
  async listScheduled(chatId: string, userId: string | null): Promise<Reminder[]> {
    const rows = await this.db.all<ReminderRow>(
      `SELECT * FROM reminders WHERE status = 'scheduled' AND (chat_id = ? OR (target_type = 'user' AND target_id = ?))
       ORDER BY fire_at`,
      [chatId, userId ?? ""],
    );
    return Promise.all(rows.map((r) => this.toReminder(r)));
  }

  async latestReminder(chatId: string, createdBy: string | null, statuses: Reminder["status"][]): Promise<Reminder | null> {
    const marks = statuses.map(() => "?").join(",");
    const r = await this.db.first<ReminderRow>(
      `SELECT * FROM reminders WHERE chat_id = ? AND (created_by = ? OR ? IS NULL) AND status IN (${marks})
       ORDER BY created_at DESC LIMIT 1`,
      [chatId, createdBy, createdBy, ...statuses],
    );
    return r ? this.toReminder(r) : null;
  }

  async cancelReminder(id: string): Promise<boolean> {
    const r = await this.db.run("UPDATE reminders SET status = 'canceled' WHERE id = ? AND status = 'scheduled'", [id]);
    return r.changes > 0;
  }

  async dueReminders(now: number, limit = 50): Promise<Reminder[]> {
    const rows = await this.db.all<ReminderRow>(
      "SELECT * FROM reminders WHERE status = 'scheduled' AND fire_at <= ? ORDER BY fire_at LIMIT ?",
      [now, limit],
    );
    return Promise.all(rows.map((r) => this.toReminder(r)));
  }

  async nextReminderAt(): Promise<number | null> {
    const r = await this.db.first<{ fire_at: number }>(
      "SELECT fire_at FROM reminders WHERE status = 'scheduled' ORDER BY fire_at LIMIT 1",
    );
    return r?.fire_at ?? null;
  }

  async markReminderSent(id: string, now: number): Promise<void> {
    await this.db.run("UPDATE reminders SET status = 'sent', sent_at = ?, attempts = attempts + 1 WHERE id = ?", [now, id]);
  }

  async markReminderAttempt(id: string, failed: boolean): Promise<void> {
    await this.db.run(
      `UPDATE reminders SET attempts = attempts + 1, status = CASE WHEN ? THEN 'failed' ELSE status END WHERE id = ?`,
      [failed ? 1 : 0, id],
    );
  }

  /** 今月これから送る予定の通数 */
  async scheduledCostBetween(from: number, to: number): Promise<number> {
    const r = await this.db.first<{ total: number | null }>(
      "SELECT SUM(cost) AS total FROM reminders WHERE status = 'scheduled' AND fire_at >= ? AND fire_at < ?",
      [from, to],
    );
    return r?.total ?? 0;
  }

  // ---------- pending actions（確認ボタン待ち）----------
  async createPending<P>(p: Omit<Pending<P>, "id" | "status">, now: number): Promise<Pending<P>> {
    const id = newId();
    await this.db.run(
      `INSERT INTO pending_actions (id, chat_id, requester_id, kind, payload_enc, status, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'waiting', ?, ?)`,
      [id, p.chatId, p.requesterId, p.kind, await this.enc(JSON.stringify(p.payload)), p.expiresAt, now],
    );
    return { ...p, id, status: "waiting" };
  }

  async getPending<P>(id: string): Promise<Pending<P> | null> {
    const r = await this.db.first<{
      id: string;
      chat_id: string;
      requester_id: string | null;
      kind: string;
      payload_enc: string;
      status: Pending["status"];
      expires_at: number;
    }>("SELECT * FROM pending_actions WHERE id = ?", [id]);
    if (!r) return null;
    return {
      id: r.id,
      chatId: r.chat_id,
      requesterId: r.requester_id,
      kind: r.kind,
      payload: JSON.parse(await this.dec(r.payload_enc)) as P,
      status: r.status,
      expiresAt: r.expires_at,
    };
  }

  /** 二重押下対策：waiting のときだけ状態を変えられる */
  async finishPending(id: string, status: "done" | "canceled"): Promise<boolean> {
    const r = await this.db.run("UPDATE pending_actions SET status = ? WHERE id = ? AND status = 'waiting'", [status, id]);
    return r.changes > 0;
  }

  async updatePending<P>(id: string, payload: P, expiresAt: number): Promise<void> {
    await this.db.run("UPDATE pending_actions SET payload_enc = ?, expires_at = ? WHERE id = ?", [
      await this.enc(JSON.stringify(payload)),
      expiresAt,
      id,
    ]);
  }

  // ---------- conversation state（聞き返し中）----------
  async setState<P>(chatId: string, userId: string, kind: string, payload: P, expiresAt: number): Promise<void> {
    await this.db.run(
      `INSERT INTO conv_states (chat_id, user_id, kind, payload_enc, expires_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(chat_id, user_id) DO UPDATE SET kind = excluded.kind, payload_enc = excluded.payload_enc, expires_at = excluded.expires_at`,
      [chatId, userId, kind, await this.enc(JSON.stringify(payload)), expiresAt],
    );
  }

  async getState<P>(chatId: string, userId: string, now: number): Promise<ConvState<P> | null> {
    const r = await this.db.first<{ kind: string; payload_enc: string; expires_at: number }>(
      "SELECT kind, payload_enc, expires_at FROM conv_states WHERE chat_id = ? AND user_id = ? AND expires_at > ?",
      [chatId, userId, now],
    );
    if (!r) return null;
    return { kind: r.kind, payload: JSON.parse(await this.dec(r.payload_enc)) as P, expiresAt: r.expires_at };
  }

  async clearState(chatId: string, userId: string): Promise<void> {
    await this.db.run("DELETE FROM conv_states WHERE chat_id = ? AND user_id = ?", [chatId, userId]);
  }

  // ---------- webhook 重複排除 ----------
  async markEventProcessed(id: string, now: number): Promise<boolean> {
    const r = await this.db.run("INSERT OR IGNORE INTO processed_events (id, expires_at) VALUES (?, ?)", [
      id,
      now + 7 * 24 * 3600_000,
    ]);
    return r.changes > 0;
  }

  // ---------- Push 通数 ----------
  async getPushUsage(month: string): Promise<number> {
    const r = await this.db.first<{ used: number }>("SELECT used FROM push_usage WHERE month = ?", [month]);
    return r?.used ?? 0;
  }

  async addPushUsage(month: string, n: number): Promise<void> {
    await this.db.run(
      `INSERT INTO push_usage (month, used) VALUES (?, ?)
       ON CONFLICT(month) DO UPDATE SET used = used + excluded.used`,
      [month, n],
    );
  }

  // ---------- kv ----------
  async getKv(key: string): Promise<string | null> {
    const r = await this.db.first<{ value: string }>("SELECT value FROM kv WHERE key = ?", [key]);
    return r?.value ?? null;
  }

  async setKv(key: string, value: string): Promise<void> {
    await this.db.run(
      "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, value],
    );
  }

  // ---------- 期限切れデータの削除 ----------
  async cleanup(now: number): Promise<void> {
    await this.db.run("DELETE FROM messages WHERE expires_at <= ?", [now]);
    await this.db.run("DELETE FROM bot_messages WHERE expires_at <= ?", [now]);
    await this.db.run("DELETE FROM processed_events WHERE expires_at <= ?", [now]);
    await this.db.run("DELETE FROM conv_states WHERE expires_at <= ?", [now]);
    await this.db.run("DELETE FROM pending_actions WHERE expires_at <= ?", [now - 24 * 3600_000]);
    // 送信済みのお知らせ本文は 30 日で消す
    await this.db.run("UPDATE reminders SET content_enc = '' WHERE status != 'scheduled' AND fire_at <= ?", [
      now - 30 * 24 * 3600_000,
    ]);
    // 完了したやることは 90 日で消す
    await this.db.run("DELETE FROM tasks WHERE status != 'open' AND completed_at <= ?", [now - 90 * 24 * 3600_000]);
  }
}
