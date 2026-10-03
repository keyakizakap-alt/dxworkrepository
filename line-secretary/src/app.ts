import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { adminRoutes } from "./admin/routes";
import type { EnvLike } from "./config";
import type { Deps } from "./executor/deps";
import { mockRoutes } from "./routes/mock";
import { webhookRoutes } from "./routes/webhook";
import type { SqlDb } from "./store/sql";

export type AppEnv = {
  Variables: {
    env: EnvLike;
    db: SqlDb;
    /** fresh=true で作り直す（Mock の時計を進めたあと） */
    getDeps: (fresh?: boolean) => Promise<Deps>;
    /** レスポンス後も処理を続ける（Workers: waitUntil / Node: そのまま待つ） */
    defer: (p: Promise<unknown>) => void;
  };
};

export interface Platform {
  env: EnvLike;
  db: SqlDb;
  buildDeps: () => Promise<Deps>;
  defer: (p: Promise<unknown>) => void;
}

export function createApp(platform: (req: Request, c: unknown) => Platform) {
  const app = new Hono<AppEnv>();

  app.use("*", secureHeaders());
  app.use("*", async (c, next) => {
    const p = platform(c.req.raw, c);
    let cached: Promise<Deps> | null = null;
    c.set("env", p.env);
    c.set("db", p.db);
    c.set("getDeps", (fresh = false) => {
      if (!cached || fresh) cached = p.buildDeps();
      return cached;
    });
    c.set("defer", p.defer);
    await next();
  });

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.route("/webhook", webhookRoutes());
  app.route("/api/mock", mockRoutes());
  app.route("/api/admin", adminRoutes());

  app.onError((err, c) => {
    console.error("request failed", err.name);
    return c.json({ message: "internal error" }, 500);
  });
  return app;
}
