# 品質ゲート・デプロイ・ドキュメント作法

## 1. 品質ゲート（ローカルと CI で同一）

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

ローカルで通る内容と CI の内容を**同じにする**。ずれると「push してから落ちる」が常態化する。

```yaml
name: CI
on: { pull_request: , push: { branches: [main] } }
permissions: { contents: read }        # 既定の write を明示的に絞る
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 20                # 吊るされたジョブで枠を潰さない
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24.14.0, cache: npm }   # .nvmrc と一致させる
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm audit --omit=dev --audit-level=high
```

**テストで押さえる価値の高い点**（実装の詳細ではなく、宣伝している性質を検証する）

- 「既定では外部へ送信しない」→ 文言ではなく**実際に `fetch` が呼ばれないこと**を確認する
- 「AI が変えるのは文章だけ」→ AI 有効／無効で結論（ID 列）が完全一致することを確認する
- 「同じ入力から同じ結果」→ 純関数スコアとタイブレークを直接検証する
- 外部クライアントは**モックの差し替えではなく**、互換応答を返すサーバーを立てて HTTP で通す
  （送信形式・認証ヘッダ・5xx/4xx/空応答・タイムアウト・ティア降格・キャッシュを一度に検証できる）
- デモ用シナリオが宣伝どおりの結果を出すことを検証する（説明文と実際の挙動のずれを検知できる）

## 2. デプロイ

### Next.js → Vercel

1. GitHub リポジトリを Import（Framework は自動検出。Root Directory は `.`）
2. Environment Variables を Production / Preview に登録（`NEXT_PUBLIC_` を付けない）
3. `main` への push で自動デプロイ

- **キー未設定でもデプロイが成功し、デモが動く状態**を保つ（原則 4）
- Route Handler には `runtime` と `maxDuration` を明示する（Hobby プランの上限は 60 秒）
- DB / Blob を使う場合は Marketplace 連携で接続し、テーブルは初回アクセス時に
  `CREATE TABLE IF NOT EXISTS` で冪等に作る
- ロールバックは直前の正常 Deployment へ。スキーマ変更は追加的・後方互換を原則とし、
  破壊的変更は別マイグレーション＋バックアップを用意する

### 単一 HTML → GitHub Pages

依存ゼロの静的アプリは `actions/configure-pages` → `upload-pages-artifact` → `deploy-pages`。
`permissions: { contents: read, pages: write, id-token: write }` と
`concurrency: { group: pages, cancel-in-progress: true }` を付ける。
外部ファイルを置けない配布先（Artifact 等）向けには、画像を data URI で埋め込んだ
単一ファイル版を生成するスクリプトを用意しておく。

## 3. ドキュメント作法

**README は「読む人が次の行動を取れる」ことだけを書く。** 分量ではなく到達点で評価する。

推奨構成（この順序。各節は短く）

1. 1 行で何か + 一撃で伝わる具体例
2. **何を解いているか**（課題 → 解決アプローチ）
3. **設計上いちばん大事な一点**（これが無いと他が全部誤解される）
4. 動かす（`npm install` → `npm run dev`。キー無しで動くことを明記）
5. 環境変数の表（変数 / 必須 / 用途）
6. デプロイ手順
7. 構成（ディレクトリと責務。ファイル名を実物と一致させる）
8. **既知の制約**（正直に書く。ここが薄い README は信用されない）

分けるもの

| 置き場所 | 内容 |
|---|---|
| `README.md` | 上の 1〜8。**200 行を超えたら分割の合図** |
| `docs/ARCHITECTURE.md` | 図（Mermaid）、責務分離表、trust boundary、トレードオフ、ロールバック |
| `docs/OPERATIONS.md` | 人手の運用手順（データ突合、画像取り込み、疎通確認など） |
| `docs/<意思決定>.md` | 案の選定過程など、後から「なぜこうなったか」を問われるもの |

書くときの規律

- **同じ内容を 2 か所に書かない。** 片方を必ずリンクにする（更新漏れで矛盾するのが最大の害）
- 実測値・実行結果はそのまま貼る（`303` / `400` / テスト件数など）。表現より強い
- 「推測」「未検証」「参考値」は必ずその旨を明記する。断定と推測を混ぜない
- 制約とトレードオフを隠さない（「レート制限はプロセス内メモリなので厳密な保証ではない」等）
- 実装を変えたら README の該当行も同じコミットで直す

## 4. コミットと運用

- 1 コミット = 1 つの変更意図。件名は「何をどうしたか」を日本語または英語で簡潔に
- 秘密値・`.env*`・生成物（`verification/` 等の作業ファイル）はコミットしない
- 生成済みアイコン等、ビルド時生成を避けたいものは意図的にコミットし、その理由を README に書く
