import type { FindingActionKind, GitHubClient, PrReviewComment } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, ConflictError, NotFoundError } from '../../platform/errors.js';
import type { ReviewRepository } from './repository.js';
import { findingRowToDto, type ReviewDtoFinding } from './helpers.js';

/**
 * Finding actions available in the starter: accept / dismiss. These decisions
 * are the dataset later lessons build on (eval cases from accept/dismiss, the
 * `learn → memory` action, etc.).
 */
export async function actOnFinding(
  repo: ReviewRepository,
  workspaceId: string,
  findingId: string,
  action: FindingActionKind,
): Promise<{ finding: ReviewDtoFinding }> {
  const ctx = await repo.findingContext(findingId);
  if (!ctx || ctx.pull.workspaceId !== workspaceId) {
    throw new NotFoundError('Finding not found');
  }

  switch (action) {
    case 'accept': {
      const row = await repo.setFindingAccepted(findingId, new Date());
      return { finding: findingRowToDto(row!, await evalCaseIdFor(repo, findingId)) };
    }
    case 'dismiss': {
      const row = await repo.setFindingDismissed(findingId, new Date());
      return { finding: findingRowToDto(row!, await evalCaseIdFor(repo, findingId)) };
    }
    default:
      throw new AppError('invalid_action', `Action '${action}' is not available in the starter`, 400);
  }
}

async function evalCaseIdFor(repo: ReviewRepository, findingId: string): Promise<string | null> {
  return (await repo.evalCaseIdsForFindings([findingId])).get(findingId) ?? null;
}

/**
 * "Reply to author": post the user-edited `body` VERBATIM as an inline review
 * comment on the finding's PR (head commit, finding file, end line) through
 * the `GitHubClient` port - the same path as `POST /pulls/:id/comments`.
 * 409 if a reply was already posted; 400 when GitHub is not connected or
 * rejects the comment (nothing is recorded in that case).
 */
export async function replyToFinding(
  container: Container,
  repo: ReviewRepository,
  workspaceId: string,
  findingId: string,
  body: string,
): Promise<PrReviewComment> {
  const ctx = await repo.findingContext(findingId);
  if (!ctx || ctx.pull.workspaceId !== workspaceId) {
    throw new NotFoundError('Finding not found');
  }
  if (ctx.finding.replyUrl) {
    throw new ConflictError('A reply was already posted for this finding.', undefined, 'reply_already_posted');
  }
  const repoRow = await repo.getRepo(ctx.pull.repoId);
  if (!repoRow) throw new NotFoundError('Repository not found');

  let gh: GitHubClient;
  try {
    gh = await container.github();
  } catch {
    throw new AppError('github_unavailable', 'Connect a GitHub token to post comments.', 400);
  }

  let comment: PrReviewComment;
  try {
    comment = await gh.createReviewComment({ owner: repoRow.owner, name: repoRow.name }, ctx.pull.number, {
      commitId: ctx.pull.headSha,
      path: ctx.finding.file,
      line: ctx.finding.endLine,
      body,
    });
  } catch (err) {
    // GitHub rejects comments on lines outside the diff / on closed PRs (422).
    const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
    throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
  }

  await repo.setFindingReply(findingId, comment.html_url, new Date());
  return comment;
}
