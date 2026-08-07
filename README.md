# dxworkrepository

業務効率化するためのツールやサイトをまとめたリポジトリです。

[Agent Plugins v1.0.0](https://agent-plugins.org/specification) 準拠のプラグインを管理し、
スキルと MCP サーバーを一度定義すれば Claude Code / VS Code / Cursor / GitHub Copilot /
Codex / Kiro のいずれでも使える状態を目指します。

## クイックスタート

このリポジトリを開いた Claude Code セッションでは、`agent-plugins-kit` が
`.claude/skills/` 経由で **自動的に読み込まれます**(インストール操作は不要)。

```bash
# 収録プラグインの適合検証
python3 plugins/agent-plugins-kit/scripts/ap_validate.py plugins/*/

# 新しいプラグインの雛形を作る
python3 plugins/agent-plugins-kit/scripts/ap_new.py my-plugin --skill my-skill --claude-code

# mcp.json を各クライアントのネイティブ設定へ変換
python3 plugins/agent-plugins-kit/scripts/ap_export.py --plugin plugins/my-plugin --client all
```

ツールは Python 3 標準ライブラリのみで動き、外部依存もネットワークアクセスも不要です。

## 収録プラグイン

### `agent-plugins-kit`

Agent Plugins パッケージの作成・検証・移行・エクスポートを行うプラグイン。

| スキル | 用途 |
| --- | --- |
| `author-agent-plugin` | 新規プラグイン作成、スキル / MCP サーバー追加 |
| `validate-agent-plugin` | v1.0.0 適合検証とエラーの読み解き |
| `connect-mcp-server` | アプリ / API を 1 回の定義で複数クライアントへ接続 |
| `migrate-agent-plugin` | 既存のクライアント固有プラグインを可搬形式へ移行 |

## 構成

```text
.claude-plugin/marketplace.json   Claude Code マーケットプレイス定義
.claude/skills/agent-plugins-kit  → plugins/agent-plugins-kit (symlink)
plugins/<name>/plugin.json        Agent Plugins マニフェスト (可搬)
plugins/<name>/.claude-plugin/    Claude Code マニフェスト (クライアント拡張)
plugins/<name>/skills/            Agent Skills
plugins/<name>/mcp.json           MCP サーバー定義 (任意)
docs/agent-plugins.md             導入・運用ガイド
```

## 他プロジェクトから使う

```
/plugin marketplace add keyakizakap-alt/dxworkrepository
/plugin install agent-plugins-kit@dxworkrepository
```

## ドキュメント

詳細な設計方針、二重マニフェスト方式の理由、認証情報の扱い、障害の切り分けは
[docs/agent-plugins.md](docs/agent-plugins.md) を参照してください。

## ライセンス

リポジトリ全体のライセンスは未設定です。`plugins/agent-plugins-kit/skills/migrate-agent-plugin/`
のみ [agentplugins/agent-plugins-example](https://github.com/agentplugins/agent-plugins-example)
由来の MIT で、同ディレクトリに LICENSE を同梱しています。
