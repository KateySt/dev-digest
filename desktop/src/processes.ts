import { utilityProcess, type UtilityProcess } from 'electron';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import log from 'electron-log/main';
import { API_PORT, HOST, WEB_PORT, WEB_URL, dataPaths, resourcesDir } from './config';
import { augmentedPath } from './preflight';

export interface Child {
  name: string;
  proc: UtilityProcess;
  exited: Promise<number>;
}

/** Fork a bundled Node entry as an Electron utilityProcess, piping its output to logs/<name>.log. */
function fork(name: string, modulePath: string, cwd: string, env: Record<string, string>): Child {
  const { logs } = dataPaths();
  mkdirSync(logs, { recursive: true });
  const out = createWriteStream(join(logs, `${name}.log`), { flags: 'a' });
  out.write(`\n--- ${new Date().toISOString()} starting ${name}\n`);

  const proc = utilityProcess.fork(modulePath, [], {
    cwd,
    serviceName: `DevDigest ${name}`,
    stdio: 'pipe',
    env: { ...process.env, PATH: augmentedPath(), NODE_ENV: 'production', ...env } as Record<string, string>,
  });
  proc.stdout?.pipe(out);
  proc.stderr?.pipe(out);
  const exited = new Promise<number>((resolve) => {
    proc.once('exit', (code) => {
      log.info(`${name} exited with code ${code}`);
      out.end();
      resolve(code);
    });
  });
  return { name, proc, exited };
}

/**
 * `secretsKey` (null = keep secrets.json plaintext) is handed over the parent
 * port when the API asks for it at boot — never through env (server/src/desktop.ts).
 */
export function startApi(secretsKey: string | null): Child {
  const root = join(resourcesDir(), 'server');
  const { pgdata, workspace, secrets } = dataPaths();
  const child = fork('api', join(root, 'app', 'desktop.mjs'), root, {
    API_HOST: HOST,
    API_PORT: String(API_PORT),
    WEB_ORIGIN: WEB_URL,
    PGLITE_DATA_DIR: pgdata,
    DEVDIGEST_CLONE_DIR: workspace,
    DEVDIGEST_SECRETS_PATH: secrets,
    DEVDIGEST_SECRETS_KEY_FROM_PARENT: '1',
  });
  child.proc.on('message', (msg: { type?: unknown } | null) => {
    if (msg?.type === 'secrets-key-request') child.proc.postMessage({ type: 'secrets-key', key: secretsKey });
  });
  return child;
}

export function startWeb(): Child {
  const root = join(resourcesDir(), 'web');
  return fork('web', join(root, 'server.js'), root, {
    HOSTNAME: HOST,
    PORT: String(WEB_PORT),
  });
}

/** Resolve once `url` answers 2xx, or reject when the child dies / the timeout passes. */
export async function waitForHttp(url: string, child: Child, timeoutMs = 60_000): Promise<void> {
  let dead = false;
  void child.exited.then(() => (dead = true));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (dead) throw new Error(`${child.name} exited during startup`);
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${child.name} did not become ready within ${timeoutMs / 1000}s`);
}

/**
 * Stop a child. The API gets a `shutdown` message first so PGlite flushes and
 * closes its data dir (on Windows kill() terminates without any signal).
 */
export async function stop(child: Child, graceful: boolean, timeoutMs = 8_000): Promise<void> {
  if (child.proc.pid === undefined) return;
  if (graceful) {
    child.proc.postMessage('shutdown');
    const done = await Promise.race([
      child.exited.then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), timeoutMs)),
    ]);
    if (done) return;
    log.warn(`${child.name} did not exit in ${timeoutMs}ms — killing`);
  }
  child.proc.kill();
  await child.exited;
}
