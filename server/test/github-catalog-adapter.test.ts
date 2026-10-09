import { describe, it, expect, vi, afterEach } from 'vitest';
import { GitHubCatalogSource } from '../src/adapters/github/catalog.js';

afterEach(() => vi.unstubAllGlobals());

describe('GitHubCatalogSource (mocked fetch)', () => {
  it('B11 / S-AC-5: fetchBody reads from the raw content host at HEAD with encoded path segments', async () => {
    const fetchMock = vi.fn(async () => new Response('# body'));
    vi.stubGlobal('fetch', fetchMock);
    const body = await new GitHubCatalogSource().fetchBody({ owner: 'o', name: 'n' }, 'my folder/a b.md');
    expect(body).toBe('# body');
    expect(fetchMock.mock.calls[0]![0]).toBe('https://raw.githubusercontent.com/o/n/HEAD/my%20folder/a%20b.md');
  });

  it('B11 / S-AC-19: fetchBody truncates at the byte cap and passes an abort signal', async () => {
    const fetchMock = vi.fn(async () => new Response('x'.repeat(250_000)));
    vi.stubGlobal('fetch', fetchMock);
    const body = await new GitHubCatalogSource().fetchBody({ owner: 'o', name: 'n' }, 'a/b.md');
    expect(body).toHaveLength(200_000);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('B11 / S-AC-52: a non-OK raw response rejects (service degrades to fallback)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    await expect(new GitHubCatalogSource().fetchBody({ owner: 'o', name: 'n' }, 'a/b.md')).rejects.toThrow(/404/);
  });

  it('B11 / S-AC-5: listTree stays one REST tree request', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ tree: [{ path: 'a/b.md', type: 'blob' }] })));
    vi.stubGlobal('fetch', fetchMock);
    const tree = await new GitHubCatalogSource().listTree({ owner: 'o', name: 'n' });
    expect(tree).toEqual([{ path: 'a/b.md', type: 'blob' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.github.com/repos/o/n/git/trees/HEAD?recursive=1');
  });
});
