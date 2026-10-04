import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Services, type TestApp, bootApp, loginCustomer, pngBytes, services } from './helpers.js';

/**
 * The worker's own dispatch loop (not the tests' drain helper) on the real
 * database, with QUEUE_DRIVER=inline (development without Redis): due outbox rows
 * are claimed with SKIP LOCKED, run through the same handlers and marked DONE; a
 * failing handler becomes a delayed retry. The BullMQ transport itself needs
 * Redis and is not executed here.
 */
let t: TestApp;
let s: Services;
let worker: { app: { close(): Promise<void> }; dispatcher: { start(): Promise<void> } } | null = null;

// Before anything loads the (cached) environment; this file runs in its own process.
process.env.QUEUE_DRIVER = 'inline';

beforeAll(async () => {
  t = await bootApp();
  s = await services(t);
});

afterAll(async () => {
  await worker?.app.close();
  await t?.close();
});

describe('worker dispatch loop (inline queue, real PostgreSQL)', () => {
  it('scans an uploaded file through the outbox and turns a failing event into a delayed retry', async () => {
    // Rows left by earlier test files are parked so only this test's events are due.
    await s.prisma.outboxEvent.updateMany({ where: { status: 'PENDING' }, data: { availableAt: new Date(Date.now() + 86_400_000) } });

    const customer = await loginCustomer(t);
    const up = await customer.upload<Array<{ id: string; status: string }>>('/attachments', { purpose: 'MESSAGE' }, [{ name: 'photo.png', data: await pngBytes(), type: 'image/png' }]);
    expect(up.status).toBe(201);
    const id = up.body[0]?.id as string;
    expect(up.body[0]?.status).toBe('SCANNING');
    const failing = await s.prisma.outboxEvent.create({
      data: { type: 'test.no-handler', aggregateType: 'test', aggregateId: randomUUID(), payload: {}, dedupeKey: `test:${randomUUID()}` },
    });

    const { createWorkerContext } = await import('../../dist/worker/index.js');
    worker = await createWorkerContext();
    await worker.dispatcher.start();

    await expect.poll(async () => (await customer.get<{ status: string }>(`/attachments/${id}`)).body.status, { timeout: 30_000, interval: 500 }).toBe('READY');
    const scan = await s.prisma.outboxEvent.findFirstOrThrow({ where: { dedupeKey: `scan:${id}` } });
    expect(scan).toMatchObject({ status: 'DONE', attempts: 1 });

    await expect.poll(async () => (await s.prisma.outboxEvent.findUniqueOrThrow({ where: { id: failing.id } })).attempts, { timeout: 30_000, interval: 500 }).toBe(1);
    const retry = await s.prisma.outboxEvent.findUniqueOrThrow({ where: { id: failing.id } });
    expect(retry.status).toBe('PENDING');
    expect(retry.lockedAt).toBeNull();
    expect(retry.lastError).toContain('no handler');
    expect(retry.availableAt.getTime()).toBeGreaterThan(Date.now());
  });
});
