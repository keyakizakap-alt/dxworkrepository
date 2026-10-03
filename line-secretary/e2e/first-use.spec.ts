import { expect, test } from "@playwright/test";

// 初めて使う人が、説明を読まずに「明日20時に教えて」でリマインダーを作れること
test("「明日20時に教えて」→ 確認 → 登録 → 一覧 → 届く", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("友だち追加ありがとうございます")).toBeVisible();

  await page.getByLabel("メッセージ").fill("明日20時に教えて");
  await page.getByRole("button", { name: "送信" }).click();

  await expect(page.getByText("明日20:00にお知らせします。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText("登録しました。明日20:00にお知らせします。")).toBeVisible();

  const list = page.getByTestId("reminder-list");
  await expect(list).toContainText("20:00");
  await page.screenshot({ path: "test-results/first-use.png", fullPage: true });

  await page.getByRole("button", { name: "次のお知らせまで進める" }).click();
  await expect(page.getByText("🔔 お知らせの時間です")).toBeVisible();
  await expect(page.getByText("予定しているお知らせはありません")).toBeVisible();
});

test("グループ：みんなに送る予約と、会話からのやること", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "グループ" }).click();
  await expect(page.getByText("グループに入れてくれてありがとうございます")).toBeVisible();

  const say = async (text: string, speaker?: string) => {
    if (speaker) await page.getByLabel("話す人").selectOption({ label: speaker });
    await page.getByLabel("メッセージ").fill(text);
    await page.getByRole("button", { name: "送信" }).click();
    await expect(page.getByText(text, { exact: true }).last()).toBeVisible();
  };

  await say("ホテルどうする？", "凌吾");
  await say("俺が予約するよ", "田中");
  await say("金曜までにお願い", "凌吾");
  await say("この話、やることにまとめて");
  await expect(page.getByText("ホテル予約をタスク候補として見つけました。", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByText("ホテル予約をタスクにしました。")).toBeVisible();

  await say("金曜の18時に、明日は10時集合ってみんなに送って");
  await expect(page.getByText("『明日は10時集合です』", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "予約する" }).click();
  await expect(page.getByText("予約しました。", { exact: false })).toBeVisible();

  await page.getByRole("tab", { name: /やること/ }).click();
  await expect(page.getByTestId("task-list")).toContainText("ホテル予約");
  await page.screenshot({ path: "test-results/group.png", fullPage: true });
});
