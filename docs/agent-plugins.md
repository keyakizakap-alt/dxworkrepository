# Agent Plugins 導入ガイド

このリポジトリは [Agent Plugins v1.0.0](https://agent-plugins.org/specification) 準拠の
プラグインを管理します。スキルと MCP サーバーを **一度定義すれば複数の AI クライアントで
そのまま使える** 状態にすることが目的です。

## 前提: agent-plugins.org は「規格サイト」であって配布サイトではない

最初に事実確認です。agent-plugins.org には **インストール可能なプラグインは置かれていません**。
このサイトが提供しているのは、プラグインの *packaging 規格* (仕様書・JSON Schema・実装ガイド)
です。したがって「サイトにあるプラグインを入れる」ことはできず、代わりに **規格そのものを
このリポジトリに適用** しています。

公式が配布している唯一の実体は参照用サンプル
[agentplugins/agent-plugins-example](https://github.com/agentplugins/agent-plugins-example)
(MIT) で、これに含まれる `migrate-agent-plugin` スキルは本リポジトリに取り込み済みです。

規格の Technical Steering Committee には Amazon / Cursor / Microsoft / OpenAI / Vercel が
参加しています。対応クライアントとして公開されているのは VS Code、Cursor、GitHub Copilot、
ChatGPT & Codex、Kiro です。**Claude Code は現時点で公式対応クライアント一覧に載っていません。**
そのため本リポジトリでは、後述の「二重マニフェスト方式」で Claude Code でも動くようにしています。

## ポータブルな範囲と、そうでない範囲

v1.0.0 で可搬なのは次の 3 つだけです。

| 場所 | 内容 |
| --- | --- |
| `plugin.json` (必須・ルート) | プラグインの識別情報とメタデータ。スキーマは **closed** |
| `skills/<name>/SKILL.md` | Agent Skills。`skills/` の **直下の子ディレクトリのみ** が探索対象 |
| `mcp.json` (任意・ルート) | MCP サーバー。`stdio` / `streamable-http` / `sse` を明示 |

hooks、agents、commands、LSP、出力スタイル、テーマ、マーケットプレイス情報は **可搬コンポーネント
ではありません**。これらは逆ドメイン名前空間 (`com.vendor.client/`) のクライアント拡張として置きます。
`plugin.json` のトップレベルに書くと、それ自体がスキーマ違反になります。

## このリポジトリの構成

```text
dxworkrepository/
├── .claude-plugin/marketplace.json   # Claude Code マーケットプレイス定義
├── .claude/
│   ├── settings.json                 # プロジェクトスコープ設定 (追加のみ)
│   └── skills/agent-plugins-kit      # → ../../plugins/agent-plugins-kit (symlink)
├── plugins/
│   └── agent-plugins-kit/
│       ├── plugin.json               # Agent Plugins v1.0.0 マニフェスト (可搬)
│       ├── .claude-plugin/plugin.json# Claude Code 用マニフェスト (クライアント拡張)
│       ├── skills/                   # 4 スキル
│       ├── scripts/                  # 検証・生成・雛形の 3 ツール
│       └── schemas/1.0.0/            # 公式 JSON Schema をベンダリング (オフライン検証用)
└── docs/agent-plugins.md             # このファイル
```

### 二重マニフェスト方式

同じディレクトリにマニフェストを 2 つ置いています。

- ルート `plugin.json` — Agent Plugins 規格。VS Code / Cursor / Copilot / Codex / Kiro が読む。
- `.claude-plugin/plugin.json` — Claude Code 規格。Claude Code が読む。

規格側は `.claude-plugin/` を「実装しない名前空間」として無視し、Claude Code はルートの
`plugin.json` を無視します。**どちらのクライアントからも壊れずに読める** ため、可搬性を保ったまま
今の環境でそのまま使えます。ルート `plugin.json` の `extensions` には
`com.anthropic.claude-code` 名前空間で Claude Code 用マニフェストの位置を記録しています。

## 今の環境への適用方法

### 方法 A: symlink (設定変更なし・適用済み)

`.claude/skills/<name>/.claude-plugin/plugin.json` が存在するディレクトリは、Claude Code が
**次回セッションから `<name>@skills-dir` という名前のプラグインとして自動的に読み込みます**。
インストール操作もマーケットプレイス登録も不要です。本リポジトリでは
`.claude/skills/agent-plugins-kit` → `../../plugins/agent-plugins-kit` の相対 symlink を
コミット済みなので、**追加作業なしで有効** になります。

この方式はプロジェクトスコープなので、`~/.claude/` 配下の既存スキルや設定には一切触れません。

### 方法 B: マーケットプレイス経由 (他プロジェクトでも使う場合)

```
/plugin marketplace add keyakizakap-alt/dxworkrepository
/plugin install agent-plugins-kit@dxworkrepository
```

`--scope user` を付ければ全プロジェクトで有効になります。

### 方法 C: Agent Plugins 対応クライアント

`plugins/agent-plugins-kit/` をそのまま各クライアントのプラグイン読み込み先に配置します。
インストール手順はクライアントごとに異なり、規格の管轄外です
([対応クライアント一覧](https://agent-plugins.org/compatible-clients))。

## 収録スキル

| スキル | 用途 |
| --- | --- |
| `author-agent-plugin` | 新規プラグインの作成、スキル / MCP サーバーの追加 |
| `validate-agent-plugin` | v1.0.0 適合検証とエラーの読み方 |
| `connect-mcp-server` | アプリ / API を 1 回の定義で複数クライアントに接続 |
| `migrate-agent-plugin` | 既存のクライアント固有プラグインを可搬形式へ移行 (公式サンプル由来・MIT) |

## ツール

いずれも **Python 3 標準ライブラリのみ**。依存パッケージもネットワークアクセスも不要です。

```bash
# 適合検証 (--json / --strict あり)
python3 plugins/agent-plugins-kit/scripts/ap_validate.py plugins/agent-plugins-kit

# 全プラグインをまとめて検証
python3 plugins/agent-plugins-kit/scripts/ap_validate.py plugins/*/

# 新規プラグインの雛形
python3 plugins/agent-plugins-kit/scripts/ap_new.py my-plugin --skill my-skill --claude-code

# mcp.json → 各クライアントのネイティブ設定 (--write で書き出し)
python3 plugins/agent-plugins-kit/scripts/ap_export.py --plugin plugins/my-plugin --client all
```

### `ap_export.py` の出力先

| クライアント | 出力 | 形 |
| --- | --- | --- |
| `claude-code` | `.mcp.json` | `mcpServers`、リモートは `type: "http"` |
| `vscode` | `.vscode/mcp.json` | `servers` |
| `cursor` | `.cursor/mcp.json` | `mcpServers` |
| `codex` | `.codex/config.toml` | `[mcp_servers.<name>]` (`~/.codex/config.toml` へマージ) |

`mcp.json` が唯一の正であり、生成物は派生物です。生成ファイルを直接編集せず、`mcp.json` を
直してから再生成してください。エクスポート時には `./` 相対コマンドの絶対パス化、
`${PLUGIN_ROOT}` / `${PLUGIN_DATA}` の展開、両変数の `env` への注入を行います
(Agent Plugins クライアント以外はこれらを自前で供給しないため)。

## 認証情報の扱い

v1.0.0 には **可搬な OAuth / 資格情報参照フィールドが存在しません**。認証はクライアント管理です。
`headers` はパッケージに含まれる可視の literal データなので、トークンを書くと平文でコミットされます。
Claude Code なら `/mcp`、VS Code なら input variables など、各クライアントの資格情報機構を使ってください。
`ap_validate.py` は資格情報らしいヘッダー名を検出して警告します。

## 障害の切り分け

- `plugin.json` のスキーマ違反 (未知フィールドを除く) → プラグイン全体が拒否される
- `mcp.json` のトップレベル不正 → そのプラグインの MCP のみ無効。スキルは読み込まれる
- MCP サーバー 1 件の不正 → その 1 件のみ無効。他サーバーとスキルは影響なし
- スキル 1 件の不正 → そのスキルのみスキップ

未知のトップレベルフィールドは「報告して無視」であり致命的ではありません。`ap_validate.py` は
これを WARN として出します。

## 参照

- [仕様書](https://agent-plugins.org/specification) — 規範文書。Schema と食い違う場合は仕様書が優先
- [JSON Schemas](https://agent-plugins.org/schemas) — `schemas/1.0.0/` にベンダリング済み
- [Agent Skills 仕様](https://agentskills.io/specification) — `SKILL.md` の正
- [MCP 仕様](https://modelcontextprotocol.io/specification) — MCP の通信仕様の正
