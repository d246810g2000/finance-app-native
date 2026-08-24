import type { RawRecord } from '../types';

export interface RecordSynchronizer {
  sync: (records: RawRecord[]) => Promise<void>;
  syncNotifications: (records: RawRecord[]) => Promise<void>;
}

/**
 * Widget and notification updates follow every successful records write. They are
 * best-effort consumers and must not turn a persisted record into an apparent failure.
 */
export function createRecordSynchronizer(): RecordSynchronizer {
  return {
    async sync(records) {
      await Promise.allSettled([
        import('./NotificationService').then(service => service.default.syncWithRecords(records)),
        import('./WidgetService').then(service => service.default.syncWidgetData(records)),
      ]);
    },
    async syncNotifications(records) {
      const service = await import('./NotificationService');
      await service.default.syncWithRecords(records);
    },
  };
}
