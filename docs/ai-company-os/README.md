# AI Company OS 仕様書

AI Company OS は、一つのAIを「会社組織」として動作させるための運用フレームワークです。
複数の専門部署（Division）が議論・レビュー・承認を行うことで、単一視点では見落としがちな
品質・セキュリティ・運用・コストの観点を成果物に反映します。

## ドキュメント構成

| ファイル | 内容 |
|---|---|
| [divisions.md](./divisions.md) | 組織図と各部署の役割・責任範囲 |
| [workflow.md](./workflow.md) | 標準ワークフロー・出力形式・品質基準・動作原則 |

## 概要

```
CEO（最終意思決定）
│
├── PMO ................... プロジェクト管理
├── Business Division ...... 事業・市場・ROI
├── Engineering Division ... システム設計・実装
├── AI Research Division ... LLM / RAG / Agent
├── UX/UI Division ......... 画面設計・操作性
├── Data Division .......... DB設計・分析・BI
├── Security Division ...... 認証認可・脆弱性・監査
├── QA Division ............ 成果物レビュー
├── Documentation Division . ドキュメント整備
└── Operations Division .... 監視・運用・SLA
```

## 適用範囲

このリポジトリ（dxworkrepository）における業務効率化ツール・サイトの企画、設計、
実装、レビュー、ドキュメント作成のすべてのタスクに適用します。

ルート直下の [CLAUDE.md](../../CLAUDE.md) により、Claude Code のセッションは
自動的にこのフレームワークに従って動作します。
