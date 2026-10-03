// 管理画面 API。返すのは件数の集計だけ（トーク本文・名前・LINE の ID は返さない）。
// このファイルから store/repo・executor・line・llm を import することは eslint で禁止している。

import { Hono } from "hono";
import type { AppEnv } from "../app";
import { loadConfig } from "../config";
import { readAdminSummary } from "../metrics/metrics";

const MOCK_ADMIN_PASSWORD = "mock-admin";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function adminRoutes() {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    const config = loadConfig(c.var.env);
    const password = config.adminPassword || (config.mockMode ? MOCK_ADMIN_PASSWORD : "");
    if (!password) return c.json({ message: "not found" }, 404);
    const header = c.req.header("authorization") ?? "";
    const m = /^Basic\s+(.+)$/i.exec(header);
    let given = "";
    if (m?.[1]) {
      try {
        given = atob(m[1]).split(":").slice(1).join(":");
      } catch {
        given = "";
      }
    }
    if (!safeEqual(given, password)) return c.json({ message: "unauthorized" }, 401);
    c.header("Cache-Control", "no-store");
    await next();
  });

  app.get("/summary", async (c) => {
    const config = loadConfig(c.var.env);
    const summary = await readAdminSummary(c.var.db, Date.now(), config.monthlyLimit);
    return c.json(summary);
  });

  return app;
}
