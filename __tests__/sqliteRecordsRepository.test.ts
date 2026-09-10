import { createSQLiteRecordsRepository } from '../services/persistence/sqliteRecordsRepository';
import type { RawRecord } from '../types';

function createFakeDatabase() {
  const tables = new Map<string, RawRecord>();
  const metadata = new Map<string, string>();
  const statements: string[] = [];
  const database = {
    async execAsync(sql: string) { statements.push(sql); },
    async runAsync(sql: string, ...params: unknown[]) {
      statements.push(sql);
      if (sql.startsWith('DELETE FROM records')) tables.clear();
      if (sql.startsWith('DELETE FROM metadata')) metadata.delete(String(params[0]));
      if (sql.includes('INSERT OR REPLACE INTO metadata')) metadata.set(String(params[0]), String(params[1]));
      if (sql.includes('INSERT OR REPLACE INTO records')) {
        const id = String(params[0]);
        tables.set(id, JSON.parse(String(params[7])) as RawRecord);
      }
      return { changes: 1, lastInsertRowId: 1 };
    },
    async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      if (sql.includes('FROM metadata')) {
        const value = metadata.get(String(params[0]));
        return value ? [{ value }] as T[] : [];
      }
      return Array.from(tables.entries()).map(([id, raw]) => ({ id, raw_json: JSON.stringify(raw) })) as T[];
    },
    async withTransactionAsync(task: () => Promise<void>) { await task(); },
  };
  return { database, statements };
}

const rows: RawRecord[] = [
  {
    id: 'r1', 日期: '20260101', 金額: '100', 幣別: 'TWD', 分類: '餐飲食品',
    '付款(轉出)': '現金', 專案: '正常開銷',
  },
];

describe('SQLite records repository seam', () => {
  it('writes and loads records in one transaction with indexed columns', async () => {
    const fake = createFakeDatabase();
    const repository = createSQLiteRecordsRepository({ database: fake.database });

    await repository.save(rows);
    expect(await repository.load()).toEqual(rows);
    expect(fake.statements.some(statement => statement.includes('CREATE INDEX IF NOT EXISTS idx_records_month_key'))).toBe(true);
  });

  it('migrates legacy JSON records once', async () => {
    const fake = createFakeDatabase();
    const legacy = {
      fileUri: 'legacy://records',
      load: jest.fn(async () => rows),
      save: jest.fn(async () => undefined),
      clear: jest.fn(async () => undefined),
    };
    const repository = createSQLiteRecordsRepository({ database: fake.database, legacyRepository: legacy });

    expect(await repository.load()).toEqual(rows);
    expect(await repository.load()).toEqual(rows);
    expect(legacy.load).toHaveBeenCalledTimes(1);
  });
});

