-- 時刻はすべて UTC のミリ秒（INTEGER）。表示時に日本時間へ変換する。
-- *_enc の列はアプリ側で AES-GCM 暗号化した値（DB を見ても本文は読めない）。

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,               -- groupId / roomId / userId(1対1)
  type TEXT NOT NULL,                -- 'group' | 'room' | 'user'
  store_messages INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name_enc TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, user_id)
);

-- まとめ・やること抽出のための一時保存。expires_at を過ぎたら自動で消える。
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  user_id TEXT,
  text_enc TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages (chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_exp ON messages (expires_at);

-- ボットが送ったメッセージの ID（「返信」でボットに話しかけたかの判定に使う）
CREATE TABLE IF NOT EXISTS bot_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  title_enc TEXT NOT NULL,
  assignee_enc TEXT,
  assignee_user_id TEXT,
  due_date TEXT,                     -- 'YYYY-MM-DD'（日本時間）
  status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tasks_chat ON tasks (chat_id, status);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,             -- 依頼されたトーク
  target_id TEXT NOT NULL,           -- 送り先（groupId か userId）
  target_type TEXT NOT NULL,         -- 'chat' | 'user'
  kind TEXT NOT NULL,                -- 'reminder' | 'broadcast'
  content_enc TEXT NOT NULL,
  fire_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  attempts INTEGER NOT NULL DEFAULT 0,
  cost INTEGER NOT NULL DEFAULT 1,   -- 送信で消費する通数（グループは人数分）
  created_by TEXT,
  created_at INTEGER NOT NULL,
  sent_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders (status, fire_at);
CREATE INDEX IF NOT EXISTS idx_reminders_chat ON reminders (chat_id, status);

-- 確認ボタン待ちの操作
CREATE TABLE IF NOT EXISTS pending_actions (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  requester_id TEXT,
  kind TEXT NOT NULL,
  payload_enc TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- 「何時ごろ？」などの聞き返し中の状態
CREATE TABLE IF NOT EXISTS conv_states (
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_enc TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, user_id)
);

-- Webhook の重複受信対策
CREATE TABLE IF NOT EXISTS processed_events (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

-- 月ごとの Push 通数
CREATE TABLE IF NOT EXISTS push_usage (
  month TEXT PRIMARY KEY,            -- 'YYYY-MM'（日本時間）
  used INTEGER NOT NULL DEFAULT 0
);

-- 管理画面用の集計値だけを入れる表（本文・ID・名前は入れない）
CREATE TABLE IF NOT EXISTS metrics_daily (
  day TEXT NOT NULL,
  key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, key)
);

CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Mock Mode 専用の画面表示用ログ（本番では使わない）
CREATE TABLE IF NOT EXISTS mock_timeline (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  sender TEXT NOT NULL,              -- 'user' | 'bot'
  user_id TEXT,
  payload TEXT NOT NULL,
  quoted_id TEXT,
  created_at INTEGER NOT NULL,
  seq INTEGER NOT NULL
);
