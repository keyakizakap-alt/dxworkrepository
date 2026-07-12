# DX Copilot デプロイ手順書

ハッカソン審査・デモから小規模な本番運用までを想定した手順書です。

## 0. 前提

| 項目 | 要件 |
|---|---|
| ランタイム | Node.js **20以上**(22推奨) |
| 依存パッケージ | **不要**(デモモード)。liveモードのみ `@anthropic-ai/sdk` |
| データ永続化 | `data/store.json`(JSONファイル。DB不要) |
| ポート | 環境変数 `PORT`(既定 3000) |

### 環境変数一覧

| 変数 | 必須 | 説明 |
|---|---|---|
| `PORT` | 任意 | 待受ポート(既定 `3000`) |
| `ANTHROPIC_API_KEY` | 任意 | 設定すると **liveモード**(Claude API)に自動切替。未設定なら**デモモード** |
| `DX_COPILOT_MODEL` | 任意 | 使用モデル(既定 `claude-opus-4-8`) |

> liveモードでAPI呼び出しに失敗した場合も、自動的にデモ応答へフォールバックしサービスは継続します。

---

## 1. ローカル / デモ会場での起動(最速・推奨)

```bash
git clone https://github.com/keyakizakap-alt/dxworkrepository.git
cd dxworkrepository
node server.js
# → http://localhost:3000 を開く(デモモードで即動作)
```

liveモード(Claude API)に切り替える場合:

```bash
npm install                      # @anthropic-ai/sdk を導入
export ANTHROPIC_API_KEY=sk-ant-...
node server.js
# 画面右上のバッジが「Claude API接続中」(緑)になれば成功
```

動作確認:

```bash
curl http://localhost:3000/api/health   # {"status":"ok","mode":"demo"|"live",...}
npm test                                 # テスト31件(APIキー不要で全件通過)
```

---

## 2. Docker でのデプロイ

リポジトリ直下の `Dockerfile` を使用します。

```bash
# ビルド
docker build -t dx-copilot .

# デモモードで起動
docker run -d --name dx-copilot -p 3000:3000 dx-copilot

# liveモード + データ永続化つきで起動
docker run -d --name dx-copilot \
  -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -v dxcopilot-data:/app/data \
  dx-copilot
```

- `data/store.json` はコンテナ内 `/app/data` に書かれるため、実行履歴を残したい場合は上記のようにボリュームをマウントしてください。
- 停止/更新: `docker rm -f dx-copilot` → 再ビルド → 再起動。

---

## 3. PaaS へのデプロイ(Render / Railway / Fly.io)

いずれも「Node.jsアプリ」または「Dockerfile」として認識させるだけで動きます。

### 共通設定

| 設定 | 値 |
|---|---|
| Build command | `npm install`(liveモード用。デモのみなら省略可) |
| Start command | `node server.js` |
| ヘルスチェックパス | `/api/health` |
| 環境変数 | `ANTHROPIC_API_KEY`(live化する場合)、`DX_COPILOT_MODEL`(任意) |

`PORT` は各PaaSが自動注入する値をそのまま利用します(アプリ側は `process.env.PORT` を参照済み)。

### 注意: ファイル永続化

PaaSの無料枠は多くが**エフェメラルファイルシステム**です。再デプロイ/再起動で `data/store.json` は初期シードに戻ります(デモ用途ではむしろ都合が良い挙動です)。継続運用する場合は永続ディスク(Render Disks、Fly Volumes 等)を `data/` にマウントしてください。

---

## 4. VPS / オンプレ(systemd 常駐化)

```bash
# 配置
sudo mkdir -p /opt/dx-copilot
sudo git clone https://github.com/keyakizakap-alt/dxworkrepository.git /opt/dx-copilot
cd /opt/dx-copilot && npm install   # liveモード用(任意)
```

`/etc/systemd/system/dx-copilot.service`:

```ini
[Unit]
Description=DX Copilot
After=network.target

[Service]
WorkingDirectory=/opt/dx-copilot
ExecStart=/usr/bin/node server.js
Restart=always
Environment=PORT=3000
# liveモードの場合(キーは EnvironmentFile での管理を推奨)
# EnvironmentFile=/etc/dx-copilot.env
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dx-copilot
curl http://localhost:3000/api/health
```

---

## 5. 公開時のセキュリティ注意

本アプリはハッカソンのデモを主目的としており、**認証機構を持ちません**。インターネットに公開する場合は必ず:

1. **リバースプロキシ(nginx / Caddy)+ Basic認証** または IP制限をかける
2. **HTTPS化**(Caddy なら自動、nginx なら Let's Encrypt)
3. `ANTHROPIC_API_KEY` はリポジトリにコミットせず、環境変数/シークレットマネージャで注入する
4. liveモードを公開する場合、API利用コストが発生する点に留意(不特定多数に開放しない)

nginx の最小構成例:

```nginx
server {
  listen 443 ssl;
  server_name dx-copilot.example.com;
  # ssl_certificate ...; ssl_certificate_key ...;

  auth_basic "DX Copilot";
  auth_basic_user_file /etc/nginx/.htpasswd;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
  }
}
```

---

## 6. ハッカソン当日の運用チェックリスト

- [ ] 会場Wi-Fiが不安定でも**デモモードはオフラインで完動**(ネット不要)
- [ ] 起動リハーサル: `node server.js` → 4画面(ダッシュボード/AI分析/パイプライン/自動化発見)を一巡
- [ ] live切替を見せる場合: `ANTHROPIC_API_KEY` を設定した端末を別に用意し、バッジの色(アンバー→グリーン)の変化を見せる
- [ ] 実行履歴をリセットしたい場合: サーバー停止 → `rm data/store.json` → 再起動(初期シードが再投入される)
- [ ] トラブル時のフォールバック: キーを外してデモモードで続行(機能はすべて動作する)

## 7. トラブルシューティング

| 症状 | 対処 |
|---|---|
| `EADDRINUSE`(ポート使用中) | `PORT=3100 node server.js` で別ポート起動 |
| バッジが「デモモード」のまま | `ANTHROPIC_API_KEY` の設定と `npm install` 実施を確認(サーバー起動ログに `mode: live` と出るか) |
| live応答がデモ応答に見える | API呼び出し失敗時は自動フォールバックする仕様。サーバーログの `[llm]` 警告を確認 |
| 実行履歴がおかしくなった | `data/store.json` を削除して再起動(シード再投入) |
