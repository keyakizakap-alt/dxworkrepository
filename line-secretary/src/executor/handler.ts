// Webhook イベントの振り分け。
// グループでは「メンション」「ボットへの返信」「はっきりした依頼」のときだけ反応し、雑談には割り込まない。

import { hasDateTime, parseDateTime, resolveFireAt } from "../core/datetime";
import { parseIntent, type Intent } from "../core/intent";
import { toJst } from "../core/jst";
import { normalizeText, stripMention } from "../core/normalize";
import { text } from "../line/messages";
import type { EventSource, LineEvent, TextMessageContent } from "../line/types";
import { llmParseIntent } from "../llm/tasks";
import type { ChatType } from "../store/repo";
import {
  cancelReminderById,
  commitNotify,
  commitTasks,
  execute,
  findTaskForCompletion,
  markDone,
  notifyCard,
  PENDING_TTL_MS,
  proposeNotify,
  createTask,
  setState,
  type Ctx,
  type NotifyPayload,
  type PendingPayload,
  type Reply,
  type StatePayload,
} from "./actions";
import type { Deps } from "./deps";

const PROFILE_REFRESH_MS = 7 * 24 * 3600_000;

function chatOf(source: EventSource): { chatId: string; chatType: ChatType } | null {
  if (source.type === "group" && source.groupId) return { chatId: source.groupId, chatType: "group" };
  if (source.type === "room" && source.roomId) return { chatId: source.roomId, chatType: "room" };
  if (source.type === "user" && source.userId) return { chatId: source.userId, chatType: "user" };
  return null;
}

async function displayName(deps: Deps, chatId: string, chatType: ChatType, userId: string | null): Promise<string> {
  if (!userId) return "メンバー";
  const now = deps.now();
  const cached = await deps.repo.getMember(chatId, userId);
  if (cached && now - cached.updatedAt < PROFILE_REFRESH_MS) return cached.name;
  const profile =
    chatType === "user"
      ? await deps.line.getFriendProfile(userId)
      : await deps.line.getMemberProfile(chatType === "group" ? "group" : "room", chatId, userId);
  if (profile?.displayName) {
    await deps.repo.upsertMember(chatId, userId, profile.displayName, now);
    return profile.displayName;
  }
  return cached?.name ?? "メンバー";
}

async function sendReply(deps: Deps, ctx: { chatId: string }, replyToken: string, r: Reply | null): Promise<void> {
  if (!r || r.messages.length === 0) return;
  const sent = await deps.line.reply(replyToken, r.messages);
  const now = deps.now();
  for (const s of sent) {
    await deps.repo.saveBotMessage(s.id, ctx.chatId, r.ref ?? null, now, deps.config.retentionHours * 3600_000);
  }
}

export async function handleEvent(deps: Deps, event: LineEvent): Promise<void> {
  const now = deps.now();
  if (event.mode === "standby") return;
  if (!(await deps.repo.markEventProcessed(event.webhookEventId, now))) return; // 再送の重複
  await deps.metrics.inc("webhook_events", now);

  const chat = chatOf(event.source);
  if (!chat) return;
  const userId = event.source.userId ?? null;

  switch (event.type) {
    case "join": {
      await deps.repo.ensureChat(chat.chatId, chat.chatType, now);
      await deps.metrics.inc("joined", now);
      await sendReply(deps, chat, event.replyToken, {
        messages: [
          text(
            [
              "グループに入れてくれてありがとうございます。",
              "予定ややることを、普通に話しかけてもらえれば預かります。",
              "",
              "例：「明日20時に教えて」「今日決まったことまとめて」",
              "",
              `まとめのために、このグループの会話を最大${deps.config.retentionHours}時間だけ保存し、その後は自動で消します。`,
              "保存してほしくないときは「会話の保存やめて」と送ってください。",
            ].join("\n"),
          ),
        ],
      });
      return;
    }
    case "follow": {
      await deps.repo.ensureChat(chat.chatId, "user", now);
      await sendReply(deps, chat, event.replyToken, {
        messages: [
          text(
            [
              "友だち追加ありがとうございます。",
              "予定ややることを、普通に話しかけてもらえれば忘れないようにお知らせします。",
              "",
              "例：「明日の朝8時にゴミ出しって教えて」",
              "",
              "いつものグループに招待してもらえれば、グループでも使えます。",
            ].join("\n"),
          ),
        ],
      });
      return;
    }
    case "leave":
    case "unfollow":
      await deps.repo.deleteChatData(chat.chatId);
      await deps.metrics.inc("left", now);
      return;
    case "unsend":
      await deps.repo.deleteMessage(event.unsend.messageId);
      return;
    case "postback":
      await handlePostback(deps, chat, userId, event.replyToken, event.postback.data);
      return;
    case "message":
      if (event.message.type !== "text") return;
      await handleText(deps, chat, userId, event.replyToken, event.message);
      return;
    default:
      return;
  }
}

async function buildCtx(
  deps: Deps,
  chat: { chatId: string; chatType: ChatType },
  userId: string | null,
  rawText: string,
  messageId: string | null,
  quotedMessageId: string | undefined,
): Promise<Ctx> {
  let quoted: Ctx["quoted"] = null;
  if (quotedMessageId) {
    const bot = await deps.repo.getBotMessage(quotedMessageId);
    if (bot) quoted = { kind: "bot", refType: bot.refType, refId: bot.refId };
    else {
      const m = await deps.repo.getMessage(quotedMessageId);
      if (m) quoted = { kind: "user", text: m.text };
    }
  }
  return {
    deps,
    ...chat,
    userId,
    userName: await displayName(deps, chat.chatId, chat.chatType, userId),
    rawText,
    messageId,
    quoted,
  };
}

async function handleText(
  deps: Deps,
  chat: { chatId: string; chatType: ChatType },
  userId: string | null,
  replyToken: string,
  message: TextMessageContent,
): Promise<void> {
  const now = deps.now();
  const chatRow = await deps.repo.ensureChat(chat.chatId, chat.chatType, now);
  const inGroup = chat.chatType !== "user";

  // メンション（@ことづて）を検出して本文から外す
  const selfMentions = (message.mention?.mentionees ?? []).filter((m) => m.isSelf);
  let body = stripMention(message.text, selfMentions);
  const nameMention = new RegExp(`^@?${deps.config.botName}[\\s、,:：]*`);
  const calledByName = nameMention.test(body);
  body = body.replace(nameMention, "");
  const t = normalizeText(body);

  const ctx = await buildCtx(deps, chat, userId, t, message.id, message.quotedMessageId);
  const mentioned = selfMentions.length > 0 || calledByName;
  const repliedToBot = ctx.quoted?.kind === "bot";
  const addressed = !inGroup || mentioned || repliedToBot;

  const remember = async () => {
    if (chatRow.storeMessages && t) {
      await deps.repo.saveMessage({
        id: message.id,
        chatId: chat.chatId,
        userId,
        text: message.text,
        now,
        ttlMs: deps.config.retentionHours * 3600_000,
      });
    }
  };

  // 1) 聞き返し中の続き
  if (userId) {
    const state = await deps.repo.getState<StatePayload>(chat.chatId, userId, now);
    if (state) {
      const r = await continueState(ctx, state.payload, addressed);
      if (r) {
        await deps.metrics.inc("messages_handled", now);
        await sendReply(deps, chat, replyToken, r);
        return;
      }
    }
  }

  // 2) ルールで読む
  const rule = parseIntent(t, now);
  let intent: Intent = rule.intent;
  let respond = addressed || rule.strong;

  // 「ホテル予約終わった」は、そのやることが実在するときだけグループで反応する
  if (inGroup && !respond && intent.kind === "complete_task") {
    const found = await findTaskForCompletion(ctx, intent.hint);
    respond = Boolean(found) && !Array.isArray(found) && Boolean(intent.hint);
  }
  if (!respond) {
    await remember();
    return;
  }

  // 3) ルールで読めなければ LLM（使える場合だけ）
  if (intent.kind === "unknown" && deps.llm && t.length >= 4) {
    try {
      await deps.metrics.inc("llm_calls", now);
      const names = (await deps.repo.listMembers(chat.chatId)).map((m) => m.name);
      intent = await llmParseIntent(deps.llm, t, names, now);
    } catch {
      await deps.metrics.inc("llm_errors", now);
    }
  }

  await deps.metrics.inc(`intent:${intent.kind}`, now);
  const r = await execute(ctx, intent);
  if (!r) {
    if (inGroup && !addressed) {
      await remember();
      return;
    }
    await sendReply(deps, chat, replyToken, {
      messages: [
        text("ごめんなさい、うまく読み取れませんでした。\n「明日20時に教えて」「これやることにして」のように話しかけてみてください。"),
      ],
    });
    return;
  }
  await deps.metrics.inc("messages_handled", now);
  await sendReply(deps, chat, replyToken, r);
}

/** 「何時ごろ？」「何と送りますか？」「どう変えますか？」への返事 */
async function continueState(ctx: Ctx, state: StatePayload, addressed: boolean): Promise<Reply | null> {
  const { deps } = ctx;
  const now = deps.now();
  const userId = ctx.userId ?? "";
  const t = ctx.rawText;
  const dt = parseDateTime(t, now);
  const inGroup = ctx.chatType !== "user";
  const rule = parseIntent(t, now);
  const isOtherRequest = rule.strong && rule.intent.kind !== "create_reminder";

  if (/^(やめる|やめて|キャンセル|いいや|やっぱりいい|大丈夫です)$/.test(t)) {
    await deps.repo.clearState(ctx.chatId, userId);
    return { messages: [text("わかりました。やめておきます。")] };
  }

  switch (state.type) {
    case "await_time": {
      if (!(dt.time || dt.relativeMs)) {
        if (inGroup && !addressed) return null; // グループの雑談は横取りしない
        if (isOtherRequest) {
          await deps.repo.clearState(ctx.chatId, userId);
          return null;
        }
        return { messages: [text("何時ごろにしますか？（例：20時、朝8時）")] };
      }
      await deps.repo.clearState(ctx.chatId, userId);
      const merged = { ...dt, date: dt.date ?? state.date ?? undefined, spans: [] };
      return proposeNotify(ctx, {
        kind: state.kind,
        content: state.content,
        target: state.target,
        dt: merged,
        verb: state.verb,
      });
    }
    case "await_content": {
      if (inGroup && !addressed && isOtherRequest) return null;
      if (!t) return null;
      await deps.repo.clearState(ctx.chatId, userId);
      if (state.kind === "task") return createTask(ctx, t, null, state.dt);
      const content = state.kind === "broadcast" && !/(です|ます|[!！?？。])$/.test(t) ? `${t}です` : t;
      return proposeNotify(ctx, { kind: state.kind, content, target: "here", dt: state.dt, verb: state.verb });
    }
    case "edit": {
      const pending = await deps.repo.getPending<PendingPayload>(state.pendingId);
      await deps.repo.clearState(ctx.chatId, userId);
      if (!pending || pending.status !== "waiting" || pending.payload.type !== "notify") return null;
      const p: NotifyPayload = { ...pending.payload };
      const contentMatch = /(?:内容|文面|メッセージ|本文)(?:は|を)\s*(.+?)(?:に(?:して|変えて))?$/.exec(t);
      if (hasDateTime(dt) && !contentMatch) {
        const base = p.fireAt ?? now;
        const merged = { ...dt, spans: [] as Array<[number, number]> };
        const b = toJst(base);
        if (!merged.date && !merged.relativeMs) merged.date = { y: b.y, m: b.m, d: b.d };
        if (!merged.time && !merged.relativeMs) merged.time = { h: b.h, mi: b.mi, bare: false };
        const r = resolveFireAt(merged, now);
        if (!r.ok) {
          await setState(ctx, { type: "edit", pendingId: pending.id });
          return { messages: [text("その時間では登録できません。別の時間を教えてください。")] };
        }
        p.fireAt = r.at;
        if (p.verb === "送る") p.verb = "予約する";
      } else {
        const c = (contentMatch?.[1] ?? t).trim();
        p.content = p.kind === "broadcast" && !/(です|ます|[!！?？。])$/.test(c) ? `${c}です` : c;
      }
      await deps.repo.updatePending(pending.id, p, now + PENDING_TTL_MS);
      return { messages: [notifyCard(p, pending.id, now, ctx.chatType !== "user")] };
    }
  }
}

async function handlePostback(
  deps: Deps,
  chat: { chatId: string; chatType: ChatType },
  userId: string | null,
  replyToken: string,
  data: string,
): Promise<void> {
  const now = deps.now();
  const q = new URLSearchParams(data);
  const act = q.get("act");
  const ctx = await buildCtx(deps, chat, userId, "", null, undefined);
  let r: Reply | null = null;

  if (act === "ok" || act === "edit" || act === "no") {
    const id = q.get("p") ?? "";
    const pending = await deps.repo.getPending<PendingPayload>(id);
    if (!pending || pending.chatId !== chat.chatId) {
      r = { messages: [text("この確認は見つかりませんでした。もう一度話しかけてください。")] };
    } else if (pending.requesterId && pending.requesterId !== userId) {
      r = { messages: [text("お願いした方が押してください。")] };
    } else if (pending.status !== "waiting") {
      r = { messages: [text(pending.status === "done" ? "もう登録してあります。" : "この確認は取り消し済みです。")] };
    } else if (pending.expiresAt <= now) {
      r = { messages: [text("時間がたったため、この確認は使えなくなりました。もう一度話しかけてください。")] };
    } else if (act === "edit") {
      await setState(ctx, { type: "edit", pendingId: pending.id });
      r = { messages: [text("どう変えますか？\n「21時にして」「内容は〇〇」のように送ってください。")] };
    } else if (act === "no") {
      await deps.repo.finishPending(pending.id, "canceled");
      r = { messages: [text("やめておきました。")] };
    } else if (await deps.repo.finishPending(pending.id, "done")) {
      if (userId) await deps.repo.clearState(chat.chatId, userId);
      r = pending.payload.type === "notify" ? await commitNotify(ctx, pending.payload) : await commitTasks(ctx, pending.payload);
    } else {
      r = { messages: [text("もう登録してあります。")] };
    }
  } else if (act === "done") {
    r = await markDone(ctx, q.get("t") ?? "");
  } else if (act === "undo_done") {
    const t = await deps.repo.getTask(q.get("t") ?? "");
    if (t && t.chatId === chat.chatId && (await deps.repo.setTaskStatus(t.id, "open", now))) {
      r = { messages: [text(`${t.title}を、まだ終わっていないことに戻しました。`)] };
    }
  } else if (act === "task_del") {
    const t = await deps.repo.getTask(q.get("t") ?? "");
    if (t && t.chatId === chat.chatId && (await deps.repo.setTaskStatus(t.id, "canceled", now))) {
      r = { messages: [text(`${t.title}を取り消しました。`)] };
    }
  } else if (act === "rm_del") {
    r = await cancelReminderById(ctx, q.get("r") ?? "");
  }
  await deps.metrics.inc(`intent:postback_${act ?? "unknown"}`, now);
  await sendReply(deps, chat, replyToken, r);
}
