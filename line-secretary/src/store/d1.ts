import type { SqlDb, SqlValue } from "./sql";

export function d1Db(db: D1Database): SqlDb {
  return {
    async all<T>(sql: string, params: SqlValue[] = []) {
      const r = await db.prepare(sql).bind(...params).all<T>();
      return r.results ?? [];
    },
    async first<T>(sql: string, params: SqlValue[] = []) {
      return (await db.prepare(sql).bind(...params).first<T>()) ?? null;
    },
    async run(sql: string, params: SqlValue[] = []) {
      const r = await db.prepare(sql).bind(...params).run();
      return { changes: r.meta.changes ?? 0 };
    },
    async exec(sql: string) {
      await db.exec(sql);
    },
  };
}
