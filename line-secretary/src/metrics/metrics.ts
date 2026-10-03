// 管理画面に出してよいのは、ここで扱う「数」だけ。
// 本文・名前・LINE の ID はこのモジュールに渡さない・返さない。

import { monthKey, toJst } from "../core/jst";
import type { SqlDb } from "../store/sql";

export const METRIC_KEYS = [
  "webhook_events",
  "signature_failures",
  "messages_handled",
  "llm_calls",
  "llm_errors",
  "push_sent",
  "push_failed",
  "joined",
  "left",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number] | `intent:${string}`;

function dayKey(ms: number): string {
  const p = toJst(ms);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export class Metrics {
  constructor(private readonly db: SqlDb) {}

  async inc(key: MetricKey, now: number, n = 1): Promise<void> {
    await this.db.run(
      `INSERT INTO metrics_daily (day, key, count) VALUES (?, ?, ?)
       ON CONFLICT(day, key) DO UPDATE SET count = count + excluded.count`,
      [dayKey(now), key, n],
    );
  }
}

export interface AdminSummary {
  generatedAt: number;
  chats: { groups: number; users: number };
  push: { month: string; used: number; scheduled: number; limit: number };
  openTasks: number;
  scheduledReminders: number;
  daily: Array<{ day: string; counts: Record<string, number> }>;
  intents: Record<string, number>;
}

/** 管理画面用の集計。返すのは件数だけ。 */
export async function readAdminSummary(db: SqlDb, now: number, monthlyLimit: number, days = 14): Promise<AdminSummary> {
  const since = dayKey(now - (days - 1) * 24 * 3600_000);
  const rows = await db.all<{ day: string; key: string; count: number }>(
    "SELECT day, key, count FROM metrics_daily WHERE day >= ? ORDER BY day",
    [since],
  );
  const byDay = new Map<string, Record<string, number>>();
  const intents: Record<string, number> = {};
  for (const r of rows) {
    if (r.key.startsWith("intent:")) {
      const k = r.key.slice("intent:".length);
      intents[k] = (intents[k] ?? 0) + r.count;
      continue;
    }
    const d = byDay.get(r.day) ?? {};
    d[r.key] = r.count;
    byDay.set(r.day, d);
  }
  const count = async (sql: string, params: Array<string | number> = []) =>
    (await db.first<{ n: number }>(sql, params))?.n ?? 0;

  const month = monthKey(now);
  return {
    generatedAt: now,
    chats: {
      groups: await count("SELECT COUNT(*) AS n FROM chats WHERE type != 'user'"),
      users: await count("SELECT COUNT(*) AS n FROM chats WHERE type = 'user'"),
    },
    push: {
      month,
      used: await count("SELECT used AS n FROM push_usage WHERE month = ?", [month]),
      scheduled: await count("SELECT COALESCE(SUM(cost), 0) AS n FROM reminders WHERE status = 'scheduled'"),
      limit: monthlyLimit,
    },
    openTasks: await count("SELECT COUNT(*) AS n FROM tasks WHERE status = 'open'"),
    scheduledReminders: await count("SELECT COUNT(*) AS n FROM reminders WHERE status = 'scheduled'"),
    daily: [...byDay.entries()].map(([day, counts]) => ({ day, counts })),
    intents,
  };
}
