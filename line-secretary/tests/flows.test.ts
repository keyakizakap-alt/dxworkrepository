import { describe, expect, it } from "vitest";
import { createHarness, SATO, TANAKA } from "./helpers";

describe("初めての人が説明なしで使う流れ", () => {
  it("1対1：「明日20時に教えて」→ 確認 → 登録 → 一覧 → 時間になったら届く", async () => {
    const h = await createHarness();
    const [confirm] = await h.say("dm", "明日20時に教えて");
    expect(confirm?.text).toBe("明日20:00にお知らせします。");
    expect(confirm?.buttons.map((b) => b.label)).toEqual(["登録する"]);

    const [done] = await h.press("dm", confirm!.buttons[0]!.data);
    expect(done?.text).toBe("登録しました。明日20:00にお知らせします。");

    const [list] = await h.say("dm", "リマインダー一覧");
    expect(list?.text).toContain("明日20:00");

    // 今は 10/3(土) 12:00。明日 20:00 は 32 時間後
    expect((await h.advance(60 * 31)).sent).toBe(0);
    expect((await h.advance(60 * 2)).sent).toBe(1);
    const tl = await h.timeline("dm");
    expect(tl.at(-1)?.text).toBe("🔔 お知らせの時間です");
  });

  it("「明日の朝8時にゴミ出しって教えて」", async () => {
    const h = await createHarness();
    const [r] = await h.say("dm", "明日の朝8時にゴミ出しって教えて");
    expect(r?.text).toBe("明日8:00に『ゴミ出し』とお知らせします。");
  });

  it("「明日知らせて」だけなら時刻を聞き返し、答えると確認に進む", async () => {
    const h = await createHarness();
    const [ask] = await h.say("dm", "明日知らせて");
    expect(ask?.text).toBe("明日の何時ごろ知らせますか？");
    const [confirm] = await h.say("dm", "9時");
    expect(confirm?.text).toBe("明日9:00にお知らせします。");
  });

  it("二重押下しても 1 件しか登録されない", async () => {
    const h = await createHarness();
    const [c] = await h.say("dm", "明日20時に教えて");
    await h.press("dm", c!.buttons[0]!.data);
    const [again] = await h.press("dm", c!.buttons[0]!.data);
    expect(again?.text).toBe("もう登録してあります。");
    const n = await h.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM reminders");
    expect(n?.n).toBe(1);
  });

  it("「さっきのリマインド消して」", async () => {
    const h = await createHarness();
    const [c] = await h.say("dm", "明日の朝8時にゴミ出しって教えて");
    await h.press("dm", c!.buttons[0]!.data);
    const [r] = await h.say("dm", "さっきのリマインド消して");
    expect(r?.text).toBe("明日8:00の『ゴミ出し』のお知らせを消しました。");
  });
});

describe("グループ", () => {
  it("雑談には反応しない", async () => {
    const h = await createHarness();
    expect(await h.say("group", "ホテルどうする？")).toHaveLength(0);
    expect(await h.say("group", "俺が予約するよ", { user: TANAKA })).toHaveLength(0);
    expect(await h.say("group", "金曜までにお願い")).toHaveLength(0);
  });

  it("「明日の20時に飲み会のことみんなに知らせて」→ [登録する][変更する]", async () => {
    const h = await createHarness();
    const [r] = await h.say("group", "明日の20時に飲み会のことみんなに知らせて");
    expect(r?.text).toBe("明日20:00に、このグループへ\n\n『飲み会の確認です』\n\nと送ります。");
    expect(r?.buttons.map((b) => b.label)).toEqual(["登録する", "変更する"]);
  });

  it("「金曜の18時に、明日は10時集合ってみんなに送って」→ [予約する][変更する] → 変更 → 予約", async () => {
    const h = await createHarness();
    const [r] = await h.say("group", "金曜の18時に、明日は10時集合ってみんなに送って");
    expect(r?.text).toBe("金曜18:00に、このグループへ\n\n『明日は10時集合です』\n\nと送ります。");
    expect(r?.buttons.map((b) => b.label)).toEqual(["予約する", "変更する"]);

    // 他の人は押せない
    const [other] = await h.press("group", r!.buttons[0]!.data, SATO);
    expect(other?.text).toBe("お願いした方が押してください。");

    const [ask] = await h.press("group", r!.buttons[1]!.data);
    expect(ask?.text).toContain("どう変えますか");
    const [updated] = await h.say("group", "19時にして");
    expect(updated?.text).toBe("金曜19:00に、このグループへ\n\n『明日は10時集合です』\n\nと送ります。");
    const [ok] = await h.press("group", updated!.buttons[0]!.data);
    expect(ok?.text).toBe("予約しました。金曜19:00にこのグループへ送ります。");
    // グループは人数分（3人）を通数として見込む
    const row = await h.db.first<{ cost: number }>("SELECT cost FROM reminders");
    expect(row?.cost).toBe(3);
  });

  it("「ホテルの予約、田中さん担当で金曜までにお願い」→ そのままタスクにする", async () => {
    const h = await createHarness();
    await h.say("group", "こんにちは", { user: TANAKA }); // メンバー名を覚える
    const [r] = await h.say("group", "ホテルの予約、田中さん担当で金曜までにお願い");
    expect(r?.text).toBe("ホテル予約をタスクにしました。\n担当：田中\n期限：金曜日");
    const [list] = await h.say("group", "まだ終わってないことある？");
    expect(list?.text).toContain("・ホテル予約（田中さん・金曜日まで）");
    const [done] = await h.say("group", "ホテル予約終わった", { user: TANAKA });
    expect(done?.text).toBe("ホテル予約を完了にしました。おつかれさまです。");
  });

  it("会話から「やること」を見つける", async () => {
    const h = await createHarness();
    await h.say("group", "ホテルどうする？");
    await h.say("group", "俺が予約するよ", { user: TANAKA });
    await h.say("group", "金曜までにお願い");
    const [r] = await h.say("group", "この話、やることにまとめて");
    expect(r?.text).toBe("ホテル予約をタスク候補として見つけました。\n\n担当：田中\n期限：金曜日\n\n登録しますか？");
    expect(r?.buttons.map((b) => b.label)).toEqual(["登録する", "やめる"]);
    const [ok] = await h.press("group", r!.buttons[0]!.data);
    expect(ok?.text).toBe("ホテル予約をタスクにしました。");
  });

  it("今日決まったことをまとめる（LLM なしの簡易版）", async () => {
    const h = await createHarness();
    await h.say("group", "旅行は11月8日にしよう");
    await h.say("group", "ホテルどうする？");
    await h.say("group", "俺が予約するよ", { user: TANAKA });
    const [r] = await h.say("group", "今日決まったことまとめて");
    expect(r?.text).toContain("今日決まったこと");
    expect(r?.text).toContain("・旅行は11月8日");
    expect(r?.text).toContain("やること");
    expect(r?.text).toContain("・ホテル予約");
  });

  it("「自分だけに知らせて」：友だち追加していない人には案内を出す", async () => {
    const h = await createHarness();
    const [r] = await h.say("group", "明日の朝ゴミ出し自分だけに教えて", { user: TANAKA });
    expect(r?.text).toContain("友だち追加");
    const [ok] = await h.say("group", "明日の朝ゴミ出し自分だけに教えて", { user: SATO });
    expect(ok?.text).toBe("明日8:00に、あなただけに『ゴミ出し』とお知らせします。");
  });

  it("メンションすれば、あいまいな依頼にも答える", async () => {
    const h = await createHarness();
    const [r] = await h.say("group", "明日知らせて", { mention: true });
    expect(r?.text).toBe("明日の何時ごろ知らせますか？");
  });

  it("「会話の保存やめて」で保存を止め、保存済みの会話も消す", async () => {
    const h = await createHarness();
    await h.say("group", "旅行は11月8日にしよう");
    await h.say("group", "会話の保存やめて");
    const n = await h.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM messages");
    expect(n?.n).toBe(0);
  });
});

describe("無料枠", () => {
  it("今月の通数を超える予約は登録しない", async () => {
    const h = await createHarness({ MONTHLY_MESSAGE_LIMIT: "2" });
    const [r] = await h.say("group", "明日20時に飲み会って教えて");
    expect(r?.text).toContain("今月のお知らせ枠");
    expect(r?.text).toContain("自分だけに知らせて");
  });
});

describe("プライバシー", () => {
  it("保存する本文は暗号化されている", async () => {
    const h = await createHarness();
    await h.say("group", "旅行は11月8日にしよう");
    const row = await h.db.first<{ text_enc: string }>("SELECT text_enc FROM messages");
    expect(row?.text_enc).toBeTruthy();
    expect(row?.text_enc).not.toContain("旅行");
  });
});
