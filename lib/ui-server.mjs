// The one web process behind the UI: node:http on 127.0.0.1 (and this machine's Tailscale addresses unless
// `ui.tailscale` is off), no dependencies, started on demand by `momentry ui`, one instance per machine (state file
// with pid, port and token), gone after a quiet spell with no open tab.
// Static files live in <root>/ui and are plain HTML/CSS/JS so a later native port can serve the same folder.
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { cacheDir as cacheDirOf, ensurePrivateDir, userConfigPath } from './config.mjs';
import { ROOT } from './version.mjs';
import * as A from './ui-api.mjs';

export const DEFAULT_PORT = 4825;
export const UI_DIR = path.join(ROOT, 'ui');
const STATE = 'ui.json';
const MAX_BODY = 1 << 20;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

// ---------- state file (single instance) ----------

export const statePath = (env) => path.join(cacheDirOf(env), STATE);

export function readState(env) {
  try { return JSON.parse(fs.readFileSync(statePath(env), 'utf8')); } catch { return null; }
}

function writeState(env, st) {
  ensurePrivateDir(cacheDirOf(env));
  const file = statePath(env);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(st), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function clearState(env, pid) {
  const st = readState(env);
  if (st && st.pid === pid) fs.rmSync(statePath(env), { force: true });
}

// ---------- tailnet ----------

/** Whether the user's own config leaves tailnet listening on (the default). A repo file cannot change it. */
export function tailscaleWanted(env) {
  try { return JSON.parse(fs.readFileSync(userConfigPath(env), 'utf8'))?.ui?.tailscale !== false; } catch { return true; }
}

/** True for a Tailscale address: IPv4 100.64.0.0/10 (CGNAT range Tailscale assigns) or IPv6 fd7a:115c:a1e0::/48. */
export function isTailnetIp(ip) {
  const m = /^100\.(\d+)\.\d+\.\d+$/.exec(ip);
  if (m) return Number(m[1]) >= 64 && Number(m[1]) <= 127;
  return /^fd7a:115c:a1e0:/i.test(ip);
}

/** This machine's Tailscale addresses, from the network interfaces (empty when Tailscale is not up). */
export function tailnetAddrs(ifaces = os.networkInterfaces()) {
  return Object.values(ifaces).flat().filter((a) => a && !a.internal && isTailnetIp(a.address)).map((a) => a.address);
}

/** Best-effort MagicDNS name of this machine (`host.tailnet.ts.net`), or null. */
function magicDnsName() {
  try {
    const st = JSON.parse(execFileSync('tailscale', ['status', '--json', '--self=true', '--peers=false'], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }));
    const name = String(st?.Self?.DNSName ?? '').replace(/\.$/, '').toLowerCase();
    return name || null;
  } catch { return null; }
}

const hostPort = (h, port) => `${h.includes(':') ? `[${h}]` : h}:${port}`;

/**
 * Host headers the server answers. Besides loopback: the tailnet addresses, the machine's short name and any
 * `*.ts.net` name (MagicDNS names live under Tailscale's own domain, so a stranger's DNS cannot point one here).
 */
export function hostAllowed(host, port, tailnet) {
  const h = String(host ?? '').toLowerCase();
  if (h === `127.0.0.1:${port}` || h === `localhost:${port}`) return true;
  if (!tailnet?.length) return false;
  if (tailnet.some((ip) => h === hostPort(ip.toLowerCase(), port))) return true;
  const name = h.endsWith(`:${port}`) ? h.slice(0, -`:${port}`.length) : null;
  if (!name) return false;
  return name === os.hostname().toLowerCase().split('.')[0] || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.ts\.net$/.test(name);
}

/** Links for other devices on the tailnet, with the access key. */
export function remoteUrls(st) {
  if (!st?.tailnet?.length) return [];
  const hosts = [...(st.dnsName ? [st.dnsName] : []), ...st.tailnet];
  return hosts.map((h) => `http://${hostPort(h, st.port)}/#t=${st.token}`);
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/** Resolves to true when a server answers the ping with this token. */
export function ping(port, token, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/ping', headers: { 'x-momentry-token': token, host: `127.0.0.1:${port}` }, timeout: timeoutMs }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

/** The running instance, if its pid is alive and it answers. */
export async function runningInstance(env) {
  const st = readState(env);
  if (!st || !Number.isInteger(st.port) || !st.token || !alive(st.pid)) return null;
  return (await ping(st.port, st.token)) ? st : null;
}

export const urlOf = (st) => `http://127.0.0.1:${st.port}/#t=${st.token}`;

/**
 * Private launcher page (0600 in the cache dir) that forwards to the URL with the token. The browser is started
 * with this file's path, so the token never appears in a process list or a terminal transcript.
 * @returns {string} absolute path of the launcher file
 */
export function writeLauncher(env, st) {
  const dir = ensurePrivateDir(cacheDirOf(env));
  const file = path.join(dir, 'ui-open.html');
  const url = JSON.stringify(urlOf(st)).replace(/</g, '\\u003c');
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>momentry</title><p>Opening momentry…</p><script>location.replace(${url})</script>\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
  return file;
}

// ---------- request handling ----------

function send(res, status, body, headers = {}) {
  const isText = typeof body === 'string' || Buffer.isBuffer(body);
  const payload = isText ? body : JSON.stringify(body);
  res.writeHead(status, { ...BASE_HEADERS, 'Cache-Control': 'no-store', ...(isText ? {} : { 'Content-Type': 'application/json; charset=utf-8' }), ...headers });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new A.UiError('Request too large.', 413)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new A.UiError('Bad request.', 400)); }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath.slice(1));
  const file = path.resolve(UI_DIR, rel);
  if (!file.startsWith(UI_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
  const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
  const cache = file.endsWith('.woff2') ? 'public, max-age=31536000, immutable' : 'no-cache';
  send(res, 200, fs.readFileSync(file), { 'Content-Type': type, 'Cache-Control': cache });
}

/** Routes: method + path pattern → handler(ctx, params, body, query). */
function routes() {
  const r = [];
  const on = (method, pattern, fn) => r.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), fn });
  on('GET', '/api/ping', () => ({ ok: true }));
  on('GET', '/api/overview', (c) => A.overview(c));
  on('GET', '/api/stories', (c) => A.listStories(c));
  on('GET', '/api/stories/:pid/:id', (c, p) => A.getStory(c, `${p.pid}/${p.id}`));
  on('PATCH', '/api/stories/:pid/:id', (c, p, b) => A.editStory(c, `${p.pid}/${p.id}`, b));
  on('POST', '/api/stories/:pid/:id/mark', (c, p, b) => A.markStory(c, `${p.pid}/${p.id}`, b.action));
  on('GET', '/api/stories/:pid/:id/source', (c, p) => A.storySource(c, `${p.pid}/${p.id}`));
  on('GET', '/api/series', (c) => A.listSeries(c));
  on('POST', '/api/notes', (c, p, b) => A.addNote(c, b));
  on('GET', '/api/privacy', (c) => A.privacyView(c));
  on('POST', '/api/privacy/names', (c, p, b) => { A.addNames(c, b.names); return A.privacyView(c); });
  on('DELETE', '/api/privacy/names', (c, p, b) => { A.removeName(c, b.name); return A.privacyView(c); });
  on('POST', '/api/privacy/release', (c, p, b) => ({ ...A.releaseHeld(c, b), view: A.privacyView(c) }));
  on('GET', '/api/cost', (c) => A.costView(c));
  on('GET', '/api/health', (c, p, b, q) => A.healthView(c, { project: q.get('project') || undefined }));
  on('POST', '/api/health/fix', (c, p, b) => A.healthView(c, { project: b.project, fix: true }));
  on('GET', '/api/agents', (c) => A.agentsView(c));
  on('POST', '/api/agents/connect', (c, p, b) => A.connectAgents(c, b.names));
  on('POST', '/api/projects/on', (c, p, b) => A.turnOn(c, b));
  on('POST', '/api/projects/gitignore', (c, p, b) => A.setGitignore(c, b));
  on('PUT', '/api/projects/budget', (c, p, b) => A.saveProjectBudget(c, b));
  on('PUT', '/api/projects/private', (c, p, b) => A.savePrivateMode(c, b));
  on('PUT', '/api/projects/gather', (c, p, b) => A.saveGathering(c, b));
  on('POST', '/api/projects/delete', (c, p, b) => A.deleteProject(c, b));
  on('POST', '/api/find', (c, p, b) => A.startFind(c, b));
  on('GET', '/api/find/:pid', (c, p) => A.jobView(c, p.pid));
  on('GET', '/api/settings', (c) => A.settingsView(c));
  on('PUT', '/api/settings', (c, p, b) => A.saveSetting(c, b));
  on('POST', '/api/setup/done', (c) => A.finishSetup(c));
  on('GET', '/api/update', (c) => A.checkUpdate(c));
  return r;
}

/**
 * Builds the server (not listening). `onActivity` is called on every authorised API request.
 * @param {{env: NodeJS.ProcessEnv, cwd: string, token: string, port: () => number, tailnet?: () => string[], onActivity?: () => void, spawn?: Function}} o
 */
export function createUiServer(o) {
  const table = routes();
  const ctx = { env: o.env, cwd: o.cwd, spawn: o.spawn };
  const tokenBuf = Buffer.from(o.token);
  const okToken = (t) => { const b = Buffer.from(String(t ?? '')); return b.length === tokenBuf.length && crypto.timingSafeEqual(b, tokenBuf); };

  return http.createServer(async (req, res) => {
    try {
      const port = o.port();
      const tailnet = o.tailnet?.() ?? [];
      const host = String(req.headers.host ?? '').toLowerCase();
      // DNS rebinding: a page on another name that resolves to this machine still sends its own Host
      if (!hostAllowed(host, port, tailnet)) return send(res, 421, 'Wrong host', { 'Content-Type': 'text/plain; charset=utf-8' });
      const origin = req.headers.origin;
      if (origin && !(origin.startsWith('http://') && hostAllowed(origin.slice(7), port, tailnet))) return send(res, 403, { error: 'Forbidden origin.' });
      const url = new URL(req.url, `http://127.0.0.1:${port}`);

      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
        return serveStatic(res, url.pathname);
      }

      const exportMatch = /^\/api\/projects\/([^/]+)\/export$/.exec(url.pathname);
      const token = req.headers['x-momentry-token'];
      if (!okToken(token)) return send(res, 401, { error: 'This page is out of date. Open momentry again from your agent or run: momentry ui' });
      o.onActivity?.();

      if (exportMatch && req.method === 'GET') {
        const f = A.exportProject(ctx, exportMatch[1]);
        return send(res, 200, f.text, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="${f.name.replace(/[^A-Za-z0-9._-]/g, '_')}"` });
      }

      for (const r of table) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(url.pathname);
        if (!m) continue;
        const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : {};
        const params = Object.fromEntries(Object.entries(m.groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)]));
        return send(res, 200, await r.fn(ctx, params, body, url.searchParams));
      }
      return send(res, 404, { error: 'Not found.' });
    } catch (e) {
      const status = e instanceof A.UiError ? e.status : 500;
      send(res, status, { error: e instanceof A.UiError ? e.message : 'Something went wrong. Health may show what to fix.' });
    }
  });
}

/**
 * Runs the server in this process until it has been idle for `idleMs` (no API call; an open tab pings every minute).
 * Also listens on each Tailscale address (same port) unless `tailscale` is false; a tailnet address that cannot be
 * bound is skipped, so a missing or stopped Tailscale never blocks the local UI.
 * @param {{env: NodeJS.ProcessEnv, cwd: string, port?: number, idleMs?: number, tailscale?: boolean, onListen?: (st: object) => void}} o
 * @returns {Promise<{port: number, token: string, close: () => Promise<void>, done: Promise<void>}>}
 */
export async function serve(o) {
  const token = crypto.randomBytes(24).toString('base64url');
  let port = o.port ?? DEFAULT_PORT;
  let last = Date.now();
  let tailnet = [];
  const make = () => createUiServer({ env: o.env, cwd: o.cwd, token, port: () => port, tailnet: () => tailnet, onActivity: () => { last = Date.now(); } });
  const listen = (srv, p, addr) => new Promise((resolve, reject) => {
    const onErr = (e) => { srv.off('listening', onOk); reject(e); };
    const onOk = () => { srv.off('error', onErr); resolve(); };
    srv.once('error', onErr);
    srv.once('listening', onOk);
    srv.listen(p, addr);
  });
  const server = make();
  try { await listen(server, port, '127.0.0.1'); } catch (e) {
    if (e.code !== 'EADDRINUSE') throw e;
    await listen(server, 0, '127.0.0.1'); // the fixed port belongs to someone else; momentry's own instance was ruled out by the caller
  }
  port = server.address().port;
  const servers = [server];
  if (o.tailscale ?? tailscaleWanted(o.env)) {
    for (const ip of tailnetAddrs()) {
      const s = make();
      try { await listen(s, port, ip); servers.push(s); tailnet.push(ip); } catch { /* address gone or port taken there: local UI still works */ }
    }
  }
  const dnsName = tailnet.length ? magicDnsName() : null;
  const st = { pid: process.pid, port, token, startedAt: new Date().toISOString(), ...(tailnet.length ? { tailnet, dnsName } : {}) };
  writeState(o.env, st);
  const idleMs = o.idleMs ?? 10 * 60 * 1000;
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  const close = () => new Promise((r) => {
    clearInterval(timer);
    clearState(o.env, process.pid);
    Promise.all(servers.map((s) => new Promise((ok) => { s.close(() => ok()); s.closeAllConnections?.(); }))).then(() => { resolveDone(); r(); });
  });
  const timer = setInterval(() => { if (Date.now() - last > idleMs && !A.busy()) close(); }, Math.min(30000, idleMs));
  timer.unref?.();
  o.onListen?.(st);
  return { port, token, tailnet, close, done };
}

/** Starts a detached server process and waits until it answers. @returns {Promise<object>} state */
export async function startDetached({ env, cwd, bin, port }) {
  const args = [bin, 'ui', '--serve', ...(port ? ['--port', String(port)] : [])];
  const child = spawn(process.execPath, args, { cwd, env, detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const st = readState(env);
    if (st?.pid === child.pid && (await ping(st.port, st.token))) return st;
  }
  throw new Error('the UI process did not start');
}

/** Opens a URL in the default browser; returns false when no opener is known. */
export function openBrowser(url, env = process.env, platform = process.platform) {
  if (url.startsWith('file:') && platform === 'linux' && env.WSL_DISTRO_NAME) {
    try { url = execFileSync('wslpath', ['-w', new URL(url).pathname], { encoding: 'utf8' }).trim(); } catch { return false; }
  }
  let cmd, args;
  if (platform === 'darwin') { cmd = 'open'; args = [url]; }
  else if (platform === 'win32') { cmd = 'cmd'; args = ['/c', 'start', '', url]; }
  else if (env.WSL_DISTRO_NAME) { cmd = 'cmd.exe'; args = ['/c', 'start', '', url]; }
  else if (env.DISPLAY || env.WAYLAND_DISPLAY) { cmd = 'xdg-open'; args = [url]; }
  else return false;
  try {
    const c = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
    c.on('error', () => {});
    c.unref();
    return true;
  } catch { return false; }
}
