# MemoFlow — Notion風メモアプリ

講座メモ・プロジェクト記録・議事録などを1か所にまとめ、**さまざまな形式で出力・取り込み**できるメモアプリです。
ビルド不要・依存ライブラリなしの静的サイトなので、`index.html` を開くだけで使えます。

```
memoflow/
├── index.html      画面の構造
├── styles.css      デザイン（ライト / ダーク / 印刷用）
└── js/
    ├── util.js     共通ユーティリティ
    ├── store.js    データモデルと保存（localStorage）
    ├── convert.js  形式変換（Markdown / HTML / テキスト / JSON / ZIP）
    ├── editor.js   ブロックエディタ
    ├── cloud.js    クラウド同期（Supabase, 任意）
    ├── app.js      サイドバー・検索・出力/取込などの画面制御
    └── vendor/     同梱ライブラリ（@supabase/supabase-js の UMDビルド, MIT）
```

## 使い方

1. `memoflow/index.html` をブラウザで開く（ダブルクリックでOK）
2. 左の **＋ 新規ページ** でページを作る
3. 本文を書く。`/` を押すとブロックの種類を選べます

より確実に動かすなら、簡易サーバ経由での表示を推奨します（保存の挙動がブラウザ設定に左右されにくくなります）。

```bash
cd memoflow
python3 -m http.server 8000
# → http://localhost:8000 を開く
```

## 主な機能

### 書く
- **ブロックエディタ**: テキスト / 見出し1〜3 / 箇条書き / 番号付き / ToDo / 引用 / コールアウト / コード / 区切り線 / 画像
- **スラッシュコマンド**: 本文で `/` → メニューから種類を選択（`/todo` のように絞り込み可）
- **Markdownショートカット**: `# `→見出し、`- `→箇条書き、`1. `→番号付き、`[] `→ToDo、`> `→引用、` ``` `→コード、`---`→区切り線
- **並べ替え**: 各ブロック左端の `⠿` をドラッグ、または `Ctrl+Shift+↑ / ↓`
- **装飾**: `Ctrl+B` 太字 / `Ctrl+I` 斜体 / `Ctrl+U` 下線 / `Ctrl+E` インラインコード / `Ctrl+K` リンク
- 複数行の貼り付けはMarkdownとして解釈し、自動でブロックに分割します

### 整理する
- サイドバーでページを**入れ子**に管理（ドラッグで別ページの子に移動）
- お気に入り、ゴミ箱（復元・完全削除）
- `Ctrl+K` のクイック検索（ページ名＋本文を横断）

### 出力（エクスポート）

| 形式 | 対象 | 用途 |
|---|---|---|
| Markdown `.md` | ページ単位 / 全ページ1ファイル | 他ツールへの移行、Git管理 |
| HTML `.html` | ページ単位 | 書式を保ったまま共有 |
| テキスト `.txt` | ページ単位 | どこでも開ける素の形式 |
| JSON `.json` | ページ単位（子ページ含む）/ 全体 | **完全復元できるバックアップ** |
| ZIP `.zip` | 全体 | ページ階層をフォルダ構造にした `.md` 群 ＋ JSON |
| PDF | ページ単位 | 印刷ダイアログから「PDFに保存」 |
| クリップボード | ページ単位 | Markdownをそのままコピー |

### 取り込み（インポート）
- 対応形式: `.md` / `.markdown` / `.txt` / `.html` / `.json`
- 方法: **取込**ボタンからファイル選択（複数可）、テキストの貼り付け、**画面へのドラッグ＆ドロップ**
- JSONはMemoFlowのバックアップ形式。取り込み時に「追加」か「すべて置き換え」を選べます
- 「現在のページの子ページとして取り込む」チェックで、既存の階層に差し込めます

## クラウド同期（任意）

複数端末でメモを同期したい場合は、右上の ☁ ボタンから設定できます。無料の
[Supabase](https://supabase.com) プロジェクトを1つ使い、あなた専用のデータベースに
ワークスペースを保存する方式です。**設定しなくてもアプリは通常どおり使えます**（ローカル保存のみ）。

### セットアップ

1. [supabase.com](https://supabase.com) で無料アカウントを作成し、新規プロジェクトを作成
2. 「Project Settings → API」で **Project URL** と **anon public key** を控える
3. 「SQL Editor」で以下を実行（アプリの ☁ ダイアログ内にも同じSQLがあります）

   ```sql
   create table if not exists public.memoflow_workspaces (
     user_id uuid primary key references auth.users(id) on delete cascade,
     data jsonb not null,
     device text,
     updated_at timestamptz not null default now()
   );

   alter table public.memoflow_workspaces enable row level security;

   create policy "select own workspace" on public.memoflow_workspaces
     for select using (auth.uid() = user_id);
   create policy "insert own workspace" on public.memoflow_workspaces
     for insert with check (auth.uid() = user_id);
   create policy "update own workspace" on public.memoflow_workspaces
     for update using (auth.uid() = user_id);

   alter publication supabase_realtime add table public.memoflow_workspaces;
   ```

4. 「Authentication → URL Configuration」の Redirect URLs に、このアプリを開くURL
   （例: `https://example.com/memoflow/`）を追加
5. アプリの ☁ ボタン → Project URL と anon key を入力して保存 → メールアドレスを入力して
   ログインリンクを送信 → 届いたメールのリンクを開くとサインイン完了

### 仕組みと注意点

- ログインは**パスワード不要のマジックリンク方式**です
- Project URL と anon key は**このブラウザの localStorage にのみ**保存され、リポジトリには含まれません
- サインイン後は、保存のたびに自動でクラウドへアップロードし（オフでも可）、他の端末からの
  変更は Supabase の Realtime 機能でリアルタイムに取り込まれます
- 同期は**ワークスペース全体を1つのJSONとして最終更新時刻の新しい方を採用**する方式です
  （last-write-wins）。同じ端末を1台ずつ使う分には問題ありませんが、**2台以上で同時に編集すると
  後から保存した側の内容で上書きされ、片方の変更が失われます**。厳密な差分マージは行っていません
- ☁ ダイアログから手動での「今すぐアップロード」「クラウドから取得」も可能です
- データは選んだリージョンのSupabaseプロジェクトに保存されます。取り扱いには通常のクラウドサービス
  利用と同様の注意（無料枠の一時停止、アカウント管理など）が必要です

## ショートカット

| キー | 動作 |
|---|---|
| `Ctrl+K` | ページ検索 |
| `Ctrl+S` | 手動保存（通常は自動保存） |
| `Ctrl+\` | サイドバー表示切替 |
| `Ctrl+Shift+P` | 印刷 / PDF |
| `Ctrl+D` | ブロックを複製 |
| `Ctrl+Shift+↑ / ↓` | ブロックを上下に移動 |
| `Enter` / `Shift+Enter` | 新しいブロック / ブロック内改行 |
| `Esc` | メニュー・ダイアログを閉じる |

## 技術方針と制約

**技術選定の理由**: ビルドツールもサーバも不要な静的構成（HTML + CSS + vanilla JS）にしています。導入の手間がなく、GitHub Pages などにそのまま置けて、依存パッケージの更新で壊れることもないためです。

**制約（把握しておいてください）**

- データは**そのブラウザの localStorage にのみ**保存されます。端末間の同期はありません。ブラウザのデータ消去で消えるため、定期的に **JSON または ZIP でバックアップ**してください。
- localStorage の容量は概ね 5MB 程度です。画像は Data URL として埋め込むため、アプリ側で1枚 1.5MB を上限にしています。画像を多用する場合は容量に注意してください。
- Markdown取り込みは主要記法（見出し・リスト・ToDo・引用・コード・区切り線・画像・強調・リンク）に対応します。表やネストしたリストの階層は保持されません（表は段落として取り込まれます）。
- HTML取り込みは、装飾タグを安全なもの（`b/i/u/s/code/a/br`）に限定してサニタイズします。
- `file://` で直接開いた場合の保存可否はブラウザによって異なります（Chromium系では動作を確認済み）。確実に使うなら簡易サーバ経由を推奨します。

## テスト

Playwright による E2E スモークテストで、以下を確認済みです（本体29項目＋クラウド同期UI19項目 / 全パス）。

- 初期表示、ページ作成、入力、Markdownショートカット、スラッシュコマンド
- リロード後のデータ保持、ゴミ箱と復元、ブロック複製、クイック検索、テーマ切替
- Markdown / HTML の相互変換（往復）、JSON出力、ZIP生成、テキスト取り込み
- 表（Markdownの `|` 区切り）が段落結合で1行に潰れず保持されること
- クラウド同期: 未接続時の画面、接続情報の保存/削除、デバイスIDの永続化、
  未接続でも通常の編集機能に影響がないこと

**未検証の範囲**: 実際のSupabaseプロジェクトを使った、サインイン〜プッシュ〜他端末での
Realtime受信という一連の動作は、有効な認証情報が必要なためこの開発環境では検証していません。
上記の「セットアップ」手順で実際のプロジェクトを用意した上で、一度動作確認をお願いします。
