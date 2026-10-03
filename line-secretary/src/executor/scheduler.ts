// 毎分動く：送信時刻が来たお知らせを Push で送る（Push は通数にカウントされる）

import { monthKey } from "../core/jst";
import { LineApiError } from "../line/client";
import { text } from "../line/messages";
import type { Reminder } from "../store/repo";
import type { Deps } from "./deps";

const MAX_ATTEMPTS = 3;

function messageFor(r: Reminder) {
  if (r.kind === "broadcast") return text(r.content);
  return text(r.content ? `🔔 ${r.content}` : "🔔 お知らせの時間です");
}

export async function runScheduler(deps: Deps): Promise<{ sent: number; failed: number }> {
  const now = deps.now();
  const due = await deps.repo.dueReminders(now);
  let sent = 0;
  let failed = 0;
  for (const r of due) {
    try {
      const res = await deps.line.push(r.targetId, [messageFor(r)], r.id);
      await deps.repo.markReminderSent(r.id, now);
      await deps.repo.addPushUsage(monthKey(now), r.cost);
      for (const m of res) {
        await deps.repo.saveBotMessage(m.id, r.targetType === "user" ? r.targetId : r.chatId, { type: "reminder", id: r.id }, now, deps.config.retentionHours * 3600_000);
      }
      await deps.metrics.inc("push_sent", now);
      sent++;
    } catch (e) {
      const permanent = e instanceof LineApiError ? e.permanent : true;
      await deps.repo.markReminderAttempt(r.id, permanent || r.attempts + 1 >= MAX_ATTEMPTS);
      await deps.metrics.inc("push_failed", now);
      failed++;
    }
  }
  await deps.repo.cleanup(now);
  return { sent, failed };
}
