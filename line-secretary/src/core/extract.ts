// 会話から「決まったこと」「やること」を拾う。
// LLM が使えないとき（無料枠切れ・未設定・Mock）の簡易版。精度は LLM 版より低い。

import { parseDateTime, resolveDueDate } from "./datetime";
import { dateKey } from "./jst";
import { normalizeText, trimTail } from "./normalize";

export interface ConvLine {
  name: string;
  userId: string | null;
  text: string;
  at: number;
}

export interface ExtractedTask {
  title: string;
  assigneeName: string | null;
  assigneeUserId: string | null;
  dueDate: string | null;
}

export interface Summary {
  decisions: string[];
  todos: ExtractedTask[];
}

const ACTION =
  "(予約|確認|手配|準備|連絡|調べ|調査|購入|買い出し|支払い|申し込み|予約確認|取って|とって|買って|払って|探して|作って|送って)";
const SELF_DO = new RegExp(
  `(俺|おれ|私|わたし|あたし|僕|ぼく|自分|うち)が\\s*(?:(.{1,12}?)(?:を|は)?)?\\s*${ACTION}`,
);
const OTHER_DO = new RegExp(`([^\\s、,。]{1,8}?)(さん|くん|ちゃん)?が\\s*(?:(.{1,12}?)(?:を|は)?)?\\s*${ACTION}`);
const TOPIC = /^(.{1,12}?)(?:は|って|の件は)?\s*(どうする|どうしよう|どうします|決めよう|どこにする|どれにする|誰が|だれが|はどう|は[?？])/;

const ACTION_NOUN: Record<string, string> = {
  取って: "予約",
  とって: "予約",
  買って: "購入",
  払って: "支払い",
  探して: "探し",
  作って: "作成",
  送って: "送付",
  調べ: "調べ",
};

function topicBefore(lines: ConvLine[], i: number): string | null {
  for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
    const m = TOPIC.exec(normalizeText(lines[j]?.text ?? ""));
    if (m?.[1]) return m[1].replace(/(の|は)$/, "");
  }
  return null;
}

function dueAround(lines: ConvLine[], i: number, now: number): string | null {
  for (let j = i; j <= Math.min(lines.length - 1, i + 3); j++) {
    const t = normalizeText(lines[j]?.text ?? "");
    const p = parseDateTime(t, now);
    if (p.deadline || (j === i && p.date)) {
      const d = resolveDueDate(p, now);
      if (d) return dateKey(d);
    }
  }
  return null;
}

export function extractTasksOffline(lines: ConvLine[], now: number): ExtractedTask[] {
  const out: ExtractedTask[] = [];
  lines.forEach((line, i) => {
    const t = normalizeText(line.text);
    let assigneeName: string | null;
    let assigneeUserId: string | null = null;
    let object: string | undefined;
    let action: string | undefined;
    const self = SELF_DO.exec(t);
    if (self) {
      assigneeName = line.name;
      assigneeUserId = line.userId;
      object = self[2];
      action = self[3];
    } else {
      const other = OTHER_DO.exec(t);
      if (!other || /^(誰|だれ|何|なに)$/.test(other[1] ?? "")) return;
      assigneeName = other[1] ?? null;
      object = other[3];
      action = other[4];
    }
    if (!action) return;
    const noun = ACTION_NOUN[action] ?? action;
    const obj = (object ?? "").trim() || topicBefore(lines, i) || "";
    const title = `${obj}${noun}`.trim();
    if (!title || out.some((x) => x.title === title)) return;
    out.push({ title, assigneeName, assigneeUserId, dueDate: dueAround(lines, i, now) });
  });
  return out;
}

const DECISION =
  /(にしよう|に決定|で決まり|でいこう|で行こう|に決まった|で決定|にします|にする|でいい|でOK|でok|で大丈夫|に決めた|確定|やります|するよ|しとく|お願い)/;

export function summarizeOffline(lines: ConvLine[], now: number): Summary {
  const decisions: string[] = [];
  for (const line of lines) {
    const t = trimTail(normalizeText(line.text));
    if (!DECISION.test(t) || t.length > 60) continue;
    const s = t
      .replace(/(にしよう|でいこう|で行こう|に決定|で決まり|に決めた|で決定)(か|ね|よ)?$/, "")
      .replace(/(俺|おれ|私|わたし|僕|ぼく|自分)が/, `${line.name}さんが`)
      .replace(/(するよ|しとく|やります|します)(ね|よ)?$/, "する")
      .trim();
    if (s && !decisions.includes(s)) decisions.push(s);
  }
  return { decisions, todos: extractTasksOffline(lines, now) };
}
