import { loadConfig, type EnvLike } from "./config";
import type { Deps } from "./executor/deps";
import { httpLineClient } from "./line/client";
import { mockLineClient } from "./line/mock-client";
import { geminiProvider } from "./llm/gemini";
import { Metrics } from "./metrics/metrics";
import { createCipher, type Cipher } from "./store/crypto";
import { Repo } from "./store/repo";
import type { SqlDb } from "./store/sql";

export const MOCK_CLOCK_KEY = "mock_clock_offset";

const cipherCache = new Map<string, Promise<Cipher>>();

export async function buildDeps(env: EnvLike, db: SqlDb): Promise<Deps> {
  const config = loadConfig(env);
  if (!config.encryptionKey) throw new Error("ENCRYPTION_KEY is not set");
  let cipher = cipherCache.get(config.encryptionKey);
  if (!cipher) {
    cipher = createCipher(config.encryptionKey);
    cipherCache.set(config.encryptionKey, cipher);
  }
  const repo = new Repo(db, await cipher);

  // Mock Mode では時計を進められる（リマインダーの発火確認用）
  let offset = 0;
  if (config.mockMode) offset = Number((await repo.getKv(MOCK_CLOCK_KEY)) ?? "0") || 0;
  const now = () => Date.now() + offset;

  const line = config.mockMode ? mockLineClient(db, now) : httpLineClient(config.accessToken);
  const llm =
    config.llmProvider === "gemini" && config.geminiApiKey ? geminiProvider(config.geminiApiKey, config.geminiModel) : null;
  return { config, repo, metrics: new Metrics(db), line, llm, now };
}
