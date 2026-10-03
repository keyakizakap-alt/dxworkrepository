// 日本時間（UTC+9, 夏時間なし）の計算をまとめたもの。内部の時刻は UTC ミリ秒で持つ。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface JstDate {
  y: number;
  m: number; // 1-12
  d: number;
}

export interface JstParts extends JstDate {
  h: number;
  mi: number;
  dow: number; // 0=日 ... 6=土
}

export function toJst(ms: number): JstParts {
  const t = new Date(ms + JST_OFFSET_MS);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    h: t.getUTCHours(),
    mi: t.getUTCMinutes(),
    dow: t.getUTCDay(),
  };
}

export function fromJst(date: JstDate, h = 0, mi = 0): number {
  return Date.UTC(date.y, date.m - 1, date.d, h, mi) - JST_OFFSET_MS;
}

export function addDays(date: JstDate, days: number): JstDate {
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d) + days * DAY_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function dayOfWeek(date: JstDate): number {
  return new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay();
}

export function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isValidDate(date: JstDate): boolean {
  return date.m >= 1 && date.m <= 12 && date.d >= 1 && date.d <= lastDayOfMonth(date.y, date.m);
}

export function compareDate(a: JstDate, b: JstDate): number {
  return a.y - b.y || a.m - b.m || a.d - b.d;
}

export function dateKey(date: JstDate): string {
  return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
}

export function parseDateKey(key: string): JstDate {
  const [y, m, d] = key.split("-").map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

export function monthKey(ms: number): string {
  const p = toJst(ms);
  return `${p.y}-${String(p.m).padStart(2, "0")}`;
}

export function startOfJstDay(ms: number): number {
  return fromJst(toJst(ms));
}

const DOW_LABEL = ["日", "月", "火", "水", "木", "金", "土"];

/** 「明日20:00」「10/10(金) 8:00」のような、話し言葉に近い表示 */
export function formatWhen(ms: number, now: number): string {
  const p = toJst(ms);
  const today = toJst(now);
  const time = `${p.h}:${String(p.mi).padStart(2, "0")}`;
  return `${formatDay(p, today)}${time}`;
}

export function formatDay(date: JstDate, today: JstDate): string {
  const diff = Math.round(
    (Date.UTC(date.y, date.m - 1, date.d) - Date.UTC(today.y, today.m - 1, today.d)) / DAY_MS,
  );
  if (diff === 0) return "今日";
  if (diff === 1) return "明日";
  if (diff === 2) return "あさって";
  const dow = DOW_LABEL[dayOfWeek(date)];
  if (diff > 0 && diff < 7) return `${dow}曜`;
  return `${date.m}/${date.d}(${dow})`;
}

export function formatDue(key: string, now: number): string {
  const date = parseDateKey(key);
  const today = toJst(now);
  const label = formatDay(date, today);
  return label.endsWith("曜") ? `${label}日` : label;
}
