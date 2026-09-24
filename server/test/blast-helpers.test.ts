import { describe, it, expect } from 'vitest';
import { toBlastRadius, buildSummary } from '../src/modules/blast/helpers.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';

describe('toBlastRadius', () => {
  it('groups callers by viaSymbol into one DownstreamImpact per changed symbol', () => {
    const result: BlastResult = {
      changedSymbols: [
        { file: 'src/a.ts', name: 'foo', kind: 'function' },
        { file: 'src/b.ts', name: 'bar', kind: 'function' },
      ],
      callers: [
        { file: 'src/x.ts', symbol: 'callerA', viaSymbol: 'foo', line: 10, rank: 1 },
        { file: 'src/y.ts', symbol: 'callerB', viaSymbol: 'foo', line: 20, rank: 1 },
        { file: 'src/z.ts', symbol: 'callerC', viaSymbol: 'bar', line: 5, rank: 1 },
      ],
      impactedEndpoints: [],
      factsByFile: {},
    };

    const radius = toBlastRadius(result);

    expect(radius.changed_symbols).toEqual([
      { name: 'foo', file: 'src/a.ts', kind: 'function' },
      { name: 'bar', file: 'src/b.ts', kind: 'function' },
    ]);
    expect(radius.downstream).toHaveLength(2);
    const foo = radius.downstream.find((d) => d.symbol === 'foo');
    expect(foo?.callers).toEqual([
      { name: 'callerA', file: 'src/x.ts', line: 10 },
      { name: 'callerB', file: 'src/y.ts', line: 20 },
    ]);
    const bar = radius.downstream.find((d) => d.symbol === 'bar');
    expect(bar?.callers).toEqual([{ name: 'callerC', file: 'src/z.ts', line: 5 }]);
  });

  it('attaches endpoints_affected/crons_affected from factsByFile keyed by caller file, deduped and sorted', () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
      callers: [
        { file: 'src/x.ts', symbol: 'callerA', viaSymbol: 'foo', line: 10, rank: 1 },
        { file: 'src/y.ts', symbol: 'callerB', viaSymbol: 'foo', line: 20, rank: 1 },
      ],
      impactedEndpoints: ['GET /a', 'POST /b'],
      factsByFile: {
        'src/x.ts': { endpoints: ['POST /b', 'GET /a'], crons: ['nightly'] },
        'src/y.ts': { endpoints: ['GET /a'], crons: [] },
      },
    };

    const radius = toBlastRadius(result);
    const foo = radius.downstream.find((d) => d.symbol === 'foo');
    expect(foo?.endpoints_affected).toEqual(['GET /a', 'POST /b']);
    expect(foo?.crons_affected).toEqual(['nightly']);
  });

  it('degraded path (factsByFile undefined) always yields [] for endpoints/crons, even with impactedEndpoints set', () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
      callers: [{ file: 'src/x.ts', symbol: 'callerA', viaSymbol: 'foo', line: 10, rank: 0 }],
      impactedEndpoints: ['GET /a'],
      degraded: true,
    };

    const radius = toBlastRadius(result);
    const foo = radius.downstream.find((d) => d.symbol === 'foo');
    expect(foo?.endpoints_affected).toEqual([]);
    expect(foo?.crons_affected).toEqual([]);
  });

  it('degraded path also applies when degraded is unset but factsByFile is undefined', () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
      callers: [{ file: 'src/x.ts', symbol: 'callerA', viaSymbol: 'foo', line: 10, rank: 0 }],
      impactedEndpoints: ['GET /a'],
    };

    const radius = toBlastRadius(result);
    expect(radius.downstream[0]?.endpoints_affected).toEqual([]);
    expect(radius.downstream[0]?.crons_affected).toEqual([]);
  });

  it('keeps a changed symbol with no callers in changed_symbols and gives it an empty-caller DownstreamImpact', () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/a.ts', name: 'lonely', kind: 'function' }],
      callers: [],
      impactedEndpoints: [],
      factsByFile: {},
    };

    const radius = toBlastRadius(result);
    expect(radius.changed_symbols).toEqual([{ name: 'lonely', file: 'src/a.ts', kind: 'function' }]);
    expect(radius.downstream).toEqual([
      { symbol: 'lonely', callers: [], endpoints_affected: [], crons_affected: [] },
    ]);
  });
});

describe('buildSummary', () => {
  it('is deterministic for a given input', () => {
    const radius = {
      changed_symbols: [
        { name: 'a', file: 'f.ts', kind: 'function' },
        { name: 'b', file: 'f.ts', kind: 'function' },
        { name: 'c', file: 'f.ts', kind: 'function' },
      ],
      downstream: [
        {
          symbol: 'a',
          callers: [
            { name: 'x', file: 'x.ts', line: 1 },
            { name: 'y', file: 'y.ts', line: 2 },
          ],
          endpoints_affected: ['GET /a'],
          crons_affected: [],
        },
        {
          symbol: 'b',
          callers: [
            { name: 'z', file: 'z.ts', line: 1 },
            { name: 'w', file: 'w.ts', line: 2 },
            { name: 'v', file: 'v.ts', line: 3 },
            { name: 'u', file: 'u.ts', line: 4 },
            { name: 't', file: 't.ts', line: 5 },
          ],
          endpoints_affected: ['POST /b'],
          crons_affected: ['nightly'],
        },
        { symbol: 'c', callers: [], endpoints_affected: [], crons_affected: [] },
      ],
    };

    expect(buildSummary(radius)).toBe('3 changed symbols, 7 callers, 2 endpoints and 1 cron affected');
  });

  it('singularizes counts of exactly 1', () => {
    const radius = {
      changed_symbols: [{ name: 'a', file: 'f.ts', kind: 'function' }],
      downstream: [
        {
          symbol: 'a',
          callers: [{ name: 'x', file: 'x.ts', line: 1 }],
          endpoints_affected: ['GET /a'],
          crons_affected: ['nightly'],
        },
      ],
    };

    expect(buildSummary(radius)).toBe('1 changed symbol, 1 caller, 1 endpoint and 1 cron affected');
  });
});
