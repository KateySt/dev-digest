import type { BlastResult, BlastCallerRow } from '../repo-intel/types.js';
import type { BlastRadius, DownstreamImpact, ChangedSymbol } from '@devdigest/shared';

/**
 * Pure `BlastResult` (repo-intel facade) → `BlastRadius` (public contract)
 * mapping + summary generation. No I/O, no Fastify/Drizzle imports.
 *
 * Callers are grouped by `viaSymbol` into one `DownstreamImpact` per changed
 * symbol. A changed symbol with zero callers is NOT dropped — it still gets a
 * `DownstreamImpact` entry (empty `callers`/`endpoints_affected`/
 * `crons_affected`) so the client can render "no downstream impact" for that
 * symbol specifically, rather than silently losing it from the list.
 *
 * `endpoints_affected` / `crons_affected` are derived from `result.factsByFile`,
 * keyed by each caller's file, unioned + deduped + stable-sorted across all of
 * a symbol's callers. On the degraded path (`result.degraded === true` /
 * `factsByFile` undefined) these are always `[]` — the degraded/ripgrep facade
 * has no per-file endpoint/cron facts to attribute, and per the resolved open
 * question we do NOT fall back to copying the flat `impactedEndpoints` list
 * onto every symbol (that would misattribute endpoints to symbols that don't
 * actually reach them).
 */

/** Dedup + stable (lexicographic) sort — keeps output deterministic for tests
 *  and for the client's rendering order. */
function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

export function toBlastRadius(result: BlastResult): BlastRadius {
  const changed_symbols: ChangedSymbol[] = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));

  const callersBySymbol = new Map<string, BlastCallerRow[]>();
  for (const caller of result.callers) {
    const list = callersBySymbol.get(caller.viaSymbol) ?? [];
    list.push(caller);
    callersBySymbol.set(caller.viaSymbol, list);
  }

  const degraded = result.degraded === true || result.factsByFile === undefined;

  const downstream: DownstreamImpact[] = result.changedSymbols.map((symbol) => {
    const callers = callersBySymbol.get(symbol.name) ?? [];

    let endpoints_affected: string[] = [];
    let crons_affected: string[] = [];
    if (!degraded) {
      const endpoints: string[] = [];
      const crons: string[] = [];
      for (const caller of callers) {
        const facts = result.factsByFile?.[caller.file];
        if (!facts) continue;
        endpoints.push(...facts.endpoints);
        crons.push(...facts.crons);
      }
      endpoints_affected = uniqueSorted(endpoints);
      crons_affected = uniqueSorted(crons);
    }

    return {
      symbol: symbol.name,
      callers: callers.map((c) => ({ name: c.symbol, file: c.file, line: c.line })),
      endpoints_affected,
      crons_affected,
    };
  });

  return { changed_symbols, downstream, summary: '' };
}

/** Deterministic, LLM-free summary sentence for the panel's header line. */
export function buildSummary(radius: Omit<BlastRadius, 'summary'>): string {
  const symbolCount = radius.changed_symbols.length;
  const callerCount = radius.downstream.reduce((sum, d) => sum + d.callers.length, 0);
  const endpointCount = uniqueSorted(radius.downstream.flatMap((d) => d.endpoints_affected)).length;
  const cronCount = uniqueSorted(radius.downstream.flatMap((d) => d.crons_affected)).length;

  return `${symbolCount} changed symbol${symbolCount === 1 ? '' : 's'}, ${callerCount} caller${callerCount === 1 ? '' : 's'}, ${endpointCount} endpoint${endpointCount === 1 ? '' : 's'} and ${cronCount} cron${cronCount === 1 ? '' : 's'} affected`;
}
