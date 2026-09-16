# 根本原因のトレース（源流まで遡る）

**読むタイミング:** エラーがコールスタックの深い位置で出ていて、
不正な値がどこで生まれたのか分からないとき。

## 原則

バグは深い場所で表面化する（間違ったディレクトリで初期化される、
想定外の場所にファイルが作られる、空文字がパスとして使われる）。
**エラーが出た場所を直したくなるが、それは症状の治療である。**

呼び出し連鎖を遡り、最初の引き金を見つけてから、そこで直す。

## 手順

### 1. 症状を書く
```
Error: git init failed in ~/project/packages/core
```

### 2. 直接の原因コードを特定する
```ts
await execFileAsync('git', ['init'], { cwd: projectDir });
```

### 3. 「これを呼んだのは誰か」を辿る
```
WorktreeManager.createSessionWorktree(projectDir, sessionId)
  ← Session.initializeWorkspace()
  ← Session.create()
  ← テストの Project.create()
```

### 4. 渡された値を見る
- `projectDir = ''`（空文字）
- 空文字を `cwd` に渡すと `process.cwd()` に解決される
- つまりソースコードのディレクトリで実行されていた

### 5. 源流を特定する
```ts
const context = setupCoreTest();      // 初期状態は { tempDir: '' }
Project.create('name', context.tempDir); // beforeEach より前に参照していた
```

**根本原因:** 初期化前の値をトップレベルで参照していた
**修正:** `tempDir` を getter にして、初期化前アクセスで例外を投げる

## 手で辿れないときは計測を入れる

```ts
async function gitInit(directory: string) {
  console.error('DEBUG git init:', {
    directory,
    cwd: process.cwd(),
    stack: new Error().stack,
  });
  await execFileAsync('git', ['init'], { cwd: directory });
}
```

- **テスト内では `console.error` を使う**（ロガーは抑制されることがある）
- **危険な操作の「前」に出す**（失敗してからでは遅い）
- ディレクトリ・cwd・環境変数・タイムスタンプなど文脈を一緒に出す
- `new Error().stack` で呼び出し連鎖全体が取れる

取得:
```bash
npm test 2>&1 | grep 'DEBUG git init'
```

スタックトレースからは、テストファイル名・行番号・共通するパラメータを読む。

## どのテストが汚染しているか分からないとき

テストを1件ずつ走らせて、副作用（生成されたファイル、残った状態）が
最初に現れるテストで止める二分探索を行う。並列実行をオフにしてから実施する。

## 多層防御を足す

源流を直したあと、同じバグが再発不能になるよう各層に検証を入れる。

例:
- 層1: `Project.create()` がディレクトリを検証する
- 層2: `WorkspaceManager` が空文字を拒否する
- 層3: 一時ディレクトリ外での破壊的操作を環境ガードで拒否する
- 層4: 危険な操作の直前にスタックトレースを記録する

**注意:** 多層防御は「源流を直したうえで」足すもの。
検証を足しただけで源流を放置するのは、やはり対症療法である。

## 原則（再掲）

```
直接の原因を発見
  → 1つ上に遡れるか
      はい → 遡る → ここが源流か → いいえ → さらに遡る
                                   → はい   → 源流で直す → 各層に検証を足す
      いいえ（行き止まり） → その位置で直すが、必ず理由を記録する
```

**エラーが出た場所だけを直してはならない。**

---

出典: [obra/superpowers](https://github.com/obra/superpowers) の
`systematic-debugging/root-cause-tracing.md` および `defense-in-depth.md`（MIT License）を
日本語化・統合・要約。
