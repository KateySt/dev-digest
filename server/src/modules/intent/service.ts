import { z } from 'zod';
import type { Intent, IntentSource, IssueMeta, RepoRef } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { RunLogger } from '../../platform/run-logger.js';
import type { PullRow } from '../../db/rows.js';
import type { RepoRow } from '../repos/repository.js';
import type { ReviewRepository } from '../reviews/repository.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { IntentRepository, type IntentRow } from './repository.js';
import { INTENT_SCHEMA_NAME, ISSUE_REF_PATTERN, MAX_SPEC_CHARS } from './constants.js';
import { detectSpecRef, hasRealDocumentation, resolveSpecPath } from './helpers.js';
import { INTENT_SYSTEM_PROMPT } from './prompts.js';

/**
 * IntentService — derives a PR's intent/scope with a separate (cheap) model
 * before/alongside the main review, per-PR, cached by head sha. Source
 * gathering (linked issue, spec doc, fallback signals) is entirely best-effort
 * in code; only the final derivation step calls a model — see
 * `resolveFeatureModel(.., 'review_intent')`. `confidence`/`sources` are
 * always computed here from which inputs were actually available, never
 * asked of or trusted from the model (mirrors `ConventionsService`'s
 * evidence-verification split between code and model).
 */

const IntentModelResponse = z.object({
  intent: z.string().min(1),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});

export class IntentService {
  private repo: IntentRepository;
  private reviews: ReviewRepository;

  constructor(private container: Container) {
    this.repo = new IntentRepository(container.db);
    this.reviews = container.reviewRepo;
  }

  /** Load a persisted row → public `Intent`, or `undefined` if never computed. */
  async get(prId: string): Promise<Intent | undefined> {
    const row = await this.repo.getByPrId(prId);
    return row ? toIntentDto(row) : undefined;
  }

  /**
   * Return the cached intent when it's still fresh (row's `head_sha` matches
   * the PR's current head — no model call, a cache hit), else gather sources
   * and (re)derive it via the workspace's configured cheap model. `runLog` is
   * optional (the GET route has no run to log against) — when supplied, emits
   * a distinct line for the cache-hit vs. cache-miss branch, so a Live Log
   * reader can tell "reused" apart from "called the model" instead of only
   * inferring it from elapsed ms. `force` (default falsy) bypasses the
   * cache-freshness check entirely and always re-derives — used by the PR
   * Brief's manual refresh action; the review-run call site never passes it,
   * so its own intent computation stays cache-respecting.
   */
  async getOrCompute(
    workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    runLog?: RunLogger,
    force?: boolean,
  ): Promise<Intent> {
    const existing = await this.repo.getByPrId(pull.id);
    if (!force && existing && existing.headSha === pull.headSha) {
      runLog?.info('Intent cache hit — head_sha unchanged, reusing persisted intent (no model call)');
      return toIntentDto(existing);
    }
    if (force) {
      runLog?.info('Intent force-refresh requested — bypassing cache, deriving via cheap model');
    } else {
      runLog?.info('Intent cache miss — head_sha changed or no prior intent, deriving via cheap model');
    }

    const repoRef: RepoRef = { owner: repo.owner, name: repo.name };
    const sources = new Set<IntentSource>();

    const body = pull.body ?? '';
    if (body.trim().length > 0) sources.add('description');

    const linkedIssue = await this.resolveLinkedIssue(repoRef, body);
    if (linkedIssue) sources.add('linked_issue');

    let specRefPath: string | null = detectSpecRef(body);
    let specExcerpt: string | null = null;
    if (specRefPath) {
      specExcerpt = await this.readSpecExcerpt(repoRef, specRefPath);
      if (specExcerpt != null) sources.add('spec_ref');
      else specRefPath = null; // couldn't safely/actually read it — don't claim it as a source
    }

    const confidence: 'high' | 'low' = hasRealDocumentation(body, linkedIssue) ? 'high' : 'low';

    let diffShape: string | null = null;
    let commitMessages: string | null = null;
    if (confidence === 'low') {
      const files = await this.reviews.getPrFiles(pull.id);
      if (files.length > 0) {
        diffShape = files.map((f) => f.path).join('\n');
        sources.add('diff_shape');
      }
      const messages = await this.repo.getCommitMessages(pull.id);
      if (messages.length > 0) {
        commitMessages = messages.join('\n');
        sources.add('commit_messages');
      }
    }

    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'review_intent');
    const llm = await this.container.llm(provider);

    const userMessage = buildUserMessage({
      title: pull.title,
      body,
      linkedIssue,
      specRefPath,
      specExcerpt,
      diffShape,
      commitMessages,
    });

    const result = await llm.completeStructured({
      model,
      schema: IntentModelResponse,
      schemaName: INTENT_SCHEMA_NAME,
      messages: [
        { role: 'system', content: INTENT_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    });

    const row = await this.repo.upsert({
      prId: pull.id,
      intent: result.data.intent,
      inScope: result.data.in_scope,
      outOfScope: result.data.out_of_scope,
      headSha: pull.headSha,
      confidence,
      sources: Array.from(sources),
      specRefPath,
      provider,
      model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
    });

    return toIntentDto(row);
  }

  /** Best-effort: a GitHub failure must never fail intent computation. */
  private async resolveLinkedIssue(repo: RepoRef, body: string): Promise<IssueMeta | undefined> {
    const m = body.match(ISSUE_REF_PATTERN);
    if (!m?.[1]) return undefined;
    try {
      const github = await this.container.github();
      return await github.getIssue(repo, Number(m[1]));
    } catch {
      return undefined;
    }
  }

  /** Best-effort: a clone/fs failure (or an unsafe path) must never fail
   *  intent computation — just omit the spec source. */
  private async readSpecExcerpt(repo: RepoRef, refPath: string): Promise<string | null> {
    try {
      const clonePath = this.container.git.clonePathFor(repo);
      const safePath = resolveSpecPath(clonePath, refPath);
      if (!safePath) return null;
      const content = await this.container.git.readFile(repo, safePath);
      return content.slice(0, MAX_SPEC_CHARS);
    } catch {
      return null;
    }
  }
}

function toIntentDto(row: IntentRow): Intent {
  return {
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    confidence: row.confidence === 'high' ? 'high' : 'low',
    sources: row.sources as IntentSource[],
    spec_ref: row.specRefPath,
  };
}

/** Compose the untrusted, clearly-delimited user message for the derivation call. */
function buildUserMessage(input: {
  title: string;
  body: string;
  linkedIssue: IssueMeta | undefined;
  specRefPath: string | null;
  specExcerpt: string | null;
  diffShape: string | null;
  commitMessages: string | null;
}): string {
  const sections: string[] = [`## PR title\n<untrusted>\n${input.title}\n</untrusted>`];

  sections.push(
    `## PR description\n<untrusted>\n${input.body.trim().length > 0 ? input.body : '(no description provided)'}\n</untrusted>`,
  );

  if (input.linkedIssue) {
    sections.push(
      `## Linked issue #${input.linkedIssue.number}\n<untrusted>\n${input.linkedIssue.title}\n\n${input.linkedIssue.body ?? ''}\n</untrusted>`,
    );
  }

  if (input.specRefPath && input.specExcerpt) {
    sections.push(`## Spec/plan excerpt (${input.specRefPath})\n<untrusted>\n${input.specExcerpt}\n</untrusted>`);
  }

  if (input.diffShape) {
    sections.push(
      `## Fallback signal: changed file paths (no real PR documentation was found)\n<untrusted>\n${input.diffShape}\n</untrusted>`,
    );
  }

  if (input.commitMessages) {
    sections.push(
      `## Fallback signal: commit messages (no real PR documentation was found)\n<untrusted>\n${input.commitMessages}\n</untrusted>`,
    );
  }

  return sections.join('\n\n');
}
