// LLM を使わずに日本語の日時表現を読み取る。
// 例: 「明日20時」「金曜の18時」「11月8日」「3時間後」「来週の月曜 朝」「金曜まで」

import {
  addDays,
  compareDate,
  dayOfWeek,
  fromJst,
  isValidDate,
  lastDayOfMonth,
  toJst,
  type JstDate,
} from "./jst";

export interface ParsedTime {
  h: number;
  mi: number;
  /** 「8時」のように午前/午後が書かれていない */
  bare: boolean;
}

export interface DateTimeParse {
  date?: JstDate;
  /** 曜日だけ指定（今日を含む直近の曜日として扱った） */
  weekdayOnly?: boolean;
  time?: ParsedTime;
  relativeMs?: number;
  /** 「〜まで」「〜までに」 */
  deadline: boolean;
  /** 「あとで」「そのうち」など、時刻が決められない言い方 */
  vague: boolean;
  /** 本文から取り除くべき日時表現の範囲 */
  spans: Array<[number, number]>;
}

const WEEKDAYS = "日月火水木金土";

const PERIOD_DEFAULT: Record<string, number> = {
  朝: 8,
  昼: 12,
  正午: 12,
  夕方: 18,
  夜: 20,
  晩: 20,
};

const PM_WORDS = new Set(["午後", "夜", "夕方", "晩", "夕"]);

function overlaps(spans: Array<[number, number]>, s: number, e: number): boolean {
  return spans.some(([a, b]) => s < b && a < e);
}

export function parseDateTime(text: string, now: number): DateTimeParse {
  const today = toJst(now);
  const result: DateTimeParse = { deadline: false, vague: false, spans: [] };
  const spans = result.spans;
  // 「今夜」で仮に 20時を入れたとき、後ろの「9時」で上書きできるようにする
  let tonight = false;

  const take = (re: RegExp, fn: (m: RegExpExecArray) => boolean | void) => {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(text)) !== null) {
      const s = m.index;
      const e = s + m[0].length;
      if (m[0].length === 0) {
        g.lastIndex++;
        continue;
      }
      if (overlaps(spans, s, e)) {
        // 「今夜9時」の「夜9時」のように重なった場合は、1文字ずらして探し直す
        g.lastIndex = s + 1;
        continue;
      }
      if (fn(m) !== false) spans.push([s, e]);
    }
  };

  // ---- 相対時間（3時間後 / 30分後）----
  take(/(\d{1,3})時間半?後/, (m) => {
    const hours = Number(m[1]) + (m[0].includes("半") ? 0.5 : 0);
    result.relativeMs = (result.relativeMs ?? 0) + hours * 3600_000;
  });
  take(/(\d{1,3})分後/, (m) => {
    result.relativeMs = (result.relativeMs ?? 0) + Number(m[1]) * 60_000;
  });

  // ---- 日付 ----
  const setDate = (d: JstDate) => {
    if (result.date) return false;
    if (!isValidDate(d)) return false;
    result.date = d;
    return true;
  };

  take(/(\d{1,2})月(\d{1,2})日/, (m) => {
    let d: JstDate = { y: today.y, m: Number(m[1]), d: Number(m[2]) };
    if (compareDate(d, today) < 0) d = { ...d, y: today.y + 1 };
    return setDate(d);
  });
  take(/(?<![\d:])(\d{1,2})\/(\d{1,2})(?![\d/])/, (m) => {
    let d: JstDate = { y: today.y, m: Number(m[1]), d: Number(m[2]) };
    if (compareDate(d, today) < 0) d = { ...d, y: today.y + 1 };
    return setDate(d);
  });
  take(/(再来週|来週|今週)の?([日月火水木金土])曜日?/, (m) => {
    const target = WEEKDAYS.indexOf(m[2] ?? "");
    const monday = addDays(today, -((today.dow + 6) % 7));
    const weeks = m[1] === "再来週" ? 2 : m[1] === "来週" ? 1 : 0;
    return setDate(addDays(monday, weeks * 7 + ((target + 6) % 7)));
  });
  take(/([日月火水木金土])曜日?/, (m) => {
    const target = WEEKDAYS.indexOf(m[1] ?? "");
    const diff = (target - today.dow + 7) % 7;
    result.weekdayOnly = true;
    return setDate(addDays(today, diff));
  });
  take(/明後日|あさって/, () => setDate(addDays(today, 2)));
  take(/明日|あした|あす(?!か)/, () => setDate(addDays(today, 1)));
  take(/今夜|今晩/, () => {
    if (!result.time) {
      result.time = { h: 20, mi: 0, bare: false };
      tonight = true;
    }
    return setDate(today);
  });
  take(/今日|きょう|本日/, () => setDate(today));
  take(/(\d{1,2})日後/, (m) => setDate(addDays(today, Number(m[1]))));
  take(/(\d{1,2})週間後/, (m) => setDate(addDays(today, Number(m[1]) * 7)));
  take(/再来週/, () => setDate(addDays(today, 14)));
  take(/来週/, () => setDate(addDays(today, 7)));
  take(/今月中|今月末|月末/, () => {
    result.deadline = true;
    return setDate({ y: today.y, m: today.m, d: lastDayOfMonth(today.y, today.m) });
  });
  take(/今週中/, () => {
    result.deadline = true;
    return setDate(addDays(today, (7 - today.dow) % 7));
  });
  take(/週末/, () => setDate(addDays(today, (6 - today.dow + 7) % 7)));
  take(/(?<![\d月/])(\d{1,2})日(?![後間])/, (m) => {
    const day = Number(m[1]);
    let d: JstDate = { y: today.y, m: today.m, d: day };
    if (compareDate(d, today) < 0) {
      d = today.m === 12 ? { y: today.y + 1, m: 1, d: day } : { y: today.y, m: today.m + 1, d: day };
    }
    return setDate(d);
  });

  // ---- 時刻 ----
  const setTime = (h: number, mi: number, modifier: string | undefined) => {
    if (result.time && !tonight) return false;
    if (h > 24 || mi > 59) return false;
    let hour = h;
    const bare = !modifier;
    if (modifier && PM_WORDS.has(modifier) && hour < 12) hour += 12;
    if (tonight && bare && hour < 12) hour += 12;
    if (modifier === "午前" && hour === 12) hour = 0;
    result.time = { h: hour, mi, bare: bare && !tonight && hour <= 12 };
    tonight = false;
    return true;
  };

  take(/(午前|午後|朝|夜|夕方|夕|晩|昼)?の?\s*(\d{1,2}):(\d{2})/, (m) => {
    return setTime(Number(m[2]), Number(m[3]), m[1]);
  });
  take(/(午前|午後|朝|夜|夕方|夕|晩|昼)?の?\s*(\d{1,2})時(?!間)(半|(\d{1,2})分)?/, (m) => {
    const mi = m[3] === "半" ? 30 : m[4] ? Number(m[4]) : 0;
    return setTime(Number(m[2]), mi, m[1]);
  });
  take(/正午|朝(?!ご飯|ごはん|食|礼|会)|昼(?!ご飯|ごはん|食|休)|夕方|夜(?!ご飯|ごはん|食)|晩(?!ご飯|ごはん)/, (m) => {
    if (result.time) return false;
    const h = PERIOD_DEFAULT[m[0]];
    if (h === undefined) return false;
    result.time = { h, mi: 0, bare: false };
    return true;
  });

  // ---- 期限・あいまい ----
  take(/までに|まで/, () => {
    result.deadline = true;
  });
  take(/あとで|後で|そのうち|今度|いつか/, () => {
    result.vague = true;
  });

  spans.sort((a, b) => a[0] - b[0]);
  return result;
}

export function hasDateTime(p: DateTimeParse): boolean {
  return Boolean(p.date || p.time || p.relativeMs);
}

export type ResolveResult =
  | { ok: true; at: number; assumedPm: boolean }
  | { ok: false; reason: "no_time" | "no_date_time" | "past" };

/**
 * お知らせ時刻を決める。日付だけなら時刻を聞き返す（no_time）。
 * 時刻だけなら、今日まだ来ていなければ今日、過ぎていれば次に来るその時刻。
 */
export function resolveFireAt(p: DateTimeParse, now: number): ResolveResult {
  if (p.relativeMs) return { ok: true, at: now + p.relativeMs, assumedPm: false };
  if (!p.time) return { ok: false, reason: p.date ? "no_time" : "no_date_time" };

  const today = toJst(now);
  let { h } = p.time;
  const { mi } = p.time;
  let assumedPm = false;
  let date = p.date ?? { y: today.y, m: today.m, d: today.d };
  if (h === 24) {
    h = 0;
    date = addDays(date, 1);
  }

  if (p.time.bare && h >= 1 && h <= 6) {
    // 「3時」は多くの場合 15時
    h += 12;
    assumedPm = true;
  }

  let at = fromJst(date, h, mi);
  if (!p.date) {
    if (at <= now && p.time.bare && h < 12 && fromJst(date, h + 12, mi) > now) {
      h += 12;
      assumedPm = true;
      at = fromJst(date, h, mi);
    } else if (at <= now) {
      at = fromJst(addDays(date, 1), h, mi);
    }
  } else if (p.weekdayOnly && at <= now) {
    at = fromJst(addDays(date, 7), h, mi);
  }
  if (at <= now) return { ok: false, reason: "past" };
  return { ok: true, at, assumedPm };
}

/** 期限（日付のみ）を決める */
export function resolveDueDate(p: DateTimeParse, now: number): JstDate | undefined {
  if (p.date) return p.date;
  if (p.relativeMs) {
    const t = toJst(now + p.relativeMs);
    return { y: t.y, m: t.m, d: t.d };
  }
  return undefined;
}

/** 日時表現と、その直後の「の」「に」「、」などを取り除いた残りを返す */
export function removeSpans(text: string, spans: Array<[number, number]>): string {
  let out = "";
  let pos = 0;
  for (const [s, e] of spans) {
    out += text.slice(pos, s) + " ";
    pos = e;
  }
  out += text.slice(pos);
  return out
    .replace(/\s*(の|に|から|、|,)\s*(?=\s)/g, " ")
    .replace(/(^|\s)(の|に|には|から|、|,|は)(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function weekdayOf(date: JstDate): string {
  return WEEKDAYS[dayOfWeek(date)] ?? "";
}
