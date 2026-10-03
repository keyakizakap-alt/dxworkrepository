// Mock Mode をローカルで動かすサーバー（LINE Developers の設定なしで試せる）
//   npm run build && npm run mock → http://localhost:8787

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { createApp } from "./app";
import { buildDeps } from "./build-deps";
import { runScheduler } from "./executor/scheduler";
import { randomKeyBase64 } from "./store/crypto";
import { migrate, nodeSqliteDb } from "./store/node-sqlite";

const env: Record<string, string> = {
  MOCK_MODE: "1",
  MESSAGE_RETENTION_HOURS: "72",
  MONTHLY_MESSAGE_LIMIT: "200",
  LLM_PROVIDER: "none",
  BOT_NAME: "ことづて",
  ...(Object.fromEntries(Object.entries(process.env).filter(([, v]) => typeof v === "string")) as Record<string, string>),
};
env.MOCK_MODE = "1";
if (!env.ENCRYPTION_KEY) env.ENCRYPTION_KEY = randomKeyBase64();

const db = nodeSqliteDb(process.env.MOCK_DB ?? ":memory:");
await migrate(db);

const api = createApp(() => ({
  env,
  db,
  buildDeps: () => buildDeps(env, db),
  defer: (p) => {
    void p;
  },
}));

const server = new Hono();
server.route("/", api);
server.use("/*", serveStatic({ root: "./dist/public" }));
server.get("/admin", serveStatic({ path: "./dist/public/admin.html" }));

// 本番の Cron Trigger と同じく、毎分お知らせを確認する
setInterval(() => {
  void buildDeps(env, db).then(runScheduler).catch(() => undefined);
}, 60_000);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: server.fetch, port });
console.log(`Mock Mode: http://localhost:${port}  （管理画面: /admin, パスワード: ${env.ADMIN_PASSWORD ? "設定済み" : "mock-admin"}）`);
