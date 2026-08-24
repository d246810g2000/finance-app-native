import * as FileSystem from 'expo-file-system/legacy';
import type { RawRecord } from '../../types';

export interface FileSystemRecordsClient {
  documentDirectory?: string | null;
  cacheDirectory?: string | null;
  getInfoAsync(fileUri: string): Promise<{ exists: boolean }>;
  readAsStringAsync(fileUri: string): Promise<string>;
  writeAsStringAsync(fileUri: string, contents: string): Promise<void>;
  deleteAsync(fileUri: string, options?: { idempotent?: boolean }): Promise<void>;
}

export interface RecordsRepository {
  load: () => Promise<RawRecord[]>;
  save: (records: RawRecord[]) => Promise<void>;
  clear: () => Promise<void>;
  fileUri: string;
}

export type RecordsRepositoryOptions = {
  fileName?: string;
  client?: FileSystemRecordsClient;
};

/** Derived dates are query state; keeping them out of storage preserves the legacy JSON shape. */
export function sanitizeRecordsForStorage(records: RawRecord[]): RawRecord[] {
  return records.map(record => {
    const persisted: RawRecord = { ...record };
    delete persisted.parsedDate;
    return persisted;
  });
}

export function createFileSystemRecordsRepository(
  options: RecordsRepositoryOptions = {},
): RecordsRepository {
  const client = options.client ?? FileSystem;
  const fileName = options.fileName ?? 'finance_records.json';
  const directory = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
  const fileUri = `${directory}${fileName}`;

  return {
    fileUri,
    async load() {
      const info = await client.getInfoAsync(fileUri);
      if (!info.exists) return [];

      const content = await client.readAsStringAsync(fileUri);
      if (!content) return [];
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) throw new Error('Records file must contain an array');
      return parsed as RawRecord[];
    },
    async save(records) {
      await client.writeAsStringAsync(fileUri, JSON.stringify(sanitizeRecordsForStorage(records)));
    },
    async clear() {
      await client.deleteAsync(fileUri, { idempotent: true });
    },
  };
}
