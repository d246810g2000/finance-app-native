export interface PersistenceQueueOptions<T> {
  save: (value: T) => Promise<void>;
  clear?: () => Promise<void>;
  delayMs?: number;
  onError?: (error: unknown) => void;
}

export interface PersistenceQueue<T> {
  enqueue: (value: T, immediate?: boolean) => void;
  flush: () => Promise<void>;
  clear: () => void;
  dispose: () => Promise<void>;
}

/**
 * Keeps at most one pending snapshot and executes storage operations serially.
 * A failed operation must not poison later writes.
 */
export function createPersistenceQueue<T>(
  options: PersistenceQueueOptions<T>,
): PersistenceQueue<T> {
  const delayMs = options.delayMs ?? 150;
  let pendingValue: T | null | undefined;
  let hasPendingValue = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queueTail: Promise<void> = Promise.resolve();
  let activeOperation: Promise<void> = Promise.resolve();

  const reportError = (error: unknown) => {
    if (options.onError) options.onError(error);
    else console.error('Persistence operation failed', error);
  };

  const runOperation = (operation: () => Promise<void>) => {
    const run = queueTail.then(operation);
    queueTail = run.catch(error => reportError(error));
    activeOperation = queueTail;
    return run;
  };

  const cancelTimer = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  };

  const execute = () => {
    cancelTimer();
    if (!hasPendingValue) return Promise.resolve();
    const value = pendingValue as T;
    pendingValue = undefined;
    hasPendingValue = false;
    return runOperation(() => options.save(value));
  };

  const flush = async () => {
    cancelTimer();
    const currentOperation = execute();
    await currentOperation.catch(() => undefined);
    await activeOperation.catch(() => undefined);
  };

  const enqueue = (value: T, immediate = false) => {
    pendingValue = value;
    hasPendingValue = true;
    cancelTimer();
    if (immediate) execute();
    else if (delayMs > 0) timer = setTimeout(execute, delayMs);
    else execute();
  };

  const clear = () => {
    pendingValue = undefined;
    hasPendingValue = false;
    cancelTimer();
    runOperation(async () => {
      if (!options.clear) return;
      await options.clear();
    });
  };

  return {
    enqueue,
    flush,
    clear,
    dispose: flush,
  };
}
