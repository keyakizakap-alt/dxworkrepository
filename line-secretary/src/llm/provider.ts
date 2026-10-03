// LLM はユーザーの意図を「読み取る」だけ。API の実行はしない（Executor が行う）。
// 送る前に人名・電話番号・メールアドレスを置き換える。

export interface LlmProvider {
  readonly name: string;
  /** JSON を 1 つ返させる。壊れていたら例外 */
  generateJson(system: string, user: string): Promise<unknown>;
}

export interface Pseudonymizer {
  mask(text: string): string;
  unmask(text: string): string;
}

const LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function createPseudonymizer(names: string[]): Pseudonymizer {
  const unique = [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 0))].sort((a, b) => b.length - a.length);
  const pairs = unique.map((name, i) => ({ name, alias: `人物${LABELS[i % 26]}${i >= 26 ? i : ""}` }));
  return {
    mask(text) {
      let s = text
        .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[メール]")
        .replace(/https?:\/\/\S+/g, "[URL]")
        .replace(/0\d{1,4}-?\d{1,4}-?\d{3,4}/g, "[電話番号]");
      for (const p of pairs) s = s.split(p.name).join(p.alias);
      return s;
    },
    unmask(text) {
      let s = text;
      for (const p of [...pairs].reverse()) s = s.split(p.alias).join(p.name);
      return s;
    },
  };
}
