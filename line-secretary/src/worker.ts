// Cloudflare Workers のエントリ（無料枠：Workers + D1 + Cron Trigger）

import { createApp } from "./app";
import { buildDeps } from "./build-deps";
import { runScheduler } from "./executor/scheduler";
import { d1Db } from "./store/d1";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  [key: string]: unknown;
}

const app = createApp((_req, c) => {
  const ctx = c as { env: Env; executionCtx: ExecutionContext };
  const db = d1Db(ctx.env.DB);
  return {
    env: ctx.env,
    db,
    buildDeps: () => buildDeps(ctx.env, db),
    defer: (p) => ctx.executionCtx.waitUntil(p),
  };
});

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const deps = await buildDeps(env, d1Db(env.DB));
    ctx.waitUntil(runScheduler(deps));
  },
} satisfies ExportedHandler<Env>;
