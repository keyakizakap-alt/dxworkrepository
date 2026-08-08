# OrcaRouter 壁打ちボット

OrcaRouter（アダプティブ LLM ルーティングの AI ゲートウェイ）の導入検討を、AI と対話しながら詰めるためのツールです。
公式情報・活用事例・導入事例を出典付きで収録した知識ベースを内蔵しており、それを土台に壁打ちします。

- **ビルド不要・依存パッケージゼロ。** `index.html` をブラウザで開くだけで動きます。
- **API キーは BYOK。** ブラウザの localStorage にのみ保存され、リポジトリには一切入りません。
- **キーがなくても使えます。** 知識ベースのキーワード検索モードで動作します。

調査資料そのものを読みたい場合は [`docs/orcarouter-research.md`](../../docs/orcarouter-research.md) を参照してください。

---

## 使い方

### 1. 開く

```bash
# そのまま開く
open tools/orcarouter-chat/index.html        # macOS
xdg-open tools/orcarouter-chat/index.html    # Linux

# ローカルサーバー経由で開く場合
npx serve tools/orcarouter-chat
```

この時点で「知識ベース」タブと「コスト試算」タブ、そしてキーワード検索による応答は使えます。

### 2. API キーを設定する（壁打ちを有効にする）

右上の **設定** から、以下のいずれかを選びます。

| プロバイダ | Base URL | モデル例 | キー |
| --- | --- | --- | --- |
| OrcaRouter（既定） | `https://api.orcarouter.ai/v1` | `orcarouter/auto` | `sk-orca-...` |
| Anthropic Claude API | `https://api.anthropic.com` | `claude-opus-5` | `sk-ant-...` |
| その他 OpenAI 互換 | 任意 | 任意 | 任意 |

`orcarouter/auto` を指定すると、OrcaRouter がリクエストごとにモデルを選びます。
つまり「OrcaRouter の壁打ちを OrcaRouter 自身で動かす」構成になり、そのまま動作デモを兼ねます。

### 3. モードを選んで壁打ちする

| モード | 用途 |
| --- | --- |
| 導入検討の論点出し | 「自社に入れるべきか」を詰める。追認せず、必ず反論と代替案を返します |
| コスト削減シミュレーション | 試算の前提が妥当かを詰める。楽観/保守シナリオの比較 |
| 社内説明資料の壁打ち | 稟議・上申文のドラフトと、想定される反対質問への回答案 |
| 技術検証の相談 | OpenAI 互換への移行手順、Dify / Cursor / Codex CLI / MCP 連携、セルフホスト |

会話は **会話を書き出す** から Markdown ファイルとして保存できます（同時にクリップボードにもコピーされます）。

---

## CORS で失敗する場合

ブラウザから API を直接呼ぶため、プロバイダ側が CORS を許可していないとリクエストが失敗します
（`Failed to fetch` や 403 が出ます）。その場合は同梱の中継サーバを使ってください。

```bash
node tools/orcarouter-chat/scripts/proxy.mjs
# → http://localhost:8787 で待ち受け
```

起動したら、設定画面の Base URL を次のように変更します。

- OrcaRouter / その他 OpenAI 互換 → `http://localhost:8787/v1`
- Anthropic → `http://localhost:8787`

転送先は環境変数で切り替えます。

```bash
ORCA_PROXY_TARGET=https://api.anthropic.com node tools/orcarouter-chat/scripts/proxy.mjs
```

> 中継サーバはローカル開発用です。認証をかけていないので公開ネットワークに晒さないでください。
> API キーはブラウザから透過転送されるだけで、サーバ側には保存されません。

なお Anthropic を直接指定する場合、アプリは `anthropic-dangerous-direct-browser-access: true` ヘッダを付与して
ブラウザからの呼び出しを可能にしています。

---

## 知識ベースの更新

知識ベースは **`assets/kb.js` が唯一の真実の源** です。チャットボットのシステムプロンプトと
`docs/orcarouter-research.md` の両方がここから生成されるため、両者の内容がズレることはありません。

```bash
# kb.js を編集したあと、必ず実行する
node tools/orcarouter-chat/scripts/build-docs.mjs
```

`docs/orcarouter-research.md` は自動生成物です。直接編集しないでください。

全レコードには出典 URL と確度（`confidence`）が必須です。生成スクリプトは出典が欠けている項目を検出すると
警告して終了コード 1 を返します。

| confidence | 意味 |
| --- | --- |
| `official` | 公式サイト・公式ドキュメントの記載 |
| `press-release` | 提供元が配信したプレスリリース |
| `vendor-claim` | 提供元の主張する数値（独立検証なし） |
| `third-party` | 第三者のベンチマーク・ドキュメント・OSS リポジトリ |
| `unverified` | 出典が間接的で一次情報での確認が必要 |

---

## 設計上の注意点

**ハルシネーション対策を優先しています。** 収録情報の多くはプレスリリース由来のベンダー公表値で、
独立検証されていません。そのためシステムプロンプトで以下を強制しています。

- 事実を述べるときは出典 URL を添える
- 知識ベースにない事柄は推測せず「要一次確認」と明示する
- `vendor-claim` / `unverified` の数値には「自社ワークロードでの実測が必要」と注記する
- 導入を無条件に推奨せず、必ずトレードオフか代替案に触れる

**公開情報の範囲では、個社名を明かした顧客導入事例は確認できませんでした。** 本ツールが「導入事例」として
収録しているのは Dify / Cursor Directory / Codex CLI / MCP クライアント等のエコシステム採用事例です。
ボットにもそのようにラベリングして回答させています。

**コスト試算はあくまで試算です。** 削減率のレンジ（47〜71%）は提供元の内部ベンチマーク公表値であり、
移行工数・検証工数・運用の学習コストは含んでいません。

---

## ファイル構成

```
tools/orcarouter-chat/
├── index.html              # UI シェル（3タブ構成）
├── assets/
│   ├── kb.js               # ★知識ベース（単一の真実の源）
│   ├── app.js              # チャット制御・プロバイダ抽象・検索・コスト試算
│   └── styles.css          # ライト/ダーク両対応
├── scripts/
│   ├── build-docs.mjs      # kb.js → docs/orcarouter-research.md 生成
│   └── proxy.mjs           # CORS 回避用の中継サーバ（依存ゼロ・任意）
└── README.md
```
