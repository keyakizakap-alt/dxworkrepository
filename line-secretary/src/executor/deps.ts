import type { AppConfig } from "../config";
import type { LineClient } from "../line/client";
import type { LlmProvider } from "../llm/provider";
import type { Metrics } from "../metrics/metrics";
import type { Repo } from "../store/repo";

export interface Deps {
  config: AppConfig;
  repo: Repo;
  metrics: Metrics;
  line: LineClient;
  llm: LlmProvider | null;
  now: () => number;
}
