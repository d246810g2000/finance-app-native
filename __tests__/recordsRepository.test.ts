import {
  createFileSystemRecordsRepository,
  FileSystemRecordsClient,
} from '../services/persistence/recordsRepository';
import { RawRecord } from '../types';

describe('file records repository', () => {
  it('stores the persisted JSON shape without derived query fields', async () => {
    const writes: string[] = [];
    const record = {
      id: 'tx-1',
      '日期': '20260702',
      '金額': '100',
      parsedDate: new Date('2026-07-02'),
    } as RawRecord;
    const repository = createFileSystemRecordsRepository({
      client: {
        documentDirectory: '/docs/',
        writeAsStringAsync: async (_uri: string, content: string) => {
          writes.push(content);
        },
        readAsStringAsync: async () => JSON.stringify([]),
        getInfoAsync: async () => ({ exists: false }),
        deleteAsync: async () => undefined,
      },
    });

    await repository.save([record]);

    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0])).toEqual([{
      id: 'tx-1',
      '日期': '20260702',
      '金額': '100',
    }]);
  });
});
