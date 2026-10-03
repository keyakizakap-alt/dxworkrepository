import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";

type ChatKind = "dm" | "group";

interface QuickItem {
  action: { label: string; data: string; displayText?: string };
}

interface FlexButton {
  style: string;
  action: { label: string; data: string };
}

type Message =
  | { type: "text"; text: string; quickReply?: { items: QuickItem[] } }
  | {
      type: "flex";
      altText: string;
      contents: { body?: { contents?: Array<{ text?: string }> }; footer?: { contents?: FlexButton[] } };
      quickReply?: { items: QuickItem[] };
    };

interface TimelineItem {
  id: string;
  sender: "user" | "bot";
  userId: string | null;
  message: Message;
  quotedId: string | null;
  at: number;
}

interface MockState {
  now: number;
  nextReminderAt: number | null;
  chat: { id: string; name: string; type: ChatKind };
  botName: string;
  users: Array<{ userId: string; name: string; friend: boolean }>;
  timeline: TimelineItem[];
  tasks: Array<{ id: string; title: string; assignee: string | null; dueDate: string | null }>;
  reminders: Array<{ id: string; content: string; fireAt: number; kind: string; toSelf: boolean }>;
}

const ME = "U_mock_me";
const AVATAR_COLORS: Record<string, string> = {
  U_mock_me: "#5b8def",
  U_mock_tanaka: "#e58a4e",
  U_mock_sato: "#a77bd6",
};

const EXAMPLES: Record<ChatKind, string[]> = {
  dm: ["明日20時に教えて", "明日の朝8時にゴミ出しって教えて", "まだ終わってないことある？", "さっきのリマインド消して"],
  group: [
    "明日の20時に飲み会のことみんなに知らせて",
    "ホテルの予約、田中さん担当で金曜までにお願い",
    "この話、やることにまとめて",
    "今日決まったことまとめて",
    "金曜の18時に、明日は10時集合ってみんなに送って",
  ],
};

const DOW = "日月火水木金土";

function jst(ms: number) {
  const d = new Date(ms + 9 * 3600_000);
  return {
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    mi: d.getUTCMinutes(),
    dow: DOW[d.getUTCDay()],
  };
}

const hhmm = (ms: number) => {
  const p = jst(ms);
  return `${p.h}:${String(p.mi).padStart(2, "0")}`;
};

const dayLabel = (ms: number) => {
  const p = jst(ms);
  return `${p.m}/${p.d}(${p.dow})`;
};

function dueLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dow = DOW[new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)).getUTCDay()];
  return `${m}/${d}(${dow})まで`;
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/mock${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

function messageText(m: Message): string {
  if (m.type === "text") return m.text;
  return m.contents.body?.contents?.[0]?.text ?? m.altText;
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12l15-7-5 15-2.5-6.5L4 12z" fill="currentColor" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Avatar({ userId, name, bot }: { userId: string | null; name: string; bot?: boolean }) {
  if (bot) {
    return (
      <div className="avatar bot" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M6 8h12M6 12h12M6 16h7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  return (
    <div className="avatar" style={{ background: AVATAR_COLORS[userId ?? ""] ?? "#94a3b8" }} aria-hidden="true">
      {name.slice(0, 1)}
    </div>
  );
}

function renderText(text: string, botName: string) {
  const mention = `@${botName}`;
  if (!text.startsWith(mention)) return text;
  return (
    <>
      <span className="mention">{mention}</span>
      {text.slice(mention.length)}
    </>
  );
}

function App() {
  const [chat, setChat] = useState<ChatKind>("dm");
  const [speaker, setSpeaker] = useState(ME);
  const [state, setState] = useState<MockState | null>(null);
  const [input, setInput] = useState("");
  const [mention, setMention] = useState(false);
  const [quote, setQuote] = useState<TimelineItem | null>(null);
  const [tab, setTab] = useState<"tasks" | "reminders">("reminders");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const viewer = chat === "group" ? speaker : ME;

  const refresh = useCallback(async () => {
    const s = await api<MockState>(`/state?chat=${chat}&user=${viewer}`);
    setState(s);
  }, [chat, viewer]);

  useEffect(() => {
    void api("/init", {}).then(refresh);
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const count = state?.timeline.length ?? 0;
  useEffect(() => {
    const el = timelineRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count, chat]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const names = useMemo(() => new Map(state?.users.map((u) => [u.userId, u.name]) ?? []), [state]);

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch {
      setToast("うまく送れませんでした。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  };

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    // 送った時点で入力欄を空にする（送信中に次の文を打っても消えないように）
    const q = quote;
    const withMention = chat === "group" && mention;
    setInput("");
    setQuote(null);
    setMention(false);
    void run(async () => {
      try {
        await api("/send", { chat, userId: speaker, text: t, mention: withMention, quotedId: q?.id });
      } catch (e) {
        setInput(t);
        throw e;
      }
    });
  };

  const press = (data: string, label: string) => {
    void run(() => api("/postback", { chat, userId: speaker, data, label }));
  };

  const advance = (body: { minutes?: number; toNext?: boolean }) => {
    void run(async () => {
      const r = await api<{ sent: number }>("/clock", body);
      setToast(r.sent > 0 ? `${r.sent}件のお知らせが届きました` : "時間を進めました");
    });
  };

  const reset = () => {
    void run(async () => {
      await api("/reset", {});
      await api("/init", {});
    });
  };

  const timeline = state?.timeline ?? [];
  const lastBot = [...timeline].reverse().find((t) => t.sender === "bot");
  const lastItem = timeline.at(-1);
  const quick = lastItem && lastItem.sender === "bot" ? (lastItem.message.quickReply?.items ?? []) : [];
  const answered = new Set<string>();
  // ボタンは最新のメッセージ以外は押せない見た目にする（LINE と同じく押すこと自体はできる）
  timeline.forEach((t) => {
    if (t !== lastBot && t.sender === "bot") answered.add(t.id);
  });

  const byId = new Map(timeline.map((t) => [t.id, t]));
  let lastDay = "";

  return (
    <div className="layout">
      <div className="intro">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M6 8h12M6 12h12M6 16h7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            ことづて
            <small>お試し画面（LINE につなぐ前の確認用）</small>
          </div>
        </div>
        <div className="segmented" role="group" aria-label="トークを選ぶ">
          <button aria-pressed={chat === "dm"} onClick={() => setChat("dm")}>
            1対1のトーク
          </button>
          <button aria-pressed={chat === "group"} onClick={() => setChat("group")}>
            グループ
          </button>
        </div>
      </div>

      <section className="phone" aria-label="トーク画面">
        <header className="chat-header">
          <div className="chat-title">
            {state?.chat.name ?? ""}
            {chat === "group" && <span>({state?.users.length ?? 3})</span>}
          </div>
          <button className="icon-btn" aria-label="一覧へ移動" onClick={() => document.getElementById("panel")?.scrollIntoView({ behavior: "smooth" })}>
            <ListIcon />
          </button>
        </header>

        <div className="timeline" ref={timelineRef} aria-live="polite">
          {timeline.map((item) => {
            const isMe = item.sender === "user" && item.userId === viewer;
            const isBot = item.sender === "bot";
            const name = isBot ? (state?.botName ?? "") : (names.get(item.userId ?? "") ?? "");
            const day = dayLabel(item.at);
            const sep = day !== lastDay ? <div className="day-sep">{day}</div> : null;
            lastDay = day;
            const quoted = item.quotedId ? byId.get(item.quotedId) : undefined;
            const m = item.message;
            return (
              <div key={item.id} style={{ display: "contents" }}>
                {sep}
                <div className={`row${isMe ? " me" : ""}`}>
                  {!isMe && <Avatar userId={item.userId} name={name} bot={isBot} />}
                  <div className="msg-col">
                    {!isMe && (chat === "group" || isBot) && <div className="sender">{name}</div>}
                    <div className="bubble-wrap">
                      {m.type === "flex" ? (
                        <div className="card">
                          <div className="card-body">{messageText(m)}</div>
                          <div className="card-actions">
                            {(m.contents.footer?.contents ?? []).map((b) => (
                              <button
                                key={b.action.data}
                                className={b.style === "primary" ? "primary" : ""}
                                disabled={busy || answered.has(item.id)}
                                onClick={() => press(b.action.data, b.action.label)}
                              >
                                {b.action.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="bubble">
                          {quoted && <div className="quote">{messageText(quoted.message)}</div>}
                          {renderText(m.text, state?.botName ?? "")}
                        </div>
                      )}
                      <div className="meta">
                        {isBot && chat === "group" && (
                          <button className="reply-link" onClick={() => { setQuote(item); inputRef.current?.focus(); }}>
                            返信
                          </button>
                        )}
                        {!isBot && !isMe && (
                          <button className="reply-link" onClick={() => { setQuote(item); inputRef.current?.focus(); }}>
                            返信
                          </button>
                        )}
                        <span>{hhmm(item.at)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {quick.length > 0 && (
          <div className="quick" role="group" aria-label="すぐに返せる候補">
            {quick.map((q) => (
              <button key={q.action.data} disabled={busy} onClick={() => press(q.action.data, q.action.displayText ?? q.action.label)}>
                {q.action.label}
              </button>
            ))}
          </div>
        )}

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          {quote && (
            <div className="quoting">
              <span>返信先：{messageText(quote.message)}</span>
              <button type="button" className="icon-btn" aria-label="返信をやめる" onClick={() => setQuote(null)}>
                ×
              </button>
            </div>
          )}
          <div className="examples" aria-label="話しかけ方の例">
            {EXAMPLES[chat].map((ex) => (
              <button type="button" key={ex} onClick={() => { setInput(ex); inputRef.current?.focus(); }}>
                {ex}
              </button>
            ))}
          </div>
          <div className="composer-row">
            {chat === "group" && (
              <>
                <label className="sr-only" htmlFor="speaker">
                  話す人
                </label>
                <select id="speaker" className="speaker" value={speaker} onChange={(e) => setSpeaker(e.target.value)}>
                  {state?.users.map((u) => (
                    <option key={u.userId} value={u.userId}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="toggle" aria-pressed={mention} onClick={() => setMention((v) => !v)} title={`@${state?.botName ?? ""} をつける`}>
                  @{state?.botName ?? ""}
                </button>
              </>
            )}
            <label className="sr-only" htmlFor="message">
              メッセージ
            </label>
            <input
              id="message"
              ref={inputRef}
              type="text"
              autoComplete="off"
              placeholder="メッセージを入力"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button className="send" type="submit" disabled={busy || !input.trim()} aria-label="送信">
              <SendIcon />
            </button>
          </div>
        </form>
      </section>

      <aside className="panel" id="panel" aria-label="一覧">
        <div className="panel-head">
          <h2>{chat === "group" ? "このグループの一覧" : "あなたの一覧"}</h2>
          <p>LINE ミニアプリで開く一覧画面のイメージです。</p>
        </div>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "reminders"} onClick={() => setTab("reminders")}>
            お知らせ {state?.reminders.length ? `(${state.reminders.length})` : ""}
          </button>
          <button role="tab" aria-selected={tab === "tasks"} onClick={() => setTab("tasks")}>
            やること {state?.tasks.length ? `(${state.tasks.length})` : ""}
          </button>
        </div>
        {tab === "reminders" ? (
          state?.reminders.length ? (
            <ul className="list" data-testid="reminder-list">
              {state.reminders.map((r) => (
                <li key={r.id}>
                  <span className="when-badge">{hhmm(r.fireAt)}</span>
                  <div className="main">
                    <div className="title">{r.content || "お知らせ"}</div>
                    <div className="sub">
                      {dayLabel(r.fireAt)}・{r.kind === "broadcast" ? "グループへ送信" : r.toSelf && chat === "group" ? "あなただけに" : "お知らせ"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">予定しているお知らせはありません</div>
          )
        ) : state?.tasks.length ? (
          <ul className="list" data-testid="task-list">
            {state.tasks.map((t) => (
              <li key={t.id}>
                <span className="check" aria-hidden="true" />
                <div className="main">
                  <div className="title">{t.title}</div>
                  <div className="sub">
                    {[t.assignee ? `${t.assignee}さん` : null, t.dueDate ? dueLabel(t.dueDate) : null].filter(Boolean).join("・") || "担当・期限なし"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">まだ終わっていないことはありません</div>
        )}

        <div className="clock">
          <div className="clock-now">
            <strong>{state ? `${dayLabel(state.now)} ${hhmm(state.now)}` : ""}</strong>
            <span>お試し用の時計</span>
          </div>
          <div className="clock-actions">
            <button onClick={() => advance({ minutes: 60 })} disabled={busy}>
              1時間進める
            </button>
            <button onClick={() => advance({ minutes: 60 * 24 })} disabled={busy}>
              1日進める
            </button>
            <button className="accent" onClick={() => advance({ toNext: true })} disabled={busy || !state?.nextReminderAt}>
              次のお知らせまで進める
            </button>
          </div>
        </div>
        <p className="note">
          時計を進めると、時間になったお知らせが届きます。
          <br />
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={reset} disabled={busy}>
            最初からやり直す
          </button>
        </p>
      </aside>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
