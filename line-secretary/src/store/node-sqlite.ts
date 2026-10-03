// Mock Mode とテスト用。Node 22.5+ の組み込み SQLite を使う（追加のネイティブモジュール不要）
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SqlDb, SqlValue } from "./sql";

export function nodeSqliteDb(path = ":memory:"): SqlDb {
  const db = new DatabaseSync(path);
  return {
    async all<T>(sql: string, params: SqlValue[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async first<T>(sql: string, params: SqlValue[] = []) {
      return (db.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async run(sql: string, params: SqlValue[] = []) {
      const r = db.prepare(sql).run(...params);
      return { changes: Number(r.changes) };
    },
    async exec(sql: string) {
      db.exec(sql);
    },
  };
}

export async function migrate(db: SqlDb, dir = join(import.meta.dirname, "../../migrations")): Promise<void> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    await db.exec(readFileSync(join(dir, f), "utf8"));
  }
}
