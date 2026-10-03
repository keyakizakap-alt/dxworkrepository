// D1（本番）と node:sqlite（Mock・テスト）の両方で同じ SQL を動かすための最小インターフェース

export type SqlValue = string | number | null;

export interface SqlDb {
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  /** マイグレーション用：複数文をまとめて実行 */
  exec(sql: string): Promise<void>;
}
