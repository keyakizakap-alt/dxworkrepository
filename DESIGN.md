# DX Copilot — 設計書 (Architect: Claude Fable 5)

AI開発ハッカソン優勝を狙う成果物。3テーマを1つのプロダクトで完全にカバーする。

| ハッカソンテーマ | 対応モジュール |
|---|---|
| ① LLM活用 | AIナレッジアシスタント(議事録/文書の構造化分析 + チャットQ&A) |
| ② AI×業務自動化 | オートメーションパイプライン(トリガー→AI処理→アクション、実行履歴、ROI可視化) |
| ③ AI×新規プロダクト | **Automation Discovery Engine** — 業務ログからAIが「自動化できる箇所」を発見しワンクリックでパイプライン化する新規SaaS |

## プロダクトコンセプト

**DX Copilot** — 中小企業向け「自動化を自分で提案するAI業務OS」。
従来のRPA/ワークフローツールは人間が自動化を設計する。DX Copilotは業務ログをAIが分析し、
自動化候補を発見→提案→ワンクリックでパイプライン生成→実行→削減時間をROIとして可視化する。
「導入した瞬間から自分で進化する業務自動化」が新規性の核。

## 技術スタック

- Node.js >= 20、バックエンドは Express **不使用**・組み込み `node:http` のみ(依存ゼロで即動作、これ自体がデモの強み)
- 例外: Claude API 連携は `@anthropic-ai/sdk`(唯一の依存。`package.json` の dependencies に記載するが、**未インストールでも demo モードで完全動作**するよう動的 import + try/catch で扱う)
- フロントは素の HTML/CSS/JS の SPA(`public/` 配下、ビルド不要、CDN不使用)
- テストは `node:test`(`npm test` = `node --test test/`)
- データ永続化は `data/store.json`(なければ自動生成、gitignore)

## 動作モード

- **live モード**: `ANTHROPIC_API_KEY` があり SDK がロード可能 → Claude API 呼び出し
  - モデル: `process.env.DX_COPILOT_MODEL || "claude-opus-4-8"`
  - `client.messages.create({ model, max_tokens: 4096, system, messages })`
  - 構造化抽出には `output_config: { format: { type: "json_schema", schema } }` を使用
  - `temperature`/`top_p`/`budget_tokens` は **絶対に送らない**(4.7+で400になる)
  - `stop_reason === "refusal"` を処理してからcontentを読む
- **demo モード**: キー無し → `src/demo-data.js` の決定的だが説得力あるレスポンス生成器
  - 入力テキストのキーワード(例:「見積」「請求」「障害」「採用」)に応じて内容が変わるヒューリスティックにして、デモが「生きて」見えるようにする
  - `GET /api/health` が `{ status: "ok", mode: "demo" | "live" }` を返す

## ディレクトリ構成

```
server.js              # エントリポイント (node server.js, PORT=3000既定)
src/llm.js             # Claude API クライアント + demoフォールバック (analyze/chat/discover を提供)
src/demo-data.js       # demoモードのレスポンス生成器
src/pipeline.js        # パイプラインエンジン (定義/実行/履歴/メトリクス)
src/store.js           # JSONファイル永続化 (load/save, data/store.json)
src/router.js          # ルーティング + 静的ファイル配信 (public/)
public/index.html      # SPA
public/app.js
public/style.css
test/*.test.js         # node:test
data/                  # gitignore対象 (.gitkeep のみコミット)
```

## API 契約 (フロント/バック共通の合意事項 — 変更禁止)

すべて JSON。エラーは `{ error: string }` + 適切な4xx/5xx。

| Method/Path | Req | Res |
|---|---|---|
| GET `/api/health` | - | `{ status, mode, version }` |
| POST `/api/analyze` | `{ text, type? }` type: `"minutes"\|"email"\|"report"` 既定 minutes | `{ summary, decisions: string[], tasks: [{title, assignee, due, priority}], risks: string[], sentiment: "positive"\|"neutral"\|"negative" }` |
| POST `/api/chat` | `{ messages: [{role:"user"\|"assistant", content}] , context? }` | `{ reply }` |
| GET `/api/pipelines` | - | `{ pipelines: [Pipeline] }` |
| POST `/api/pipelines` | `{ name, description?, trigger, steps: [{name, type, config?}] }` | `{ pipeline }` (201) |
| POST `/api/pipelines/:id/run` | `{ input? }` | `{ run }` (Run: `{ id, pipelineId, startedAt, durationMs, savedMinutes, status: "success"\|"failed", steps: [{name, status, output}] }`) |
| GET `/api/runs` | - | `{ runs: [Run] }` 新しい順 |
| GET `/api/metrics` | - | `{ totalRuns, successRate, savedMinutes, savedCostYen, automationRate, weeklyTrend: number[7] }` |
| POST `/api/discover` | `{ logs? }` logs省略時は内蔵サンプル業務ログを使用 | `{ suggestions: [{ id, title, description, estimatedSavingMinutesPerWeek, confidence, pipelineTemplate: {name, trigger, steps} }] }` |
| POST `/api/discover/:suggestionId/adopt` | - | `{ pipeline }` 提案からパイプライン生成 (201) |

ステップ type 例: `"ai_summarize" | "ai_classify" | "ai_draft" | "notify" | "assign" | "archive"`。
実行時、`ai_*` ステップは llm.js を通す(demoモードでは demo-data 経由)。各ステップの output は文字列。
savedMinutes はステップ数×基準値(ai系8分/その他3分)で算出し Run に記録。metrics はここから集計。

## 初期データ

初回起動時に `store.json` が無ければシードを投入:
- パイプライン2本(例:「問い合わせメール自動仕分け&返信下書き」「週次報告書の自動生成」)
- 実行履歴12件程度(直近7日に分散、metricsのweeklyTrendが綺麗に出るように)

## フロントエンド仕様

サイドバー + メインエリアのダッシュボード型SPA。日本語UI。ダークテーマ基調(#0f1420系)、
アクセントは1色(シアン系)。CDN・外部フォント禁止。fetchで上記APIを叩く。

ビュー4つ(サイドバーで切替、hashルーティング `#dashboard` など):
1. **ダッシュボード**: メトリクスカード4枚(削減時間/削減コスト/実行数/成功率) + 週次トレンドのSVG棒グラフ + 直近の実行履歴テーブル + 動作モードバッジ(demo/live)
2. **AI分析** (テーマ①): テキストエリアに議事録等を貼り付け→「AI分析」ボタン→ summary/decisions/tasks/risks をカード表示。下部にチャットQ&A(分析結果をcontextに渡す)。「サンプルを読み込む」ボタンで内蔵サンプル議事録を挿入
3. **自動化パイプライン** (テーマ②): パイプライン一覧カード(ステップをフロー図風に横並び表示)、「実行」ボタン→ステップごとの実行結果をアニメーション付きで順次表示、実行履歴
4. **AI自動化発見** (テーマ③): 「業務ログを分析」ボタン→提案カード(タイトル/説明/週あたり削減見込み/確信度バー)→「このパイプラインを採用」ボタン→パイプライン生成してビュー3へ誘導

UXの磨き込みがハッカソンでは効く: ローディングスピナー、実行ステップの順次点灯、数値のカウントアップ、トースト通知。ただし過剰な装飾より完成度・一貫性を優先。

## テスト方針

- `src/pipeline.js` と `src/store.js` のユニットテスト
- HTTPレベル: サーバーを起動して主要エンドポイントを叩く統合テスト(demoモードで決定的に通ること)
- `npm test` が API キー無しで全部通ること(CI前提)

## ドキュメント成果物

- `README.md`: プロダクト概要、3テーマ対応表、クイックスタート(`node server.js` だけで動く)、アーキテクチャ図(mermaid)、API一覧、live モード設定方法
- `docs/PITCH.md`: 5分ピッチ台本(課題→解決→デモ→新規性→ビジネスモデル→ロードマップ)
- `docs/DEMO.md`: 審査員向けデモ手順(3分で3テーマを見せる動線)

## 審査基準への対応 (全成果物で意識すること)

- **新規性**: Automation Discovery Engine(自動化の"発見"までAIがやる)を前面に
- **完成度**: 依存ゼロで clone → `node server.js` → 即デモ可能
- **実用性**: ROI(削減時間・削減コスト)を数値で見せる
- **技術力**: Claude API 統合(structured outputs)、demo/liveのグレースフルフォールバック、テスト完備
