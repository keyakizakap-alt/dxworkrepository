// 入力ゆれの吸収：全角→半角、漢数字→算用数字、記号の統一など

const KANJI_DIGIT: Record<string, number> = {
  〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

function kanjiToNumber(s: string): number | null {
  // 「十」「二十三」「十一」程度（時刻・日付に必要な範囲）だけ扱う
  let total = 0;
  let current = 0;
  for (const ch of s) {
    if (ch === "十") {
      total += (current || 1) * 10;
      current = 0;
    } else if (ch in KANJI_DIGIT) {
      current = KANJI_DIGIT[ch] ?? 0;
    } else {
      return null;
    }
  }
  return total + current;
}

// 「八時」「十一月八日」「三十分」「二日後」のように単位の直前にある漢数字だけを変換する
// （「一緒」「一回」などは変換しない）
const KANJI_NUM_BEFORE_UNIT = /([〇零一二三四五六七八九十]+)(?=時(?!的|期|々)|月|日|分|週間|人)/g;

export function normalizeText(input: string): string {
  let s = input.normalize("NFKC");
  s = s.replace(KANJI_NUM_BEFORE_UNIT, (m) => {
    const n = kanjiToNumber(m);
    return n === null ? m : String(n);
  });
  s = s
    .replace(/[〜~]/g, "〜")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

/** メンション部分（@ことづて など）を取り除く */
export function stripMention(text: string, ranges: Array<{ index: number; length: number }>): string {
  const sorted = [...ranges].sort((a, b) => b.index - a.index);
  let s = text;
  for (const r of sorted) {
    s = s.slice(0, r.index) + s.slice(r.index + r.length);
  }
  return s.trim();
}

/** 文末の句読点や「ね」「よ」を落とす */
export function trimTail(s: string): string {
  return s.replace(/[\s、。,.!！?？]+$/u, "").trim();
}
