import type {
  JenkinsBuildInfo,
  JenkinsClient,
  JenkinsConnectionParams,
  JenkinsErrorCode,
  JenkinsValidationResult,
} from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';

const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
/** Cap for JSON API responses (artifacts carry their own cap). */
const MAX_JSON_BYTES = 5 * 1024 * 1024;

/**
 * Fetch-based Jenkins REST client for ONE connection (S-AC-84).
 *
 * - Every URL is built from the saved base URL plus encoded path segments;
 *   absolute URLs found in Jenkins JSON are never followed.
 * - Redirects are handled by hand: same-origin only, at most 3 hops; any
 *   cross-origin hop is `jenkins_unreachable`, so Basic auth never leaves
 *   the connection's origin.
 * - 10 s timeout per call. Error messages never contain the token.
 * - Auth is an API token, which Jenkins exempts from CSRF crumbs.
 */
export class FetchJenkinsClient implements JenkinsClient {
  private readonly base: URL;
  private readonly auth: string;

  constructor(params: JenkinsConnectionParams) {
    this.base = new URL(params.baseUrl.replace(/\/+$/, ''));
    this.auth = `Basic ${Buffer.from(`${params.username}:${params.token}`).toString('base64')}`;
  }

  async whoAmI(): Promise<{ user: string; version: string }> {
    const res = await this.request('/whoAmI/api/json');
    const version = res.headers.get('x-jenkins');
    if (!version) throw jenkinsError('jenkins_not_jenkins', 'The server is not a Jenkins instance');
    if (res.status === 404) throw jenkinsError('jenkins_not_jenkins', 'The server is not a Jenkins instance');
    this.assertOk(res);
    const body = (await readJson(res)) as { name?: unknown; authenticated?: unknown };
    const user = typeof body.name === 'string' ? body.name : '';
    if (body.authenticated !== true || user === '' || user === 'anonymous') {
      throw jenkinsError('jenkins_auth_failed', 'Jenkins did not accept the username or API token');
    }
    return { user, version };
  }

  async itemClass(jobPath: string): Promise<string | null> {
    const res = await this.request(`${jobSegments(jobPath)}/api/json?tree=_class`);
    if (res.status === 404) return null;
    this.assertOk(res);
    const body = (await readJson(res)) as { _class?: unknown };
    return typeof body._class === 'string' ? body._class : null;
  }

  async listChildJobs(jobPath: string): Promise<string[]> {
    const res = await this.request(`${jobSegments(jobPath)}/api/json?tree=jobs%5Bname%5D`);
    if (res.status === 404) throw jenkinsError('jenkins_job_not_found', 'Jenkins job not found');
    this.assertOk(res);
    const body = (await readJson(res)) as { jobs?: { name?: unknown }[] };
    return (body.jobs ?? [])
      .map((j) => j.name)
      .filter((n): n is string => typeof n === 'string');
  }

  async listBuilds(jobPath: string, limit: number): Promise<JenkinsBuildInfo[]> {
    const tree = encodeURIComponent(`builds[number,building,result,timestamp]{0,${limit}}`);
    const res = await this.request(`${jobSegments(jobPath)}/api/json?tree=${tree}`);
    if (res.status === 404) throw jenkinsError('jenkins_job_not_found', 'Jenkins job not found');
    this.assertOk(res);
    const body = (await readJson(res)) as { builds?: Record<string, unknown>[] };
    const out: JenkinsBuildInfo[] = [];
    for (const b of body.builds ?? []) {
      if (typeof b.number !== 'number' || typeof b.timestamp !== 'number') continue;
      out.push({
        number: b.number,
        building: b.building === true,
        result: typeof b.result === 'string' ? b.result : null,
        timestamp: b.timestamp,
      });
    }
    return out;
  }

  async getArtifact(
    jobPath: string,
    build: number,
    file: string,
    maxBytes: number,
  ): Promise<Uint8Array | null> {
    const path = `${jobSegments(jobPath)}/${build}/artifact/${encodeURIComponent(file)}`;
    const res = await this.request(path);
    if (res.status === 404) return null;
    this.assertOk(res);
    return readCapped(res, maxBytes, () =>
      jenkinsError('artifact_too_large', `Artifact exceeds ${maxBytes} bytes`),
    );
  }

  async listPlugins(): Promise<string[]> {
    const tree = encodeURIComponent('plugins[shortName,active]');
    const res = await this.request(`/pluginManager/api/json?tree=${tree}`);
    this.assertOk(res);
    const body = (await readJson(res)) as { plugins?: { shortName?: unknown; active?: unknown }[] };
    return (body.plugins ?? [])
      .filter((p) => p.active !== false && typeof p.shortName === 'string')
      .map((p) => p.shortName as string);
  }

  async createItem(parentPath: string, name: string, configXml: string): Promise<void> {
    const parent = parentPath ? jobSegments(parentPath) : '';
    const res = await this.request(`${parent}/createItem?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      body: configXml,
    });
    if (res.ok) return;
    if (res.status === 401 || res.status === 403) this.assertOk(res);
    if (res.status >= 500) this.assertOk(res);
    const text = await readText(res).catch(() => '');
    if (/already exists/i.test(text)) {
      throw jenkinsError('jenkins_item_exists', 'A Jenkins item with this name already exists');
    }
    throw jenkinsError('jenkins_create_failed', `Jenkins refused to create the job (HTTP ${res.status})`);
  }

  async validateJenkinsfile(text: string): Promise<JenkinsValidationResult> {
    const res = await this.request('/pipeline-model-converter/validateJenkinsfile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ jenkinsfile: text }).toString(),
    });
    // No pipeline-model-definition plugin → treat as unreachable (validation skipped).
    if (res.status === 404) throw jenkinsError('jenkins_unreachable', 'Jenkins validator not available');
    this.assertOk(res);
    const body = (await readJson(res)) as {
      data?: { result?: unknown; errors?: unknown };
    };
    const ok = body.data?.result === 'success';
    return { ok, errors: ok ? [] : collectMessages(body.data?.errors).slice(0, 50) };
  }

  jobUrl(jobPath: string, build?: number): string {
    const path = `${jobSegments(jobPath)}/${build === undefined ? '' : `${build}/`}`;
    return `${this.base.href.replace(/\/+$/, '')}${path}`;
  }

  // ---------------------------------------------------------------------------

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    let url = new URL(`${this.base.href.replace(/\/+$/, '')}${path}`);
    for (let hop = 0; ; hop++) {
      let res: Response;
      try {
        res = await fetch(url, {
          ...init,
          redirect: 'manual',
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { ...(init.headers as Record<string, string>), Authorization: this.auth },
        });
      } catch {
        throw jenkinsError('jenkins_unreachable', 'Jenkins did not respond');
      }
      if (res.status < 300 || res.status >= 400) return res;
      const location = res.headers.get('location');
      if (!location || hop >= MAX_REDIRECTS) {
        throw jenkinsError('jenkins_unreachable', 'Jenkins redirected too many times');
      }
      const next = new URL(location, url);
      if (next.origin !== this.base.origin) {
        throw jenkinsError('jenkins_unreachable', 'Jenkins redirected to another host');
      }
      url = next;
    }
  }

  private assertOk(res: Response): void {
    if (res.ok) return;
    if (res.status === 401 || res.status === 403) {
      throw jenkinsError('jenkins_auth_failed', 'Jenkins did not accept the username or API token');
    }
    if (res.status === 404) throw jenkinsError('jenkins_job_not_found', 'Jenkins item not found');
    throw jenkinsError('jenkins_unreachable', `Jenkins answered HTTP ${res.status}`);
  }
}

function jenkinsError(code: JenkinsErrorCode, message: string): AppError {
  return new AppError(code, message, 502);
}

/** `a/b` → `/job/a/job/b` (each segment encoded). */
function jobSegments(jobPath: string): string {
  return jobPath
    .split('/')
    .filter(Boolean)
    .map((seg) => `/job/${encodeURIComponent(seg)}`)
    .join('');
}

async function readCapped(
  res: Response,
  maxBytes: number,
  tooLarge: () => Error,
): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length') ?? NaN);
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw tooLarge();
  }
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw tooLarge();
    }
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

async function readText(res: Response): Promise<string> {
  const bytes = await readCapped(res, MAX_JSON_BYTES, () =>
    jenkinsError('jenkins_unreachable', 'Jenkins response too large'),
  );
  return new TextDecoder().decode(bytes);
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return JSON.parse(await readText(res));
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw jenkinsError('jenkins_not_jenkins', 'Jenkins returned an unexpected response');
  }
}

/** Flatten the validator's nested `errors` into plain strings. */
function collectMessages(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectMessages(v, out);
  else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectMessages(v, out);
  }
  return out;
}
