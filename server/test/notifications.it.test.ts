import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createPgliteDb, runPgliteMigrations, type PgliteDbHandle } from '../src/db/pglite.js';
import { MIGRATIONS_DIR } from '../src/db/migrate.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { JobRunner } from '../src/platform/jobs.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { NotificationsRepository } from '../src/modules/notifications/repository.js';

// Notification center against a real (embedded PGlite) DB — no Docker needed.
describe('notifications (PGlite)', () => {
  let dataDir: string;
  let handle: PgliteDbHandle;
  let app: FastifyInstance;
  let workspaceId: string;
  const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
  const build = () =>
    buildApp({ config, db: handle.db, overrides: { git: new MockGitClient(), github: new MockGitHubClient() } });

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'devdigest-notif-'));
    handle = await createPgliteDb(dataDir);
    await runPgliteMigrations(handle.pg, MIGRATIONS_DIR);
    await seed(handle.db);
    app = await build();
    workspaceId = (await app.container.auth.currentWorkspace({})).id;
  });
  afterAll(async () => {
    await app?.close();
    await handle?.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const notify = (title: string) =>
    app.container.notifications.notify(workspaceId, { kind: 'review', status: 'success', title, href: '/x' });

  it('stores, lists newest first with the unread count, and publishes to the workspace bus', async () => {
    const seen = vi.fn();
    const off = app.container.notificationBus.subscribe(workspaceId, seen);
    await notify('first');
    const second = await notify('second');
    off();

    expect(seen).toHaveBeenCalledTimes(2);
    expect(seen).toHaveBeenLastCalledWith(second);
    const res = await app.inject({ method: 'GET', url: '/notifications' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.unread).toBe(2);
    expect(body.items.map((n: { title: string }) => n.title)).toEqual(['second', 'first']);
    expect(body.items[0]).toMatchObject({ kind: 'review', status: 'success', read: false, href: '/x' });
  });

  it('marks read / unread, marks all read, removes one, clears all', async () => {
    const { items } = (await app.inject({ method: 'GET', url: '/notifications' })).json();
    const id = items[0].id;

    await app.inject({ method: 'POST', url: `/notifications/${id}/read`, payload: {} });
    expect((await app.inject({ method: 'GET', url: '/notifications' })).json().unread).toBe(1);
    await app.inject({ method: 'POST', url: `/notifications/${id}/read`, payload: { read: false } });
    expect((await app.inject({ method: 'GET', url: '/notifications' })).json().unread).toBe(2);

    await app.inject({ method: 'POST', url: '/notifications/read-all' });
    expect((await app.inject({ method: 'GET', url: '/notifications' })).json().unread).toBe(0);

    expect((await app.inject({ method: 'DELETE', url: `/notifications/${id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: `/notifications/${id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/notifications' })).json().items).toHaveLength(1);

    await app.inject({ method: 'DELETE', url: '/notifications' });
    expect((await app.inject({ method: 'GET', url: '/notifications' })).json()).toEqual({ items: [], unread: 0 });
  });

  it('prune keeps only the newest N and drops anything past the age limit', async () => {
    const repo = new NotificationsRepository(handle.db);
    for (const title of ['a', 'b', 'c', 'd']) await notify(title);
    await repo.prune(workspaceId, 2, new Date(0));
    expect((await repo.list(workspaceId, 10)).map((r) => r.title)).toEqual(['d', 'c']);
    await repo.prune(workspaceId, 10, new Date(Date.now() + 1000));
    expect(await repo.list(workspaceId, 10)).toEqual([]);
  });

  it('notify never throws — an unknown workspace resolves to null', async () => {
    await expect(
      app.container.notifications.notify('00000000-0000-0000-0000-000000000000', {
        kind: 'clone',
        status: 'error',
        title: 'x',
      }),
    ).resolves.toBeNull();
    await expect(app.container.notifications.notify(workspaceId, null)).resolves.toBeNull();
  });

  it('streams new notifications over SSE and drops the subscription when the client disconnects', async () => {
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const bus = app.container.notificationBus as unknown as { emitter: { listenerCount(e: string): number } };
    const abort = new AbortController();
    const res = await fetch(`${address}/notifications/stream`, { signal: abort.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    await vi.waitFor(() => expect(bus.emitter.listenerCount(workspaceId)).toBe(1));

    const reader = res.body!.getReader();
    await notify('live one');
    let text = '';
    while (!text.includes('live one')) text += new TextDecoder().decode((await reader.read()).value);
    expect(text).toContain('event: notification');

    abort.abort();
    await vi.waitFor(() => expect(bus.emitter.listenerCount(workspaceId)).toBe(0));
  });

  it('JobRunner hooks fire once on the final outcome, with the handler result', async () => {
    const jobs = new JobRunner(handle.db, { retries: 0 });
    const onDone = vi.fn();
    const onFailed = vi.fn();
    jobs.register('ok', async () => ({ filesIndexed: 3 }), { onDone, onFailed });
    jobs.register('boom', async () => {
      throw new Error('nope');
    }, { onDone, onFailed });

    await (await jobs.enqueue(workspaceId, 'ok', { repoId: 'r' })).done;
    await (await jobs.enqueue(workspaceId, 'boom', { repoId: 'r' })).done.catch(() => undefined);

    expect(onDone).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledWith({ workspaceId, payload: { repoId: 'r' }, result: { filesIndexed: 3 } });
    expect(onFailed).toHaveBeenCalledOnce();
    expect(onFailed.mock.calls[0]![0]).toMatchObject({ workspaceId, error: expect.objectContaining({ message: 'nope' }) });
  });

  it('boot posts one "interrupted" notification per workspace for work a dead process left running', async () => {
    await app.inject({ method: 'DELETE', url: '/notifications' });
    await handle.db.insert(t.jobs).values([
      { workspaceId, kind: 'clone', status: 'running' },
      { workspaceId, kind: 'repo-intel-index', status: 'queued' },
    ]);
    await app.close();
    app = await build(); // runs the boot reapers

    const { items } = (await app.inject({ method: 'GET', url: '/notifications' })).json();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'interrupted', status: 'info', title: '2 operations interrupted' });
  });
});
