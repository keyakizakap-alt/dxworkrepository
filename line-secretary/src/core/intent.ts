// 普通の日本語から「何をしたいか」をルールで読み取る（LLM を使わない経路）。
// ここで決めるのは意図と中身だけ。実行（DB 書き込み・送信）は Executor が行う。

import { parseDateTime, removeSpans, type DateTimeParse } from "./datetime";
import { trimTail } from "./normalize";

export interface AssigneeRef {
  name: string;
  /** 「俺」「私」など、発言者自身 */
  self: boolean;
}

export type Intent =
  | {
      kind: "create_reminder";
      content: string | null;
      dt: DateTimeParse;
      /** here = 依頼されたトーク, self = 依頼者に個別 */
      target: "here" | "self";
    }
  | { kind: "schedule_group_message"; content: string | null; dt: DateTimeParse }
  | {
      kind: "create_task";
      title: string | null;
      assignee: AssigneeRef | null;
      dt: DateTimeParse;
    }
  | { kind: "assign_task"; assignee: AssigneeRef }
  | { kind: "complete_task"; hint: string | null }
  | { kind: "list_tasks" }
  | { kind: "list_reminders" }
  | { kind: "delete_reminder"; hint: string | null }
  | {
      kind: "repeat_reminder";
      dt: DateTimeParse;
      /** 「来週もう一回」→ 元の時刻から 1 週間後 */
      weekShift: number;
    }
  | { kind: "summarize" }
  | { kind: "extract_tasks" }
  | { kind: "stop_storing" }
  | { kind: "resume_storing" }
  | { kind: "help" }
  | { kind: "unknown" };

export type IntentKind = Intent["kind"];

export interface RuleResult {
  intent: Intent;
  /** グループでメンションなしでも「ボットへの依頼」とみなせるか */
  strong: boolean;
}

const SELF_WORDS = /^(俺|おれ|私|わたし|あたし|僕|ぼく|自分|うち)$/;
const HONORIFIC = "(?:さん|くん|君|ちゃん|様|さま)";
const DEMONSTRATIVE = /^(これ|それ|あれ|この件|その件|さっきの|今の)(を|は|も)?$/;

const NOTIFY_VERB =
  /(お知らせして|知らせて|しらせて|教えて|おしえて|リマインドして|リマインド|通知して|声かけて|声掛けて|起こして|連絡して|言って)(ください|くれる|くれない|ほしい|欲しい|ね|よ|な)?[?？]?$/;
const GROUP_TARGET = /(みんな|全員|皆|みなさん|グループ|このグループ)(に|へ)(も)?/;
const SELF_TARGET = /(自分|私|俺|僕|わたし)(だけ)?(に|へ)(だけ)?|個人的に|個別に/;

function politeContent(s: string): string {
  const t = trimTail(s);
  if (!t) return t;
  if (/(です|ます|ください|下さい|よ|ね|な|ぞ|ぜ|う|た|だ|[!！?？。♪])$/.test(t)) return t;
  return `${t}です`;
}

/** 「ホテルの予約」→「ホテル予約」のように、やることの名前を短く整える */
export function tidyTitle(s: string): string {
  let t = trimTail(s)
    .replace(/^(これ|それ|あれ)(を|は|も)?\s*/, "")
    .replace(/(を|は|の件|の件は|も)$/, "")
    .replace(/(する|やる|して|しといて|しておいて)$/, "")
    .trim();
  t = t.replace(
    /^(.+?)の(予約|確認|準備|手配|連絡|購入|申し込み|申込|支払い|支払|買い出し|片付け|掃除|作成|提出|返却|返信|予約確認)$/,
    "$1$2",
  );
  return t;
}

function stripLeadingParticles(s: string): string {
  return s.replace(/^[\s、,。]*(の|に|は|を|で|から)?[\s、,]*/, "").trim();
}

function parseAssignee(text: string): { assignee: AssigneeRef | null; rest: string } {
  const patterns: RegExp[] = [
    new RegExp(`([^\\s、,。]{1,10}?)${HONORIFIC}?(が|の)?担当(で|に|は|として)?(して|する|お願い)?`),
    new RegExp(`担当(は|を)?([^\\s、,。]{1,10}?)${HONORIFIC}`),
    new RegExp(`([^\\s、,。]{1,10}?)${HONORIFIC}に(お願い|頼む|頼んで|任せ)`),
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const raw = (re === patterns[1] ? m[2] : m[1]) ?? "";
    const name = raw.replace(/^(は|を|、)/, "").trim();
    if (!name) continue;
    const rest = (text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)).trim();
    return { assignee: { name, self: SELF_WORDS.test(name) }, rest };
  }
  const selfDo = /(俺|おれ|私|わたし|僕|ぼく|自分)が(やる|やります|する|します|予約する|対応する)/.exec(text);
  if (selfDo) {
    return {
      assignee: { name: selfDo[1] ?? "", self: true },
      rest: text.replace(selfDo[0], " ").trim(),
    };
  }
  return { assignee: null, rest: text };
}

export function parseIntent(text: string, now: number): RuleResult {
  const t = text.trim();
  const dt = parseDateTime(t, now);

  // ---- 会話の保存の設定 ----
  if (/(会話|トーク|発言)の?(保存|記録)(を|は)?(やめて|止めて|しないで|オフ|いらない|停止)/.test(t)) {
    return { intent: { kind: "stop_storing" }, strong: true };
  }
  if (/(会話|トーク|発言)の?(保存|記録)(を|は)?(再開|してい|オン|して)/.test(t)) {
    return { intent: { kind: "resume_storing" }, strong: true };
  }

  // ---- 使い方 ----
  if (/^(使い方|つかいかた|ヘルプ|help|何ができる|なにができる|できること)/i.test(t)) {
    return { intent: { kind: "help" }, strong: false };
  }

  // ---- 一覧 ----
  if (
    /(リマインド|リマインダー|お知らせ|通知|予約送信|送信予定)(の)?(一覧|リスト|予定|ある|見せ|確認|何|なに)/.test(t) ||
    /(何|なに)(を|か)?(お知らせ|リマインド)(する|される|予定)/.test(t)
  ) {
    return { intent: { kind: "list_reminders" }, strong: true };
  }
  if (
    /(終わって|おわって|済んで|すんで|やって|できて)(い)?ない(こと|もの|タスク|の|やつ)/.test(t) ||
    /(やること|タスク|TODO|todo|ToDo)(の)?(一覧|リスト|ある|は[?？]|見せ|教えて|何|なに|確認|どう)/.test(t) ||
    /残って(る|いる)(こと|タスク|やつ)/.test(t)
  ) {
    return { intent: { kind: "list_tasks" }, strong: true };
  }

  // ---- 会話からやること抽出 / まとめ ----
  if (
    /(やること|タスク|TODO|todo)(に|として|を)?(まとめ|抜き出|洗い出|拾っ|拾い|整理|出して)/.test(t) ||
    /(この話|今の話|さっきの話|この会話|今の会話).*(やること|タスク)/.test(t)
  ) {
    return { intent: { kind: "extract_tasks" }, strong: true };
  }
  if (
    /(決まった|決めた|決定した|決まってる)(こと|事|内容|もの)/.test(t) ||
    /(話|会話|内容|今日|きょう|ここまで)(を)?(まとめて|要約)/.test(t) ||
    /^(まとめて|要約して)/.test(t)
  ) {
    return { intent: { kind: "summarize" }, strong: true };
  }

  // ---- リマインダー削除 / もう一回 ----
  const del = /^(.*?)(リマインド|リマインダー|お知らせ|通知|予約|教えて(もらう|くれる)の|知らせる(の|やつ))(は|を|も)?(.*?)(消して|削除|取り消|キャンセル|やめて|いらない|なしで|止めて|とめて)/.exec(t);
  if (del || /^(さっきの|前の|この)(やつ)?(を|は)?(消して|取り消して|キャンセル)/.test(t)) {
    const hint = del ? tidyTitle((del[1] ?? "").replace(/^(さっき|前|この|その)の?/, "").replace(/の$/, "")) : "";
    return { intent: { kind: "delete_reminder", hint: hint || null }, strong: true };
  }
  if (/(もう一回|もう一度|もういっかい|もう1回|もう1度|また)(教えて|知らせて|お知らせ|リマインド|通知)/.test(t)) {
    const weekShift = /再来週(?!の?[日月火水木金土]曜)/.test(t) ? 2 : /来週(?!の?[日月火水木金土]曜)/.test(t) ? 1 : 0;
    return { intent: { kind: "repeat_reminder", dt, weekShift }, strong: true };
  }

  // ---- 完了 ----
  const done = /^(.*?)(終わった|終わりました|おわった|終わったよ|完了|済んだ|すんだ|済みました|済み|できた|できました|やっといた|やっておいた|やりました|done)[!！。よー〜]*$/i.exec(t);
  if (done) {
    const hint = tidyTitle((done[1] ?? "").replace(/(も|は|が|、)$/, ""));
    const isDemonstrative = !hint || DEMONSTRATIVE.test(hint);
    return { intent: { kind: "complete_task", hint: isDemonstrative ? null : hint }, strong: false };
  }

  // ---- グループへの予約送信 ----
  const groupMatch = GROUP_TARGET.exec(t);
  if (groupMatch && /(知らせて|しらせて|送って|伝えて|連絡して|言って|流して|お知らせして|通知して|アナウンス)/.test(t)) {
    const pre = t.slice(0, groupMatch.index).trim();
    let schedulePart = "";
    let content: string;
    const quoted = /^(.*?)[「『](.+)[」』](って|と)?$/.exec(pre);
    const tte = /^(.*)(って|(?<!こ)と)(を)?$/.exec(pre);
    if (quoted) {
      schedulePart = quoted[1] ?? "";
      content = quoted[2] ?? "";
    } else if (tte) {
      const body = tte[1] ?? "";
      const comma = body.search(/[、,]/);
      if (comma > 0 && parseDateTime(body.slice(0, comma), now).spans.length > 0) {
        schedulePart = body.slice(0, comma);
        content = body.slice(comma + 1);
      } else {
        const lead = /^((?:[^、,]*?)(?:\d{1,2}時(?:半|\d{1,2}分)?|\d{1,2}:\d{2}|朝|夜|夕方|昼))に/.exec(body);
        if (lead) {
          schedulePart = lead[1] ?? "";
          content = body.slice(lead[0].length);
        } else {
          content = body;
        }
      }
    } else {
      const p = parseDateTime(pre, now);
      schedulePart = pre;
      const rest = stripLeadingParticles(removeSpans(pre, p.spans));
      const koto = /^(.+?)の(こと|件|話)(を)?$/.exec(rest);
      content = koto ? `${koto[1]}の確認` : rest.replace(/(を)$/, "");
    }
    const sdt = parseDateTime(schedulePart, now);
    content = politeContent(stripLeadingParticles(content).trim());
    if (DEMONSTRATIVE.test(content.replace(/です$/, ""))) content = "";
    return { intent: { kind: "schedule_group_message", content: content || null, dt: sdt }, strong: true };
  }

  // ---- 担当だけ変える（「田中さん担当にして」）----
  const assignOnly = new RegExp(
    `^([^\\s、,。]{1,10}?)${HONORIFIC}?(が|を|の)?担当(に|で)?(して|する|お願い|で)?(ください|ね)?[。!！]*$`,
  ).exec(t);
  if (assignOnly && !dt.date) {
    const name = assignOnly[1] ?? "";
    return { intent: { kind: "assign_task", assignee: { name, self: SELF_WORDS.test(name) } }, strong: true };
  }

  // ---- リマインダー ----
  const notify = NOTIFY_VERB.exec(t);
  const isQuestion = /(何|なに|いつ|どこ|どう|誰|だれ|どれ|なんで|なぜ)/.test(t) && !dt.date && !dt.time;
  if (notify && !isQuestion && (dt.date || dt.time || dt.relativeMs || dt.vague || /リマインド/.test(t) || /(って|と)$/.test(t.slice(0, notify.index)))) {
    const selfTarget = SELF_TARGET.exec(t);
    let body = t.slice(0, notify.index);
    if (selfTarget && selfTarget.index < notify.index) {
      body = body.slice(0, selfTarget.index) + " " + body.slice(selfTarget.index + selfTarget[0].length);
    }
    const bodyDt = parseDateTime(body, now);
    let content = stripLeadingParticles(removeSpans(body, bodyDt.spans))
      .replace(/(って|と|のこと(を)?|の件(を)?|を)$/, "")
      .trim();
    content = trimTail(content);
    if (!content || DEMONSTRATIVE.test(content)) content = "";
    return {
      intent: {
        kind: "create_reminder",
        content: content || null,
        dt,
        target: selfTarget ? "self" : "here",
      },
      strong: true,
    };
  }

  // ---- やること ----
  const taskCue =
    /(タスク|やること|TODO|todo|ToDo)(に|へ|として)(して|追加|入れて|登録|する)|覚えといて|覚えておいて|覚えてて|メモして|メモっといて|メモしといて|担当|お願い(します|ね|!|！)?$|頼む$|やっといて$/;
  if (taskCue.test(t)) {
    const strong = /(タスク|やること|TODO|todo|ToDo|覚えといて|覚えておいて|覚えてて|メモ|担当)/.test(t);
    const { assignee, rest } = parseAssignee(t);
    const restDt = parseDateTime(rest, now);
    let titleSource = removeSpans(rest, restDt.spans);
    titleSource = titleSource
      .replace(/(タスク|やること|TODO|todo|ToDo)(に|へ|として)(して|追加|入れて|登録|する).*$/, "")
      .replace(/(覚えといて|覚えておいて|覚えてて|メモして|メモっといて|メモしといて|お願い(します|ね)?|頼む|やっといて).*$/, "")
      .replace(/[、,]\s*$/, "");
    const firstClause = titleSource.split(/[、,]/)[0] ?? "";
    let title = tidyTitle(stripLeadingParticles(firstClause));
    if (!title || DEMONSTRATIVE.test(title)) title = "";
    return {
      intent: { kind: "create_task", title: title || null, assignee, dt },
      strong,
    };
  }

  // 「自分だけに知らせて」「明日教えて」など、中身が書かれていないリマインダー
  if (notify && !isQuestion) {
    const self = SELF_TARGET.test(t);
    return {
      intent: { kind: "create_reminder", content: null, dt, target: self ? "self" : "here" },
      strong: self,
    };
  }

  return { intent: { kind: "unknown" }, strong: false };
}
