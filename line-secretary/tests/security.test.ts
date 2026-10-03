import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { buildDeps } from "../src/build-deps";
import { signForTest, verifySignature } from "../src/line/signature";
import { createPseudonymizer } from "../src/llm/provider";
import { randomKeyBase64 } from "../src/store/crypto";
import { migrate, nodeSqliteDb } from "../src/store/node-sqlite";

describe("署名検証", () => {
  it("正しい署名だけ通す", async () => {
    const body = '{"events":[]}';
    const sig = await signForTest(body, "secret");
    expect(await verifySignature(body, sig, "secret")).toBe(true);
    expect(await verifySignature(body, sig, "other")).toBe(false);
    expect(await verifySignature(body + " ", sig, "secret")).toBe(false);
    expect(await verifySignature(body, null, "secret")).toBe(false);
  });

  it("Webhook は署名が無い・違うと 401", async () => {
    const db = nodeSqliteDb();
    await migrate(db);
    const env = { LINE_CHANNEL_SECRET: "secret", LINE_CHANNEL_ACCESS_TOKEN: "x", ENCRYPTION_KEY: randomKeyBase64() };
    const app = createApp(() => ({ env, db, buildDeps: () => buildDeps(env, db), defer: () => undefined }));
    const body = JSON.stringify({ destination: "x", events: [] });
    const bad = await app.request("/webhook", { method: "POST", body, headers: { "x-line-signature": "nope" } });
    expect(bad.status).toBe(401);
    const good = await app.request("/webhook", {
      method: "POST",
      body,
      headers: { "x-line-signature": await signForTest(body, "secret") },
    });
    expect(good.status).toBe(200);
  });

  it("本番設定では Mock API は使えない", async () => {
    const db = nodeSqliteDb();
    await migrate(db);
    const env = { ENCRYPTION_KEY: randomKeyBase64() };
    const app = createApp(() => ({ env, db, buildDeps: () => buildDeps(env, db), defer: () => undefined }));
    const r = await app.request("/api/mock/state");
    expect(r.status).toBe(404);
  });
});

describe("管理画面", () => {
  it("パスワードが無いと見られず、見られるのは件数だけ", async () => {
    const db = nodeSqliteDb();
    await migrate(db);
    const env = { ENCRYPTION_KEY: randomKeyBase64(), ADMIN_PASSWORD: "pw" };
    const app = createApp(() => ({ env, db, buildDeps: () => buildDeps(env, db), defer: () => undefined }));
    await db.run("INSERT INTO chats (id, type, store_messages, created_at) VALUES ('Cxxx', 'group', 1, 0)");
    expect((await app.request("/api/admin/summary")).status).toBe(401);
    const r = await app.request("/api/admin/summary", { headers: { authorization: `Basic ${btoa("admin:pw")}` } });
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).not.toContain("Cxxx");
    expect(JSON.parse(body).chats.groups).toBe(1);
  });
});

describe("LLM に送る前の置き換え", () => {
  it("名前・電話番号・メールを伏せ、戻せる", () => {
    const p = createPseudonymizer(["田中", "凌吾"]);
    const masked = p.mask("田中さんに090-1234-5678かa@b.jpで凌吾が連絡");
    expect(masked).not.toMatch(/田中|凌吾|090|a@b/);
    expect(p.unmask("人物Aさんが予約")).toMatch(/(田中|凌吾)さんが予約/);
  });
});
