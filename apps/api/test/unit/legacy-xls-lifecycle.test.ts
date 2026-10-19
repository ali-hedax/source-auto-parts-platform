import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ workers: [] as Array<EventEmitter & { terminate: ReturnType<typeof vi.fn>; postMessage: ReturnType<typeof vi.fn> }>, options: [] as unknown[] }));
vi.mock('node:fs/promises', () => ({ stat: vi.fn(async () => ({ size: 1024 })) }));
vi.mock('node:worker_threads', () => ({
  Worker: class extends EventEmitter {
    terminate = vi.fn(async () => 1);
    postMessage = vi.fn();
    constructor(_source: string, options: unknown) {
      super(); state.workers.push(this); state.options.push(options);
    }
  },
}));
import { legacyXlsRecords } from '../../src/modules/brand-imports/legacy-xls.js';

afterEach(() => { vi.useRealTimers(); state.workers.length = 0; state.options.length = 0; });

async function reading() {
  const rows = legacyXlsRecords('synthetic.xls');
  const next = rows.next();
  await Promise.resolve();
  return { rows, next, worker: state.workers[0]! };
}

describe('legacy XLS supervisor fault injection', () => {
  it('enforces the response deadline and cleans up a stalled worker', async () => {
    vi.useFakeTimers();
    const { next, worker } = await reading();
    const rejected = expect(next).rejects.toThrow('XLS_TIME_LIMIT');
    await vi.advanceTimersByTimeAsync(60_000);
    await rejected;
    expect(worker.terminate).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(state.options[0]).toMatchObject({ resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 } });
  });

  it.each(['error', 'exit'])('handles a worker %s before its final batch and cleans up', async event => {
    vi.useFakeTimers();
    const { next, worker } = await reading();
    const rejected = expect(next).rejects.toThrow('XLS_PROCESSING_LIMIT');
    worker.emit(event, event === 'error' ? Object.assign(new Error('Worker heap limit'), { code: 'ERR_WORKER_OUT_OF_MEMORY' }) : 1);
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pauses the deadline during slow consumption and resumes it for the next batch', async () => {
    vi.useFakeTimers();
    const { rows, next, worker } = await reading();
    worker.emit('message', { rows: [{ source: 'Parts', line: 1, cells: [{ value: '001' }] }] });
    expect((await next).value).toMatchObject({ cells: ['001'] });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(worker.terminate).not.toHaveBeenCalled();
    const rejected = expect(rows.next()).rejects.toThrow('XLS_TIME_LIMIT');
    await vi.advanceTimersByTimeAsync(60_000);
    await rejected;
    expect(worker.postMessage).toHaveBeenCalledWith('next');
    expect(vi.getTimerCount()).toBe(0);
  });
});
