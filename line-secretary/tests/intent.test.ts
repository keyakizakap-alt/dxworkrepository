import { describe, expect, it } from "vitest";
import { parseIntent } from "../src/core/intent";
import { normalizeText } from "../src/core/normalize";

const NOW = Date.UTC(2026, 9, 3, 3, 0);
const kind = (t: string) => parseIntent(normalizeText(t), NOW).intent.kind;
const strong = (t: string) => parseIntent(normalizeText(t), NOW).strong;

describe("言い方のゆれを理解する", () => {
  it.each([
    ["明日教えて", "create_reminder"],
    ["あとで知らせて", "create_reminder"],
    ["これ覚えといて", "create_task"],
    ["これやることにして", "create_task"],
    ["金曜までにお願い", "create_task"],
    ["田中さん担当にして", "assign_task"],
    ["今日決まったこと何？", "summarize"],
    ["まだ終わってないことある？", "list_tasks"],
    ["これ終わった", "complete_task"],
    ["さっきのリマインド消して", "delete_reminder"],
    ["来週もう一回教えて", "repeat_reminder"],
    ["みんなに知らせて", "schedule_group_message"],
    ["自分だけに知らせて", "create_reminder"],
    ["この話、やることにまとめて", "extract_tasks"],
    ["リマインダー一覧", "list_reminders"],
    ["明日20時に教えて", "create_reminder"],
  ])("「%s」→ %s", (t, k) => {
    expect(kind(t)).toBe(k);
  });

  it("雑談は依頼として扱わない", () => {
    expect(kind("ホテルどうする？")).toBe("unknown");
    expect(kind("それ何か教えて")).toBe("unknown");
    expect(strong("金曜までにお願い")).toBe(false);
    expect(strong("これ終わった")).toBe(false);
  });

  it("中身を取り出す", () => {
    const r = parseIntent(normalizeText("ホテルの予約、田中さん担当で金曜までにお願い"), NOW).intent;
    expect(r).toMatchObject({ kind: "create_task", title: "ホテル予約", assignee: { name: "田中", self: false } });
    const g = parseIntent(normalizeText("金曜の18時に、明日は10時集合ってみんなに送って"), NOW).intent;
    expect(g).toMatchObject({ kind: "schedule_group_message", content: "明日は10時集合です" });
    const m = parseIntent(normalizeText("明日の20時に飲み会のことみんなに知らせて"), NOW).intent;
    expect(m).toMatchObject({ kind: "schedule_group_message", content: "飲み会の確認です" });
    const s = parseIntent(normalizeText("明日の朝ゴミ出し自分だけに教えて"), NOW).intent;
    expect(s).toMatchObject({ kind: "create_reminder", content: "ゴミ出し", target: "self" });
  });
});
