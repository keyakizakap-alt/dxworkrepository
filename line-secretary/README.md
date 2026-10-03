# ことづて：LINEグループに入れて話しかけるだけの予定・やること係

LINE公式アカウントを友だち追加して、いつものグループに招待すれば使えます。コマンドは覚えなくてよく、普通の日本語で話しかけます。

```
明日20時に教えて                         → 「明日20:00にお知らせします。」[登録する]
金曜の18時に、明日は10時集合ってみんなに送って → 「金曜18:00に、このグループへ『明日は10時集合です』と送ります。」[予約する][変更する]
ホテルの予約、田中さん担当で金曜までにお願い    → 「ホテル予約をタスクにしました。担当：田中 期限：金曜日」
この話、やることにまとめて                  → 会話から「ホテル予約（担当：田中・期限：金曜日）」を見つけて [登録する][やめる]
今日決まったことまとめて                    → 今日決まったこと／やること
```

## すぐ試す（Mock Mode：LINE の設定は不要）

```bash
cd line-secretary
npm install
npm run build     # 画面のビルドと Worker のビルド確認
npm run mock      # → http://localhost:8787
```

- `http://localhost:8787`：LINE 風のお試し画面です。1対1とグループを切り替えられます。「お試し用の時計」を進めると、時間になったお知らせが届きます。
- `http://localhost:8787/admin`：管理画面です。Mock Mode のパスワードは `mock-admin` です。

## 構成（運用費 0 円を目指す構成）

OSS の「LINE Harness」と同じく、Cloudflare の無料枠だけで動く構成にしています。

| 役割 | 使うもの |
| --- | --- |
| Webhook・API・定期実行 | Cloudflare Workers ＋ Hono（Cron Trigger で毎分、送信予定を確認） |
| データ | Cloudflare D1（SQLite） |
| 画面（お試し画面・管理画面） | Workers Static Assets（Vite ＋ React） |
| 文章の読み取り | 基本はルール（LLM なし）。まとめ・抽出・読めない依頼だけ LLM（Gemini、任意） |
| ローカル・テスト | Node 22.5 以上の組み込み SQLite（`node:sqlite`） |

```
LINE ─Webhook→ 署名検証 → ルールで読み取り ─(読めないときだけ)→ LLM（読み取りのみ）
                                │
                                ▼
                         Executor（許可した操作だけ）→ D1
                                │  人に届く送信は確認ボタンの後
Cron（毎分）→ 送信時刻が来たお知らせを Push
```

### 主なファイル

- `src/core/datetime.ts`：日本語の日時表現の読み取り（「明日20時」「金曜まで」「3時間後」など）
- `src/core/intent.ts`：言い方のゆれから意図を読み取る（LLM なし）
- `src/executor/actions.ts`：実行してよい操作の一覧（Executor）
- `src/executor/handler.ts`：グループで反応するかどうかの判断と、確認ボタンの処理
- `src/executor/scheduler.ts`：お知らせの送信
- `src/llm/`：LLM（Gemini）。人名・電話番号・メールは送る前に伏せる
- `src/admin/routes.ts`・`src/metrics/metrics.ts`：管理画面（件数だけ）
- `web/`：お試し画面と管理画面

## 本番（LINE）につなぐ手順

> ⚠ ここから先は外部サービスへの公開や課金の設定を含みます。実行前に内容を確認してください。

1. LINE Developers で Messaging API チャネルを作り、「グループトーク・複数人トークへの参加を許可する」をオンにする。
2. D1 を作り、`wrangler.toml` の `database_id` を書き換える。
   ```bash
   npx wrangler d1 create line-secretary
   npm run db:migrate:remote
   ```
3. 秘密情報を登録する（コードやブラウザ側には書かない）。
   ```bash
   npx wrangler secret put LINE_CHANNEL_SECRET
   npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
   npx wrangler secret put ENCRYPTION_KEY      # node -e "console.log(crypto.randomBytes(32).toString('base64'))"
   npx wrangler secret put ADMIN_PASSWORD      # 管理画面を使う場合
   npx wrangler secret put GEMINI_API_KEY      # LLM を使う場合（wrangler.toml の LLM_PROVIDER を "gemini" に）
   ```
4. `npm run deploy` でデプロイし、Webhook URL に `https://<worker>.workers.dev/webhook` を設定する。
5. 応答設定で「応答メッセージ」をオフ、「Webhook」をオンにする。

## グループでの反応のしかた

すべての発言に返事をすると邪魔になるため、グループでは次のときだけ反応します。

- `@ことづて` でメンションされたとき（`mention.mentionees[].isSelf`）
- ボットのメッセージに「返信」したとき（`quotedMessageId` を、送信時に保存したボットのメッセージ ID と照合）
- はっきりした依頼のとき（例：「〜ってみんなに送って」「〜担当で」「やることにまとめて」「明日20時に教えて」）
- 聞き返しへの返事のとき（「何時ごろ？」→「9時」）

「金曜までにお願い」のような、人に向けた発言には反応しません。

## 無料枠について（重要）

| 項目 | 内容 | 出典 |
| --- | --- | --- |
| LINE の通数 | 応答（Reply）は無料。Push は通数に数える。**グループへの Push は人数分**を数える | LINE Developers「Messaging APIの料金」（公式） |
| LINE 無料プラン | コミュニケーションプラン：月 200 通 | 同上 |
| Cloudflare Workers 無料枠 | 1日10万リクエスト、CPU 10ms/回、Cron Trigger 5個 | Cloudflare Workers Limits（公式ページ。値は非公式まとめで確認） |
| D1 無料枠 | 5GB、読み取り 500万行/日、書き込み 10万行/日 | 同上 |

このアプリでの対応：

- 確認・一覧・まとめ・「今すぐ送る」は、すべて無料の応答（Reply）で返します。
- Push を使うのは、予約した時刻に送るお知らせだけです。
- 予約時に「今月の使用数＋予約済み＋今回の人数分」が上限（`MONTHLY_MESSAGE_LIMIT`、初期値 200）を超える場合は登録しません。グループ宛てのときは「自分だけに知らせて（1通）」を案内します。
- 残りが 2 割を切ると、確認メッセージに残りの通数を添えます。

## プライバシーと安全

- **署名検証**：すべての Webhook で `x-line-signature`（HMAC-SHA256）を検証します。署名が違えば 401 を返します。
- **秘密情報**：Channel Secret・アクセストークン・API キーは Worker の Secret に置き、ブラウザには出しません。
- **LLM は読み取りだけ**：LLM が返すのは決まった形の JSON だけです。検証してから Executor に渡し、Executor は許可した操作しか実行しません。会話の中の指示には従わないよう指定しています。
- **人に届く送信は確認してから**：リマインダーとグループへの送信は、依頼した本人が［登録する］［予約する］を押すまで登録しません（二重押下・期限切れ・他の人が押した場合も処理しています）。
- **会話の保存は一時的**：まとめのために、グループの会話を最大 `MESSAGE_RETENTION_HOURS`（初期値 72 時間）だけ暗号化して保存し、その後は自動で消します。メッセージの送信取消（unsend）で該当メッセージを消し、ボットの退出（leave）でそのグループのデータを全部消します。「会話の保存やめて」で保存を止めて、保存済みの会話も消せます。
- **暗号化**：会話・やることの名前・表示名・お知らせ本文は、アプリ側で AES-GCM 暗号化してから保存します。
- **管理画面**：件数の集計だけを返します。管理画面のコードは、会話を扱うモジュールを import できないよう eslint で禁止しています（`eslint.config.js`）。
- **LLM に送る前の置き換え**：人名を「人物A」などに置き換え、電話番号・メールアドレス・URL を伏せてから送ります。

### ⚠ Gemini の無料枠について

Gemini API の無料枠では、入力内容が Google の製品改善に使われる場合があると説明されています（非公式記事で確認。公式の利用規約は未確認）。グループの会話をまとめる機能と相性が悪いため、**一般公開する前に有料枠（データを学習に使わない設定）に切り替える**か、`LLM_PROVIDER=none` のまま使ってください。`none` でも、日時の読み取り・タスク作成などは LLM なしで動きます（まとめ・抽出は簡易版になります）。

モデル名は `GEMINI_MODEL`（初期値 `gemini-3.1-flash-lite`）で変えられます。Gemini 2.5 系は 2026-10-16 で提供終了予定と非公式記事に記載があるため、3.1 系を初期値にしています。利用前に公式のモデル一覧で確認してください。

## 未確認・推測の点

公式ドキュメント（developers.line.biz）をこの環境から直接開けなかったため、次の点は記憶や二次情報に基づいています。本番の前に確認してください。

- 友だち追加していないユーザーへの個別 Push は届かない（`/v2/bot/profile/{userId}` が取れるかで判定）。
- 応答・Push の API が `sentMessages[].id` を返す（ボットへの「返信」判定に使う。返らなくても他の判定は動く）。
- `GET /v2/bot/message/quota` と `/quota/consumption` で今月の上限と使用数を取れる（取れない場合はアプリ内の数を使う）。
- ローディング表示（`/v2/bot/chat/loading/start`）は 1対1 のトークだけで使える。
- replyToken の有効時間（LLM を使う重い処理は Workers の `waitUntil` で裏に回しています）。

## 今回入れていないもの

- LINE ミニアプリ（一覧はトーク内の返信で見られます。お試し画面の右側が、ミニアプリにしたときのイメージです）。
- 繰り返しのリマインダー（毎週など）、複数グループをまたいだ一覧。

## コマンド

| コマンド | 内容 |
| --- | --- |
| `npm run mock` | Mock Mode のサーバー（先に `npm run build`） |
| `npm run dev` | 画面の開発サーバー（`/api` は 8787 に転送） |
| `npm run build` | 画面のビルドと、Worker のビルド確認（`wrangler deploy --dry-run`） |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | 単体・結合テスト（Vitest） |
| `npm run e2e` | お試し画面のブラウザテスト（Playwright） |
