import { createPersistenceQueue } from '../services/persistence/persistenceQueue';

describe('records persistence queue', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('coalesces debounced writes to the latest snapshot', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const queue = createPersistenceQueue<number>({ save, delayMs: 150 });

    queue.enqueue(1);
    queue.enqueue(2);
    await jest.advanceTimersByTimeAsync(150);
    await queue.flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(2);
  });

  it('continues the queue after a failed save and reports the error once', async () => {
    const failure = new Error('disk full');
    const save = jest.fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined);
    const onError = jest.fn();
    const queue = createPersistenceQueue<number>({ save, delayMs: 0, onError });

    queue.enqueue(1, true);
    queue.enqueue(2, true);
    await queue.flush();

    expect(onError).toHaveBeenCalledWith(failure);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(2);
  });

  it('clear cancels pending writes before they reach storage', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const clear = jest.fn().mockResolvedValue(undefined);
    const queue = createPersistenceQueue<number>({ save, clear, delayMs: 150 });

    queue.enqueue(1);
    queue.clear();
    await queue.flush();

    expect(clear).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });
});
