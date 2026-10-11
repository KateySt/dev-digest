import { app } from 'electron';
import { join } from 'node:path';

// Fixed, uncommon ports: the studio's API base is inlined at client build time
// (NEXT_PUBLIC_API_BASE=http://127.0.0.1:43101 in scripts/stage.mjs + CI).
export const WEB_PORT = 43100;
export const API_PORT = 43101;
export const HOST = '127.0.0.1';
export const WEB_URL = `http://${HOST}:${WEB_PORT}`;
export const API_URL = `http://${HOST}:${API_PORT}`;

export const GITHUB_OWNER = 'KateySt';
export const GITHUB_REPO = 'dev-digest';
export const RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
export const GIT_DOWNLOAD_URL = 'https://git-scm.com/downloads';

/** Staged API + studio: `resources/` next to the exe when packaged, desktop/resources in dev. */
export function resourcesDir(): string {
  return app.isPackaged ? process.resourcesPath : join(__dirname, '..', 'resources');
}

export function dataPaths() {
  const userData = app.getPath('userData');
  return {
    userData,
    pgdata: join(userData, 'pgdata'),
    workspace: join(userData, 'workspace'),
    // API keys + GitHub token entered in Settings (server SecretsProvider).
    secrets: join(userData, 'secrets.json'),
    logs: app.getPath('logs'),
  };
}
