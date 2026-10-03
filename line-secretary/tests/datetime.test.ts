import { describe, expect, it } from "vitest";
import { parseDateTime, resolveFireAt } from "../src/core/datetime";
import { formatWhen } from "../src/core/jst";
import { normalizeText } from "../src/core/normalize";

// 2026-10-03(土) 12:00 JST
const NOW = Date.UTC(2026, 9, 3, 3, 0);

function when(text: string, now = NOW): string {
  const r = resolveFireAt(parseDateTime(normalizeText(text), now), now);
  return r.ok ? formatWhen(r.at, now) : r.reason;
}

describe("日時の読み取り", () => {
  it.each([
    ["明日20時", "明日20:00"],
    ["明日の朝8時", "明日8:00"],
    ["明日の朝", "明日8:00"],
    ["明日の夜", "明日20:00"],
    ["今夜9時", "今日21:00"],
    ["20:30", "今日20:30"],
    ["3時", "今日15:00"],
    ["11時", "今日23:00"],
    ["8時半", "今日20:30"],
    ["金曜の18時", "金曜18:00"],
    ["来週の月曜 朝", "あさって8:00"],
    ["再来週の水曜 10時", "10/14(水)10:00"],
    ["11月8日 10時", "11/8(日)10:00"],
    ["3時間後", "今日15:00"],
    ["30分後", "今日12:30"],
    ["明後日の午後3時", "あさって15:00"],
    ["明日の二十時", "明日20:00"],
    ["明日２０時", "明日20:00"],
  ])("%s → %s", (input, expected) => {
    expect(when(input)).toBe(expected);
  });

  it("日付だけなら時刻を聞き返す", () => {
    expect(when("明日")).toBe("no_time");
    expect(when("あとで")).toBe("no_date_time");
  });

  it("期限（まで）を読み取る", () => {
    const p = parseDateTime("金曜までに", NOW);
    expect(p.deadline).toBe(true);
    expect(p.date).toEqual({ y: 2026, m: 10, d: 9 });
  });

  it("今月中は月末", () => {
    expect(parseDateTime("今月中に", NOW).date).toEqual({ y: 2026, m: 10, d: 31 });
  });
});
