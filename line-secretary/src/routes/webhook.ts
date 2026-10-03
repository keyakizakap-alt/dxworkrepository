import { Hono } from "hono";
import type { Deps } from "../executor/deps";
import { handleEvent } from "../executor/handler";
import { verifySignature } from "../line/signature";
import type { WebhookBody } from "../line/types";
import type { AppEnv } from "../app";

export function webhookRoutes() {
  const app = new Hono<AppEnv>();
  app.post("/", async (c) => {
    const deps: Deps = await c.var.getDeps();
    const raw = await c.req.text();
    const ok = await verifySignature(raw, c.req.header("x-line-signature"), deps.config.channelSecret);
    if (!ok) {
      await deps.metrics.inc("signature_failures", deps.now());
      return c.json({ message: "invalid signature" }, 401);
    }
    let body: WebhookBody;
    try {
      body = JSON.parse(raw) as WebhookBody;
    } catch {
      return c.json({ message: "bad request" }, 400);
    }
    // LINE には先に 200 を返し、処理は裏で続ける（Workers では waitUntil）
    const work = (async () => {
      for (const ev of body.events ?? []) {
        try {
          await handleEvent(deps, ev);
        } catch (e) {
          // 本文や ID はログに出さない
          console.error("event handling failed", ev.type, e instanceof Error ? e.name : "error");
        }
      }
    })();
    c.var.defer(work);
    return c.json({ ok: true });
  });
  return app;
}
