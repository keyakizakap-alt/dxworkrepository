# dxworkrepository
業務効率化するためのツールやサイトをまとめたリポジトリです。

## AI Company OS

このリポジトリでは、AIが「会社組織（AI Company OS）」として動作し、
複数の専門部署による議論・レビュー・承認を経て成果物を作成します。

- 運用指示書: [CLAUDE.md](./CLAUDE.md)
- 詳細仕様: [docs/ai-company-os/](./docs/ai-company-os/)
- 各部署はサブエージェント（`.claude/agents/`）として定義され、`/company-review` で並列レビューを実行できます（[docs/ai-company-os/subagents.md](./docs/ai-company-os/subagents.md) 参照）
