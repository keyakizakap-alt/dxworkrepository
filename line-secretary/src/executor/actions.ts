// Executor：許可された操作だけを実行する。LLM の出力もルールの出力も、必ずここを通る。
// 人に届く送信（リマインダー・グループへの予約送信）は、確認ボタンを押すまで登録しない。

import { resolveDueDate, resolveFireAt, type DateTimeParse } from "../core/datetime";
import { extractTasksOffline, summarizeOffline, type ConvLine, type ExtractedTask } from "../core/extract";
import { tidyTitle, type AssigneeRef, type Intent } from "../core/intent";
import { dateKey, formatDue, formatWhen, fromJst, monthKey, startOfJstDay, toJst, type JstDate } from "../core/jst";
import { trimTail } from "../core/normalize";
import { card, quickItem, text } from "../line/messages";
import type { LineMessage } from "../line/types";
import { llmExtractTasks, llmSummarize } from "../llm/tasks";
import type { ChatType, Reminder, Task } from "../store/repo";
import type { Deps } from "./deps";

export const PENDING_TTL_MS = 30 * 60_000;
export const STATE_TTL_MS = 10 * 60_000;

export interface Ctx {
  deps: Deps;
  chatId: string;
  chatType: ChatType;
  userId: string | null;
  userName: string;
  rawText: string;
  messageId: string | null;
  quoted: { kind: "bot"; refType: string | null; refId: string | null } | { kind: "user"; text: string } | null;
}

export interface Reply {
  messages: LineMessage[];
  ref?: { type: string; id: string };
}

export type NotifyKind = "reminder" | "broadcast";

export interface NotifyPayload {
  type: "notify";
  kind: NotifyKind;
  content: string;
  fireAt: number | null; // null = 今すぐ
  targetType: "chat" | "user";
  targetId: string;
  cost: number;
  verb: string;
}

export interface TasksPayload {
  type: "tasks";
  tasks: ExtractedTask[];
}

export type PendingPayload = NotifyPayload | TasksPayload;

export type StatePayload =
  | {
      type: "await_time";
      kind: NotifyKind;
      content: string | null;
      target: "here" | "self";
      date: JstDate | null;
      verb: string;
    }
  | { type: "await_content"; kind: NotifyKind | "task"; dt: DateTimeParse; verb: string }
  | { type: "edit"; pendingId: string };

const reply = (...messages: LineMessage[]): Reply => ({ messages });

const isGroupChat = (ctx: Ctx) => ctx.chatType !== "user";

function quotedText(ctx: Ctx): string | null {
  return ctx.quoted?.kind === "user" ? ctx.quoted.text : null;
}

function shortTitle(s: string): string {
  const t = tidyTitle(trimTail(s).split(/[。\n]/)[0] ?? "");
  return t.length > 30 ? `${t.slice(0, 29)}…` : t;
}

function honorific(name: string): string {
  return /(さん|くん|ちゃん|様)$/.test(name) ? name : `${name}さん`;
}

// ------------------------------------------------------------------
// お知らせ（リマインダー / グループへの予約送信）
// ------------------------------------------------------------------

async function memberCount(ctx: Ctx): Promise<number> {
  if (ctx.chatType === "user") return 1;
  const n = await ctx.deps.line.getMemberCount(ctx.chatType === "group" ? "group" : "room", ctx.chatId);
  // 取れない場合は多めに見積もる
  return n ?? 10;
}

interface QuotaCheck {
  ok: boolean;
  remaining: number;
  limit: number;
}

/** 無料枠（月の通数）に収まるか。グループ宛ては人数分を数える。 */
export async function checkQuota(deps: Deps, cost: number, fireAt: number): Promise<QuotaCheck> {
  const now = deps.now();
  let limit = deps.config.monthlyLimit;
  const month = monthKey(fireAt);
  let used = month === monthKey(now) ? await deps.repo.getPushUsage(month) : 0;
  if (month === monthKey(now)) {
    const remote = await deps.line.getQuota();
    if (remote) {
      if (remote.limit !== null) limit = remote.limit;
      used = Math.max(used, remote.used);
    }
  }
  const p = toJst(fireAt);
  const from = fromJst({ y: p.y, m: p.m, d: 1 });
  const to = p.m === 12 ? fromJst({ y: p.y + 1, m: 1, d: 1 }) : fromJst({ y: p.y, m: p.m + 1, d: 1 });
  const scheduled = await deps.repo.scheduledCostBetween(from, to);
  const remaining = limit - used - scheduled;
  return { ok: remaining >= cost, remaining, limit };
}

function quotaNote(q: QuotaCheck, cost: number): string {
  const after = q.remaining - cost;
  return after < q.limit * 0.2 ? `\n\n（今月のお知らせ枠：残り${Math.max(after, 0)}通）` : "";
}

interface NotifyDraft {
  kind: NotifyKind;
  content: string | null;
  target: "here" | "self";
  dt: DateTimeParse;
  verb: string;
}

export async function proposeNotify(ctx: Ctx, draft: NotifyDraft): Promise<Reply> {
  const { deps } = ctx;
  const now = deps.now();
  if (draft.kind === "broadcast" && !isGroupChat(ctx)) {
    return reply(text("グループへのお知らせは、そのグループの中で話しかけてください。"));
  }
  const content = draft.content ?? (quotedText(ctx) ? trimTail(quotedText(ctx) ?? "") : null);

  if (draft.kind === "broadcast" && !content) {
    await setState(ctx, { type: "await_content", kind: "broadcast", dt: draft.dt, verb: draft.verb });
    return reply(text("みんなに何と送りますか？"));
  }

  // 時刻
  let fireAt: number | null;
  const noWhen = !draft.dt.date && !draft.dt.time && !draft.dt.relativeMs && !draft.dt.vague;
  if (draft.kind === "broadcast" && noWhen) {
    fireAt = null;
  } else {
    const r = resolveFireAt(draft.dt, now);
    if (!r.ok) {
      await setState(ctx, {
        type: "await_time",
        kind: draft.kind,
        content,
        target: draft.target,
        date: draft.dt.date ?? null,
        verb: draft.verb,
      });
      if (r.reason === "past") return reply(text("その時間はもう過ぎています。いつ知らせますか？"));
      const day = draft.dt.date ? formatDue(dateKey(draft.dt.date), now).replace(/曜日$/, "曜") : "";
      return reply(text(day ? `${day}の何時ごろ知らせますか？` : "何時ごろ知らせますか？"));
    }
    fireAt = r.at;
  }

  // 送り先と通数
  let targetType: "chat" | "user" = "chat";
  let targetId = ctx.chatId;
  let cost = 1;
  if (draft.kind === "reminder" && (draft.target === "self" || !isGroupChat(ctx))) {
    if (!ctx.userId) return reply(text("ごめんなさい、あなた宛てに送る準備ができませんでした。"));
    if (isGroupChat(ctx)) {
      const friend = await deps.line.getFriendProfile(ctx.userId);
      if (!friend) {
        return reply(
          text("あなただけにお知らせするには、先に私を友だち追加してください。追加したあと、もう一度話しかけてくださいね。"),
        );
      }
    }
    targetType = "user";
    targetId = ctx.userId;
  } else if (isGroupChat(ctx)) {
    cost = await memberCount(ctx);
  }

  let note = "";
  if (fireAt !== null) {
    const q = await checkQuota(deps, cost, fireAt);
    if (!q.ok) {
      const hint =
        targetType === "chat" && draft.kind === "reminder"
          ? "\nグループ全員に送ると人数分を使います。「自分だけに知らせて」なら1通で済みます。"
          : "";
      return reply(
        text(`今月のお知らせ枠（残り${Math.max(q.remaining, 0)}通）を超えるため、登録できませんでした。${hint}`),
      );
    }
    note = quotaNote(q, cost);
  }

  const payload: NotifyPayload = {
    type: "notify",
    kind: draft.kind,
    content: content ?? "",
    fireAt,
    targetType,
    targetId,
    cost,
    verb: fireAt === null ? "送る" : draft.verb,
  };
  const pending = await deps.repo.createPending(
    { chatId: ctx.chatId, requesterId: ctx.userId, kind: "notify", payload, expiresAt: now + PENDING_TTL_MS },
    now,
  );
  return reply(notifyCard(payload, pending.id, now, isGroupChat(ctx), note));
}

export function notifyCard(p: NotifyPayload, pendingId: string, now: number, inGroup: boolean, note = ""): LineMessage {
  const when = p.fireAt === null ? "今すぐ" : `${formatWhen(p.fireAt, now)}に`;
  let body: string;
  if (p.kind === "broadcast") {
    body = `${when}、このグループへ\n\n『${p.content}』\n\nと送ります。`;
  } else {
    const to = inGroup && p.targetType === "user" ? "あなただけに" : "";
    const what = p.content ? `『${p.content}』と` : "";
    body = to ? `${when}、${to}${what}お知らせします。` : `${when}${what}お知らせします。`;
  }
  const buttons =
    p.kind === "broadcast"
      ? [
          { label: p.verb, data: `act=ok&p=${pendingId}`, primary: true },
          { label: "変更する", data: `act=edit&p=${pendingId}` },
        ]
      : [{ label: "登録する", data: `act=ok&p=${pendingId}`, primary: true }];
  return card(body + note, buttons);
}

/** 確認ボタンが押されたあとの登録 */
export async function commitNotify(ctx: Ctx, p: NotifyPayload): Promise<Reply> {
  const { deps } = ctx;
  const now = deps.now();
  if (p.fireAt === null) {
    // 今すぐ送る場合は、ボタンを押したときの返信（無料）で送る
    return { messages: [text(p.content)] };
  }
  if (p.fireAt <= now) {
    return reply(text("お知らせの時間を過ぎてしまいました。もう一度、時間を指定して話しかけてください。"));
  }
  const q = await checkQuota(deps, p.cost, p.fireAt);
  if (!q.ok) return reply(text(`今月のお知らせ枠（残り${Math.max(q.remaining, 0)}通）を超えるため、登録できませんでした。`));
  const r = await deps.repo.createReminder(
    {
      chatId: ctx.chatId,
      targetId: p.targetId,
      targetType: p.targetType,
      kind: p.kind,
      content: p.content,
      fireAt: p.fireAt,
      cost: p.cost,
      createdBy: ctx.userId,
    },
    now,
  );
  const when = formatWhen(p.fireAt, now);
  const msg =
    p.kind === "broadcast" ? `予約しました。${when}にこのグループへ送ります。` : `登録しました。${when}にお知らせします。`;
  return {
    messages: [text(msg, [quickItem("取り消す", `act=rm_del&r=${r.id}`)])],
    ref: { type: "reminder", id: r.id },
  };
}

// ------------------------------------------------------------------
// 状態（聞き返し）
// ------------------------------------------------------------------

export async function setState(ctx: Ctx, payload: StatePayload): Promise<void> {
  if (!ctx.userId) return;
  await ctx.deps.repo.setState(ctx.chatId, ctx.userId, payload.type, payload, ctx.deps.now() + STATE_TTL_MS);
}

// ------------------------------------------------------------------
// やること
// ------------------------------------------------------------------

async function resolveAssignee(ctx: Ctx, a: AssigneeRef | null): Promise<{ name: string | null; userId: string | null }> {
  if (!a) return { name: null, userId: null };
  if (a.self) return { name: ctx.userName, userId: ctx.userId };
  const name = a.name.replace(/(さん|くん|君|ちゃん|様|さま)$/, "");
  const members = await ctx.deps.repo.listMembers(ctx.chatId);
  const hit = members.find((m) => m.name === name) ?? members.find((m) => m.name.includes(name) || name.includes(m.name));
  return { name: hit?.name ?? name, userId: hit?.userId ?? null };
}

function taskLine(t: Task, now: number): string {
  const extra = [t.assignee ? honorific(t.assignee) : null, t.dueDate ? `${formatDue(t.dueDate, now)}まで` : null]
    .filter(Boolean)
    .join("・");
  return `・${t.title}${extra ? `（${extra}）` : ""}`;
}

export async function createTask(
  ctx: Ctx,
  title: string | null,
  assignee: AssigneeRef | null,
  dt: DateTimeParse,
): Promise<Reply> {
  const { deps } = ctx;
  const now = deps.now();
  let t = title;
  if (!t && quotedText(ctx)) t = shortTitle(quotedText(ctx) ?? "");
  if (!t && ctx.messageId) {
    const prev = await deps.repo.previousMessage(ctx.chatId, now, ctx.messageId);
    if (prev && now - prev.createdAt < 15 * 60_000) t = shortTitle(prev.text);
  }
  if (!t) {
    await setState(ctx, { type: "await_content", kind: "task", dt, verb: "" });
    return reply(text("何をやることにしますか？"));
  }
  const who = await resolveAssignee(ctx, assignee);
  const due = dt.date || dt.deadline ? resolveDueDate(dt, now) : undefined;
  const task = await deps.repo.createTask(
    {
      chatId: ctx.chatId,
      title: t,
      assignee: who.name,
      assigneeUserId: who.userId,
      dueDate: due ? dateKey(due) : null,
      createdBy: ctx.userId,
    },
    now,
  );
  const lines = [`${task.title}をタスクにしました。`];
  if (task.assignee) lines.push(`担当：${task.assignee}`);
  if (task.dueDate) lines.push(`期限：${formatDue(task.dueDate, now)}`);
  return {
    messages: [text(lines.join("\n"), [quickItem("取り消す", `act=task_del&t=${task.id}`)])],
    ref: { type: "task", id: task.id },
  };
}

export async function assignTask(ctx: Ctx, assignee: AssigneeRef): Promise<Reply> {
  let task: Task | null = null;
  if (ctx.quoted?.kind === "bot" && ctx.quoted.refType === "task" && ctx.quoted.refId) {
    task = await ctx.deps.repo.getTask(ctx.quoted.refId);
  }
  task ??= await ctx.deps.repo.latestTask(ctx.chatId);
  if (!task) return reply(text("担当を決めるやることが見つかりませんでした。先に「〇〇をやることにして」と送ってください。"));
  const who = await resolveAssignee(ctx, assignee);
  await ctx.deps.repo.setTaskAssignee(task.id, who.name ?? assignee.name, who.userId);
  return { messages: [text(`${task.title}の担当を${honorific(who.name ?? assignee.name)}にしました。`)], ref: { type: "task", id: task.id } };
}

function norm(s: string): string {
  return s.replace(/[のをはがも\s]/g, "");
}

/** 「これ終わった」が、どのやることを指すか探す */
export async function findTaskForCompletion(ctx: Ctx, hint: string | null): Promise<Task | Task[] | null> {
  const { repo } = ctx.deps;
  if (ctx.quoted?.kind === "bot" && ctx.quoted.refType === "task" && ctx.quoted.refId) {
    const t = await repo.getTask(ctx.quoted.refId);
    if (t && t.status === "open") return t;
  }
  const open = await repo.listOpenTasks(ctx.chatId);
  if (open.length === 0) return null;
  const key = hint ?? (quotedText(ctx) ? shortTitle(quotedText(ctx) ?? "") : null);
  if (key) {
    const k = norm(key);
    const hits = open.filter((t) => norm(t.title).includes(k) || k.includes(norm(t.title)));
    if (hits.length === 1) return hits[0] ?? null;
    if (hits.length > 1) return hits;
    return null;
  }
  const mine = open.filter((t) => t.assigneeUserId && t.assigneeUserId === ctx.userId);
  if (mine.length === 1) return mine[0] ?? null;
  if (open.length === 1) return open[0] ?? null;
  return mine.length > 1 ? mine : open;
}

export async function completeTask(ctx: Ctx, hint: string | null): Promise<Reply> {
  const found = await findTaskForCompletion(ctx, hint);
  if (!found) {
    return reply(text(hint ? `「${hint}」というやることは見つかりませんでした。` : "まだ終わっていないやることはありません。"));
  }
  if (Array.isArray(found)) {
    return reply(
      text(
        "どれが終わりましたか？",
        found.slice(0, 12).map((t) => quickItem(t.title, `act=done&t=${t.id}`)),
      ),
    );
  }
  return markDone(ctx, found.id);
}

export async function markDone(ctx: Ctx, taskId: string): Promise<Reply> {
  const t = await ctx.deps.repo.getTask(taskId);
  if (!t || t.chatId !== ctx.chatId) return reply(text("そのやることは見つかりませんでした。"));
  const changed = await ctx.deps.repo.setTaskStatus(t.id, "done", ctx.deps.now());
  if (!changed) return reply(text(`${t.title}は、もう完了になっています。`));
  return {
    messages: [text(`${t.title}を完了にしました。おつかれさまです。`, [quickItem("元に戻す", `act=undo_done&t=${t.id}`)])],
    ref: { type: "task", id: t.id },
  };
}

export async function listTasks(ctx: Ctx): Promise<Reply> {
  const now = ctx.deps.now();
  const open = await ctx.deps.repo.listOpenTasks(ctx.chatId);
  if (open.length === 0) return reply(text("まだ終わっていないことはありません。"));
  const body = [`まだ終わっていないこと（${open.length}件）`, "", ...open.map((t) => taskLine(t, now))].join("\n");
  return reply(text(body, open.slice(0, 12).map((t) => quickItem(`${t.title} 終わった`, `act=done&t=${t.id}`))));
}

// ------------------------------------------------------------------
// お知らせの一覧・削除・もう一回
// ------------------------------------------------------------------

function reminderLine(r: Reminder, now: number, inGroup: boolean): string {
  const to = r.kind === "broadcast" ? "グループへ送信" : inGroup && r.targetType === "user" ? "あなたに" : "";
  return `・${formatWhen(r.fireAt, now)} ${r.content || "お知らせ"}${to ? `（${to}）` : ""}`;
}

export async function listReminders(ctx: Ctx): Promise<Reply> {
  const now = ctx.deps.now();
  const items = (await ctx.deps.repo.listScheduled(ctx.chatId, ctx.userId)).filter(
    (r) => r.targetType === "chat" || r.targetId === ctx.userId,
  );
  if (items.length === 0) return reply(text("予定しているお知らせはありません。"));
  const body = ["予定しているお知らせ", "", ...items.map((r) => reminderLine(r, now, isGroupChat(ctx)))].join("\n");
  return reply(
    text(
      body,
      items.slice(0, 12).map((r) => quickItem(`消す：${r.content || formatWhen(r.fireAt, now)}`, `act=rm_del&r=${r.id}`)),
    ),
  );
}

export async function deleteReminder(ctx: Ctx, hint: string | null): Promise<Reply> {
  const now = ctx.deps.now();
  const items = (await ctx.deps.repo.listScheduled(ctx.chatId, ctx.userId)).filter(
    (r) => r.createdBy === ctx.userId || r.targetId === ctx.userId,
  );
  let target: Reminder | undefined;
  if (ctx.quoted?.kind === "bot" && ctx.quoted.refType === "reminder") {
    target = items.find((r) => r.id === (ctx.quoted as { refId: string | null }).refId);
  }
  if (!target && hint) target = items.find((r) => norm(r.content).includes(norm(hint)));
  if (!target && !hint) target = [...items].sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!target) return reply(text("消せるお知らせが見つかりませんでした。"));
  await ctx.deps.repo.cancelReminder(target.id);
  const what = target.content ? `『${target.content}』の` : "";
  return reply(text(`${formatWhen(target.fireAt, now)}の${what}お知らせを消しました。`));
}

export async function cancelReminderById(ctx: Ctx, id: string): Promise<Reply> {
  const r = await ctx.deps.repo.getReminder(id);
  if (!r || r.status !== "scheduled") return reply(text("そのお知らせは、もう予定にありません。"));
  if (r.createdBy !== ctx.userId && r.targetId !== ctx.userId) return reply(text("登録した方が消してください。"));
  await ctx.deps.repo.cancelReminder(id);
  return reply(text(`${formatWhen(r.fireAt, ctx.deps.now())}のお知らせを消しました。`));
}

export async function repeatReminder(ctx: Ctx, dt: DateTimeParse, weekShift: number): Promise<Reply> {
  const now = ctx.deps.now();
  const base = await ctx.deps.repo.latestReminder(ctx.chatId, ctx.userId, ["sent", "scheduled"]);
  if (!base) return proposeNotify(ctx, { kind: "reminder", content: null, target: "here", dt, verb: "登録する" });
  const target: "here" | "self" = base.targetType === "user" && isGroupChat(ctx) ? "self" : "here";
  const baseTime = toJst(base.fireAt);
  const next: DateTimeParse = { ...dt, spans: [] };
  if (weekShift > 0) {
    let at = base.fireAt + weekShift * 7 * 24 * 3600_000;
    while (at <= now) at += 7 * 24 * 3600_000;
    const p = toJst(at);
    next.date = { y: p.y, m: p.m, d: p.d };
    next.time = { h: p.h, mi: p.mi, bare: false };
    next.weekdayOnly = false;
  } else if (dt.date && !dt.time) {
    next.time = { h: baseTime.h, mi: baseTime.mi, bare: false };
  }
  return proposeNotify(ctx, { kind: base.kind, content: base.content || null, target, dt: next, verb: "登録する" });
}

// ------------------------------------------------------------------
// まとめ・やること抽出
// ------------------------------------------------------------------

async function conversation(ctx: Ctx, since: number): Promise<ConvLine[]> {
  const { repo } = ctx.deps;
  const msgs = await repo.listMessagesSince(ctx.chatId, since);
  const members = await repo.listMembers(ctx.chatId);
  const nameOf = (id: string | null) => members.find((m) => m.userId === id)?.name ?? "メンバー";
  return msgs.map((m) => ({ name: nameOf(m.userId), userId: m.userId, text: m.text, at: m.createdAt }));
}

async function storingOff(ctx: Ctx): Promise<Reply | null> {
  const chat = await ctx.deps.repo.getChat(ctx.chatId);
  if (chat && !chat.storeMessages) {
    return reply(text("会話の保存を止めているので、まとめられません。「会話の保存を再開して」で再開できます。"));
  }
  return null;
}

async function withLlm<T>(ctx: Ctx, fn: () => Promise<T>, fallback: () => T): Promise<T> {
  const { llm, metrics, now } = ctx.deps;
  if (!llm) return fallback();
  try {
    await metrics.inc("llm_calls", now());
    if (ctx.chatType === "user" && ctx.userId) await ctx.deps.line.showLoading(ctx.userId);
    return await fn();
  } catch {
    await metrics.inc("llm_errors", now());
    return fallback();
  }
}

export async function summarize(ctx: Ctx): Promise<Reply> {
  const off = await storingOff(ctx);
  if (off) return off;
  const now = ctx.deps.now();
  let lines = await conversation(ctx, startOfJstDay(now));
  if (lines.length === 0) lines = await conversation(ctx, now - ctx.deps.config.retentionHours * 3600_000);
  if (lines.length === 0) {
    return reply(text("まとめられる会話がまだありません。（私がこのトークに入ってからの会話だけを見ています）"));
  }
  const s = await withLlm(
    ctx,
    () => llmSummarize(ctx.deps.llm!, lines, now),
    () => summarizeOffline(lines, now),
  );
  const parts = ["今日決まったこと", ""];
  parts.push(...(s.decisions.length ? s.decisions.map((d) => `・${d}`) : ["・はっきり決まったことは見つかりませんでした"]));
  if (s.todos.length) parts.push("", "やること", "", ...s.todos.map((t) => `・${t.title}`));
  const quick = [];
  if (s.todos.length) {
    const pending = await ctx.deps.repo.createPending<TasksPayload>(
      {
        chatId: ctx.chatId,
        requesterId: ctx.userId,
        kind: "tasks",
        payload: { type: "tasks", tasks: s.todos },
        expiresAt: now + PENDING_TTL_MS,
      },
      now,
    );
    quick.push(quickItem("やることに登録", `act=ok&p=${pending.id}`));
  }
  return reply(text(parts.join("\n"), quick));
}

export async function extractTasks(ctx: Ctx): Promise<Reply> {
  const off = await storingOff(ctx);
  if (off) return off;
  const now = ctx.deps.now();
  const lines = await conversation(ctx, now - Math.min(ctx.deps.config.retentionHours, 12) * 3600_000);
  if (lines.length === 0) {
    return reply(text("まとめられる会話がまだありません。（私がこのトークに入ってからの会話だけを見ています）"));
  }
  const tasks = await withLlm(
    ctx,
    () => llmExtractTasks(ctx.deps.llm!, lines, now),
    () => extractTasksOffline(lines, now),
  );
  if (tasks.length === 0) return reply(text("やることになりそうな話は見つかりませんでした。"));
  const pending = await ctx.deps.repo.createPending<TasksPayload>(
    {
      chatId: ctx.chatId,
      requesterId: ctx.userId,
      kind: "tasks",
      payload: { type: "tasks", tasks },
      expiresAt: now + PENDING_TTL_MS,
    },
    now,
  );
  let body: string;
  const first = tasks[0];
  if (tasks.length === 1 && first) {
    const lines2 = [`${first.title}をタスク候補として見つけました。`, ""];
    if (first.assigneeName) lines2.push(`担当：${first.assigneeName}`);
    if (first.dueDate) lines2.push(`期限：${formatDue(first.dueDate, now)}`);
    lines2.push("", "登録しますか？");
    body = lines2.join("\n").replace(/\n\n\n/g, "\n\n");
  } else {
    body = [
      `タスク候補が${tasks.length}件見つかりました。`,
      "",
      ...tasks.map((t) => {
        const extra = [t.assigneeName ? `担当：${t.assigneeName}` : null, t.dueDate ? `期限：${formatDue(t.dueDate, now)}` : null]
          .filter(Boolean)
          .join("・");
        return `・${t.title}${extra ? `（${extra}）` : ""}`;
      }),
      "",
      "登録しますか？",
    ].join("\n");
  }
  return reply(
    card(body, [
      { label: "登録する", data: `act=ok&p=${pending.id}`, primary: true },
      { label: "やめる", data: `act=no&p=${pending.id}` },
    ]),
  );
}

export async function commitTasks(ctx: Ctx, p: TasksPayload): Promise<Reply> {
  const now = ctx.deps.now();
  for (const t of p.tasks) {
    await ctx.deps.repo.createTask(
      {
        chatId: ctx.chatId,
        title: t.title,
        assignee: t.assigneeName,
        assigneeUserId: t.assigneeUserId,
        dueDate: t.dueDate,
        createdBy: ctx.userId,
      },
      now,
    );
  }
  const first = p.tasks[0];
  const msg = p.tasks.length === 1 && first ? `${first.title}をタスクにしました。` : `${p.tasks.length}件をタスクにしました。`;
  return reply(text(msg));
}

// ------------------------------------------------------------------
// その他
// ------------------------------------------------------------------

export function helpReply(): Reply {
  return reply(
    text(
      [
        "予定ややることを預かります。普通に話しかけてください。",
        "",
        "・明日20時に教えて",
        "・金曜の18時に、明日は10時集合ってみんなに送って",
        "・ホテルの予約、田中さん担当で金曜までにお願い",
        "・まだ終わってないことある？",
        "・今日決まったことまとめて",
      ].join("\n"),
    ),
  );
}

export async function setStoring(ctx: Ctx, on: boolean): Promise<Reply> {
  await ctx.deps.repo.setStoreMessages(ctx.chatId, on);
  return reply(
    text(
      on
        ? "会話の保存を再開しました。まとめに使う会話は、最大" + ctx.deps.config.retentionHours + "時間で自動的に消えます。"
        : "会話の保存を止めて、保存していた会話を消しました。まとめ機能は使えなくなります。",
    ),
  );
}

/** Intent → 実行。ここに無い操作は実行されない。 */
export async function execute(ctx: Ctx, intent: Intent): Promise<Reply | null> {
  const verb = /送って|流して|アナウンス/.test(ctx.rawText) ? "予約する" : "登録する";
  switch (intent.kind) {
    case "create_reminder":
      return proposeNotify(ctx, { kind: "reminder", content: intent.content, target: intent.target, dt: intent.dt, verb });
    case "schedule_group_message":
      return proposeNotify(ctx, { kind: "broadcast", content: intent.content, target: "here", dt: intent.dt, verb });
    case "create_task":
      return createTask(ctx, intent.title, intent.assignee, intent.dt);
    case "assign_task":
      return assignTask(ctx, intent.assignee);
    case "complete_task":
      return completeTask(ctx, intent.hint);
    case "list_tasks":
      return listTasks(ctx);
    case "list_reminders":
      return listReminders(ctx);
    case "delete_reminder":
      return deleteReminder(ctx, intent.hint);
    case "repeat_reminder":
      return repeatReminder(ctx, intent.dt, intent.weekShift);
    case "summarize":
      return summarize(ctx);
    case "extract_tasks":
      return extractTasks(ctx);
    case "stop_storing":
      return setStoring(ctx, false);
    case "resume_storing":
      return setStoring(ctx, true);
    case "help":
      return helpReply();
    case "unknown":
      return null;
  }
}
