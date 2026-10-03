// 管理画面：件数の集計だけを表示する。トーク内容・名前・LINE の ID は API から返ってこない。

import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";

interface Summary {
  generatedAt: number;
  chats: { groups: number; users: number };
  push: { month: string; used: number; scheduled: number; limit: number };
  openTasks: number;
  scheduledReminders: number;
  daily: Array<{ day: string; counts: Record<string, number> }>;
  intents: Record<string, number>;
}

const COLUMNS: Array<[string, string]> = [
  ["webhook_events", "受信"],
  ["messages_handled", "対応"],
  ["push_sent", "お知らせ送信"],
  ["push_failed", "送信失敗"],
  ["llm_calls", "LLM"],
  ["llm_errors", "LLM失敗"],
  ["signature_failures", "署名NG"],
];

const INTENT_LABELS: Record<string, string> = {
  create_reminder: "リマインダー",
  schedule_group_message: "グループへ予約送信",
  create_task: "タスク作成",
  assign_task: "担当変更",
  complete_task: "タスク完了",
  list_tasks: "タスク一覧",
  list_reminders: "お知らせ一覧",
  delete_reminder: "リマインダー削除",
  repeat_reminder: "もう一回",
  summarize: "会話まとめ",
  extract_tasks: "会話からタスク抽出",
  unknown: "読み取れず",
};

function App() {
  const [password, setPassword] = useState("");
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (pw: string) => {
    setError(null);
    const res = await fetch("/api/admin/summary", {
      headers: { authorization: `Basic ${btoa(`admin:${pw}`)}` },
    });
    if (res.status === 401) return setError("パスワードが違います。");
    if (!res.ok) return setError("管理画面は無効になっています（ADMIN_PASSWORD 未設定）。");
    setData((await res.json()) as Summary);
  };

  if (!data) {
    return (
      <form
        className="login"
        onSubmit={(e) => {
          e.preventDefault();
          void load(password);
        }}
      >
        <h1>ことづて 管理</h1>
        <p>利用状況の件数だけを確認できます。</p>
        <label className="sr-only" htmlFor="pw">
          パスワード
        </label>
        <input id="pw" type="password" autoComplete="current-password" placeholder="パスワード" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit">ひらく</button>
        {error && <div className="error">{error}</div>}
      </form>
    );
  }

  const usedPct = Math.min(100, Math.round(((data.push.used + data.push.scheduled) / Math.max(1, data.push.limit)) * 100));
  const intents = Object.entries(data.intents).sort((a, b) => b[1] - a[1]);

  return (
    <main className="admin">
      <header>
        <h1>ことづて 管理</h1>
        <button className="btn ghost" onClick={() => void load(password)}>
          更新
        </button>
      </header>

      <div className="privacy-note">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "none", marginTop: 2 }}>
          <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        <div>この画面に出るのは件数だけです。トーク内容・名前・やることの中身・LINE の ID は、仕組み上この画面には届きません。</div>
      </div>

      <section className="stats" aria-label="概要">
        <div className="stat">
          <div className="label">今月のお知らせ通数（{data.push.month}）</div>
          <div className="value">
            {data.push.used}
            <small>
              ＋予定 {data.push.scheduled} / {data.push.limit}通
            </small>
          </div>
          <div className="meter" aria-hidden="true">
            <div className={usedPct >= 80 ? "warn" : ""} style={{ width: `${usedPct}%` }} />
          </div>
        </div>
        <div className="stat">
          <div className="label">参加中のグループ</div>
          <div className="value">{data.chats.groups}</div>
        </div>
        <div className="stat">
          <div className="label">1対1で使っている人</div>
          <div className="value">{data.chats.users}</div>
        </div>
        <div className="stat">
          <div className="label">予定中のお知らせ / 未完了のタスク</div>
          <div className="value">
            {data.scheduledReminders}
            <small>/ {data.openTasks}</small>
          </div>
        </div>
      </section>

      <section className="table-card">
        <h2>日ごとの件数（直近14日）</h2>
        <table>
          <thead>
            <tr>
              <th>日付</th>
              {COLUMNS.map(([, label]) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.daily.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1}>まだデータがありません</td>
              </tr>
            ) : (
              data.daily.map((d) => (
                <tr key={d.day}>
                  <td>{d.day}</td>
                  {COLUMNS.map(([k]) => (
                    <td key={k}>{d.counts[k] ?? 0}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="table-card">
        <h2>使われた機能（直近14日）</h2>
        <table>
          <tbody>
            {intents.length === 0 ? (
              <tr>
                <td>まだデータがありません</td>
              </tr>
            ) : (
              intents.map(([k, v]) => (
                <tr key={k}>
                  <td>{INTENT_LABELS[k] ?? (k.startsWith("postback_") ? `ボタン：${k.slice(9)}` : k)}</td>
                  <td>{v}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
