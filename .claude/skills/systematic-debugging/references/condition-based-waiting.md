# 条件待ちに置き換える（フレーキーテストの潰し方）

**読むタイミング:** テストが時々落ちる、CI や並列実行でだけ落ちる、
テストに `setTimeout` / `sleep` / 固定待機が入っているとき。

## 原則

フレーキーなテストの多くは、**所要時間を推測して固定待機している**。
速いマシンでは通り、負荷時や CI では落ちる。

**待つべきは「時間」ではなく「条件」である。**

## 基本形

```ts
// ❌ 所要時間を推測している
await new Promise(r => setTimeout(r, 50));
const result = getResult();
expect(result).toBeDefined();

// ✅ 条件が満たされるまで待つ
await waitFor(() => getResult() !== undefined, 'result が入る');
const result = getResult();
expect(result).toBeDefined();
```

## 待ち方の型

| 待ちたいもの | 書き方 |
|---|---|
| イベント | `waitFor(() => events.find(e => e.type === 'DONE'), 'DONE イベント')` |
| 状態 | `waitFor(() => machine.state === 'ready', 'ready 状態')` |
| 件数 | `waitFor(() => items.length >= 5, '5件到達')` |
| ファイル | `waitFor(() => fs.existsSync(path), 'ファイル生成')` |
| 複合条件 | `waitFor(() => obj.ready && obj.value > 10, '準備完了かつ閾値超え')` |
| DOM | Testing Library の `findBy*` / `waitFor` を使う（自前実装より先にこれ） |

## 実装

```ts
async function waitFor<T>(
  condition: () => T | undefined | null | false,
  description: string,
  timeoutMs = 5000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const result = condition();
    if (result) return result;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timeout waiting for ${description} after ${timeoutMs}ms`);
    }
    await new Promise(r => setTimeout(r, 10)); // 10ms ごとにポーリング
  }
}
```

## よくある間違い

| 間違い | 直し方 |
|---|---|
| 1ms ごとのポーリング（CPU の無駄） | 10ms 程度にする |
| タイムアウトなし（条件が満たされないと無限ループ） | 必ずタイムアウトと説明付きエラーを入れる |
| ループ前に状態をキャッシュしている | ループ内で毎回取り直す |
| 落ちる理由が「タイムアウト」としか分からない | `description` に何を待っていたか書く |

## 固定待機が正しい場合

タイミングそのものが仕様のとき（デバウンス、スロットル、周期処理）は固定待機でよい。
ただし次の3条件を満たすこと。

```ts
await waitForEvent(manager, 'TOOL_STARTED'); // 1. まず条件で待つ
await new Promise(r => setTimeout(r, 200));  // 2. 既知の周期に基づく値
// 3. 100ms 周期のツールで部分出力を2回分確認するため 200ms
```

1. 先に「引き金となる条件」を待つ
2. 推測ではなく既知のタイミングに基づく値にする
3. **なぜその値なのかをコメントに書く**

---

出典: [obra/superpowers](https://github.com/obra/superpowers) の
`systematic-debugging/condition-based-waiting.md`（MIT License）を日本語化・要約。
