// 環境変数の読み込み。秘密情報（Channel Secret / アクセストークン / API キー）はサーバー側だけで使い、画面には出さない。

export interface AppConfig {
  mockMode: boolean;
  channelSecret: string;
  accessToken: string;
  encryptionKey: string;
  retentionHours: number;
  monthlyLimit: number;
  llmProvider: "none" | "gemini";
  geminiApiKey: string;
  geminiModel: string;
  botName: string;
  adminPassword: string;
}

export type EnvLike = Record<string, unknown>;

function s(env: EnvLike, key: string, fallback = ""): string {
  const v = env[key];
  return typeof v === "string" ? v : fallback;
}

function n(env: EnvLike, key: string, fallback: number): number {
  const v = Number(s(env, key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function loadConfig(env: EnvLike): AppConfig {
  const llm = s(env, "LLM_PROVIDER", "none");
  return {
    mockMode: s(env, "MOCK_MODE") === "1",
    channelSecret: s(env, "LINE_CHANNEL_SECRET"),
    accessToken: s(env, "LINE_CHANNEL_ACCESS_TOKEN"),
    encryptionKey: s(env, "ENCRYPTION_KEY"),
    retentionHours: n(env, "MESSAGE_RETENTION_HOURS", 72),
    monthlyLimit: n(env, "MONTHLY_MESSAGE_LIMIT", 200),
    llmProvider: llm === "gemini" ? "gemini" : "none",
    geminiApiKey: s(env, "GEMINI_API_KEY"),
    geminiModel: s(env, "GEMINI_MODEL", "gemini-3.1-flash-lite"),
    botName: s(env, "BOT_NAME", "ことづて"),
    adminPassword: s(env, "ADMIN_PASSWORD"),
  };
}
