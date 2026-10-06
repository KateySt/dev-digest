import { simpleGit } from 'simple-git';

/**
 * Working-tree status port (SPEC-04 S-AC-28) — separate from `GitClient`
 * (`simple-git.ts`, vendored interface in `src/vendor/shared/adapters.ts`,
 * do-not-touch) because this is a server-owned need (has the clone's working
 * tree been edited locally, e.g. by Project Context's save-to-clone path)
 * that has nothing to do with the shared clone/diff/blame contract every
 * other module already depends on. Follows the `adapters/tokenizer/index.ts`
 * precedent: interface + implementation together in one file.
 */
export interface WorkingTreeStatus {
  /**
   * Repo-relative (posix) paths modified in the working tree but not
   * committed — staged or not, tracked-modified or newly created. Never
   * throws: an unreadable/non-git `clonePath` degrades to `[]` so callers
   * (repo-intel's resync refusal) never fail a request over this check.
   */
  modifiedPaths(clonePath: string): Promise<string[]>;
}

export class SimpleGitWorkingTreeStatus implements WorkingTreeStatus {
  async modifiedPaths(clonePath: string): Promise<string[]> {
    try {
      const status = await simpleGit(clonePath).status();
      const paths = new Set<string>();
      for (const f of status.files) paths.add(f.path.split('\\').join('/'));
      return [...paths];
    } catch {
      return [];
    }
  }
}
