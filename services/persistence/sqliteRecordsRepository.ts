import type { SQLiteDatabase } from 'expo-sqlite';
import type { RawRecord } from '../../types';
import { buildRecordIndex, normalizeRecord } from '../core/recordIndex';
import type { RecordsRepository } from './recordsRepository';

const DATABASE_NAME = 'finance_records.db';
const SCHEMA_VERSION = 1;

type SQLiteClient = Pick<SQLiteDatabase, 'execAsync' | 'runAsync' | 'getAllAsync' | 'withTransactionAsync'>;

export interface SQLiteRecordsRepositoryOptions {
  databaseName?: string;
  database?: SQLiteClient;
  legacyRepository?: RecordsRepository;
}

interface RecordRow {
  id: string;
  raw_json: string;
}

const SCHEMA_SQL = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY NOT NULL,
    date_ts INTEGER,
    month_key TEXT,
    account TEXT,
    project TEXT,
    category TEXT,
    amount_twd REAL NOT NULL,
    raw_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_records_date_ts ON records(date_ts);
  CREATE INDEX IF NOT EXISTS idx_records_month_key ON records(month_key);
  CREATE INDEX IF NOT EXISTS idx_records_account ON records(account);
  CREATE INDEX IF NOT EXISTS idx_records_project ON records(project);
  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  PRAGMA user_version = ${SCHEMA_VERSION};
`;

function makeId(record: RawRecord, index: number): string {
  return String(record.id || `legacy_${index}`);
}

function parseRows(rows: RecordRow[]): RawRecord[] {
  return rows.flatMap(row => {
    try {
      const parsed = JSON.parse(row.raw_json);
      return parsed && typeof parsed === 'object' ? [parsed as RawRecord] : [];
    } catch {
      return [];
    }
  });
}

export function createSQLiteRecordsRepository(
  options: SQLiteRecordsRepositoryOptions = {},
): RecordsRepository {
  const legacyRepository = options.legacyRepository;
  let databasePromise: Promise<SQLiteClient> | null = options.database
    ? Promise.resolve(options.database)
    : null;
  let initialized: Promise<SQLiteClient> | null = null;

  const getDatabase = async (): Promise<SQLiteClient> => {
    if (!databasePromise) {
      const { openDatabaseAsync } = require('expo-sqlite') as typeof import('expo-sqlite');
      databasePromise = openDatabaseAsync(options.databaseName || DATABASE_NAME);
    }
    if (!initialized) {
      initialized = databasePromise.then(async database => {
        await database.execAsync(SCHEMA_SQL);
        return database;
      });
    }
    return initialized;
  };

  const migrateLegacyRecords = async (database: SQLiteClient): Promise<void> => {
    if (!legacyRepository) return;
    const marker = await database.getAllAsync<{ value: string }>(
      'SELECT value FROM metadata WHERE key = ?',
      'legacy_records_migrated',
    );
    if (marker.length > 0) return;

    const legacyRecords = await legacyRepository.load();
    if (legacyRecords.length > 0) {
      await database.withTransactionAsync(async () => {
        for (let index = 0; index < legacyRecords.length; index += 1) {
          const record = legacyRecords[index];
          const normalized = normalizeRecord(record);
          await database.runAsync(
            `INSERT OR REPLACE INTO records
              (id, date_ts, month_key, account, project, category, amount_twd, raw_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            makeId(record, index),
            normalized.dateTs,
            normalized.monthKey,
            normalized.account,
            normalized.project,
            normalized.category,
            normalized.amountTwd,
            JSON.stringify({ ...record, id: makeId(record, index) }),
          );
        }
      });
    }
    await database.runAsync(
      'INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)',
      'legacy_records_migrated',
      new Date().toISOString(),
    );
  };

  return {
    fileUri: `sqlite://${options.databaseName || DATABASE_NAME}`,
    async load() {
      try {
        const database = await getDatabase();
        await migrateLegacyRecords(database);
        const rows = await database.getAllAsync<RecordRow>(
          'SELECT id, raw_json FROM records ORDER BY date_ts ASC, id ASC',
        );
        return parseRows(rows);
      } catch (error) {
        if (legacyRepository) return legacyRepository.load();
        throw error;
      }
    },
    async save(records) {
      try {
        const database = await getDatabase();
        await database.withTransactionAsync(async () => {
          await database.runAsync('DELETE FROM records');
          const index = buildRecordIndex(records);
          for (const normalized of index.normalized) {
            const id = normalized.id || `generated_${normalized.dateTs || Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            await database.runAsync(
              `INSERT OR REPLACE INTO records
                (id, date_ts, month_key, account, project, category, amount_twd, raw_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              id,
              normalized.dateTs,
              normalized.monthKey,
              normalized.account,
              normalized.project,
              normalized.category,
              normalized.amountTwd,
              JSON.stringify({ ...normalized.raw, id }),
            );
          }
        });
      } catch (error) {
        if (legacyRepository) return legacyRepository.save(records);
        throw error;
      }
    },
    async clear() {
      try {
        const database = await getDatabase();
        await database.withTransactionAsync(async () => {
          await database.runAsync('DELETE FROM records');
          await database.runAsync('DELETE FROM metadata WHERE key = ?', 'legacy_records_migrated');
        });
      } catch (error) {
        if (legacyRepository) return legacyRepository.clear();
        throw error;
      }
    },
  };
}
