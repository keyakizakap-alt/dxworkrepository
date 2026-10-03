// Gemini API（無料枠あり）。モデル名は環境変数 GEMINI_MODEL で変更できる。
// 注意: 無料枠では入力内容が Google の製品改善に使われる場合がある（README 参照）。

import type { LlmProvider } from "./provider";

export function geminiProvider(apiKey: string, model: string): LlmProvider {
  return {
    name: `gemini:${model}`,
    async generateJson(system, user) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 1024 },
          }),
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const out = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      return JSON.parse(out) as unknown;
    },
  };
}
