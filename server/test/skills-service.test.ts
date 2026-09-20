import { describe, it, expect } from 'vitest';
import type { Container } from '../src/platform/container.js';
import { SkillsService } from '../src/modules/skills/service.js';

/** searchCommunity is pure (filters an in-memory fixture, no DB/network), so
 *  it can be unit-tested without a real container — SkillsRepository's
 *  constructor only stores `db`, never queries it eagerly. */
const service = new SkillsService({ db: {} } as unknown as Container);

describe('SkillsService.searchCommunity', () => {
  it('returns the full fixture catalog with no query', () => {
    const results = service.searchCommunity();
    expect(results.length).toBeGreaterThan(0);
    // The fixture catalog never leaks its `body` field through search results.
    expect(results.every((r) => !('body' in r))).toBe(true);
  });

  it('filters by a case-insensitive name/description match', () => {
    const results = service.searchCommunity('secret');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.name.toLowerCase().includes('secret') || r.desc.toLowerCase().includes('secret'))).toBe(true);
  });

  it('filters by language', () => {
    const all = service.searchCommunity();
    const anyLang = all.find((r) => r.lang !== 'Any');
    if (!anyLang) return; // fixture has no non-"Any" entry — nothing to assert
    const results = service.searchCommunity(undefined, anyLang.lang);
    expect(results.every((r) => r.lang === anyLang.lang)).toBe(true);
  });

  it('returns nothing for a query that matches no fixture', () => {
    expect(service.searchCommunity('xyz-does-not-exist')).toEqual([]);
  });
});
