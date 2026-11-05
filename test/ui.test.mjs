import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { stringify, parse } from '../lib/frontmatter.mjs';
import { KEYS, write as writeConfig } from '../lib/config-cmd.mjs';
import { SCHEMA, validate } from '../lib/config-schema.mjs';
import * as A from '../lib/ui-api.mjs';
import { createUiServer, hostAllowed, isTailnetIp, tailnetAddrs, remoteUrls, tailscaleWanted } from '../lib/ui-server.mjs';

function setup() {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'dm-ui-')));
  const repo = path.join(base, 'proj');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.momentry.json'), '{}\n');
  const box = path.join(repo, 'docs', 'storytelling-material');
  fs.mkdirSync(box, { recursive: true });
  const env = { HOME: path.join(base, 'home'), MOMENTRY_CONFIG: path.join(base, 'config', 'config.json'), MOMENTRY_CACHE: path.join(base, 'cache'), XDG_CONFIG_HOME: path.join(base, 'config-home') };
  const story = (id, data, body) => fs.writeFileSync(path.join(box, `${id}.md`), stringify({ id, date: id.slice(0, 10), status: 'raw', ...data }, body));
  const names = (...list) => {
    const file = path.join(base, 'names.txt');
    fs.writeFileSync(file, `${list.join('\n')}\n`);
    fs.mkdirSync(path.dirname(env.MOMENTRY_CONFIG), { recursive: true });
    fs.writeFileSync(env.MOMENTRY_CONFIG, JSON.stringify({ privacy: { sources: [{ type: 'lines', path: file }] } }));
  };
  return { base, repo, box, env, ctx: { env, cwd: repo }, story, names };
}

const BODY = '\n# Cache cũ\n\n**Bối cảnh:** API chậm.\n**Chuyện gì xảy ra:** Đổi Map sang LRU, p95 từ 800ms xuống 90ms.\n**Bài học:** Đo trước.\n';

test('every config key has a schema entry and values are checked', () => {
  assert.deepEqual([...KEYS].sort(), Object.keys(SCHEMA).sort());
  assert.equal(validate('harvest.runs', 0), 'Reads per session must be at least 1');
  assert.equal(validate('harvest.runs', 2), null);
  assert.match(validate('outsider.enabled', 'yes'), /on or off/);
  assert.equal(validate('box', null), null);
});

test('config write: schema rejects bad values; project scope writes the repo file and refuses user-only keys', () => {
  const { repo, env } = setup();
  assert.throws(() => writeConfig({ cwd: repo, env, key: 'harvest.runs', value: '0' }), /at least 1/);
  writeConfig({ cwd: repo, env, key: 'box', value: 'notes/stories', scope: 'project', repo, parsed: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(repo, '.momentry.json'), 'utf8')), { box: 'notes/stories' });
  assert.throws(() => writeConfig({ cwd: repo, env, key: 'privacy.allowUnchecked', value: true, scope: 'project', repo, parsed: true }), /người dùng/);
});

test('editBody replaces one section, keeps the rest byte for byte, inserts in order and removes', () => {
  const b1 = A.editBody(BODY, { section: 'lesson', text: 'Đo trước khi đổi.' });
  assert.equal(b1, BODY.replace('**Bài học:** Đo trước.', '**Bài học:** Đo trước khi đổi.'));
  const b2 = A.editBody(BODY, { section: 'artefact', text: 'biểu đồ p95' });
  assert.ok(b2.endsWith('**Bài học:** Đo trước.\n**Artefact:** biểu đồ p95\n'));
  const b3 = A.editBody('\n# T\n\n**Bài học:** x\n', { section: 'context', text: 'ngữ cảnh' });
  assert.equal(b3, '\n# T\n\n**Bối cảnh:** ngữ cảnh\n**Bài học:** x\n');
  const b4 = A.editBody(BODY, { section: 'context', text: '  ' });
  assert.ok(!b4.includes('Bối cảnh'));
  assert.equal(A.editBody(BODY, { title: '  Cache  mới ' }).split('\n')[1], '# Cache mới');
  assert.throws(() => A.editBody(BODY, { title: ' ' }), /title/);
});

test('the wall follows the user\'s own Use/Drop choices, gently and only after a few labels', () => {
  const row = (id, data) => ({ id, data: { status: 'raw', ...data }, card: { id } });
  const base = [
    row('a', { signals: ['chi phí'] }), row('b', { signals: ['chi phí'] }), row('c', { signals: ['đo đạc'] }),
    row('d', { signals: ['đo đạc'] }), row('e', { signals: ['đo đạc'] }),
  ];
  assert.deepEqual(A.personalize(base).map((r) => r.id), ['a', 'b', 'c', 'd', 'e']);
  const labelled = [
    ...base,
    row('u1', { status: 'picked', signals: ['đo đạc'] }), row('u2', { status: 'published', signals: ['đo đạc'] }),
    row('x1', { status: 'dropped', signals: ['chi phí'] }),
  ];
  const out = A.personalize(labelled).map((r) => r.id);
  assert.ok(out.indexOf('c') < out.indexOf('a'), out.join(','));
  assert.ok(out.indexOf('e') > 0, 'moves only a few places');
  assert.equal(A.personalize(labelled).find((r) => r.id === 'c').card.forYou, true);
});

test('stars from stakes × strength', () => {
  assert.equal(A.starsOf({}), 1);
  assert.equal(A.starsOf({ stakes: 3, strength: 2 }), 3);
  assert.equal(A.starsOf({ stakes: 1, strength: 2 }), 2);
  assert.equal(A.starsOf({ stakes: 0, strength: 3 }), 1);
});

test('stories: ranked cards in plain words; use/later/drop; edits write the markdown file', () => {
  const { ctx, story, box, names } = setup();
  names('Không Ai');
  story('2026-11-01-weak', { tension: 'none', stakes: 1, strength: 1 }, BODY);
  story('2026-11-02-strong', { tension: 'nho_ma_to', stakes: 3, strength: 3, signals: ['số trước số sau'] }, BODY);
  const cards = A.listStories(ctx);
  assert.deepEqual(cards.map((c) => c.id), ['2026-11-02-strong', '2026-11-01-weak']);
  assert.equal(cards[0].twist, 'Tiny cause, big effect');
  assert.equal(cards[0].title, 'Cache cũ');
  assert.equal(cards[0].stars, 3);
  assert.equal(cards[0].seen, false);

  const key = cards[0].key;
  assert.equal(A.markStory(ctx, key, 'use').status, 'picked');
  assert.equal(parse(fs.readFileSync(path.join(box, '2026-11-02-strong.md'), 'utf8')).data.status, 'picked');
  assert.equal(A.markStory(ctx, key, 'later').later, true);
  assert.equal(parse(fs.readFileSync(path.join(box, '2026-11-02-strong.md'), 'utf8')).data.status, 'picked');
  assert.equal(A.markStory(ctx, key, 'drop').later, false);
  assert.equal(A.markStory(ctx, key, 'raw').status, 'raw');
  assert.throws(() => A.markStory(ctx, key, 'publish-now'), /Unknown action/);

  const s = A.getStory(ctx, key);
  assert.equal(s.sections.what, 'Đổi Map sang LRU, p95 từ 800ms xuống 90ms.');
  assert.equal(A.listStories(ctx)[0].seen, true);
  A.editStory(ctx, key, { section: 'lesson', text: 'Đo p95 trước.' });
  const file = fs.readFileSync(path.join(box, '2026-11-02-strong.md'), 'utf8');
  assert.match(file, /\*\*Bài học:\*\* Đo p95 trước\.\n/);
  assert.match(file, /signals: \[số trước số sau\]/);
});

test('an edit that adds a private name is refused and the file is unchanged', () => {
  const { ctx, story, box, names } = setup();
  names('Nguyễn Văn Bí');
  story('2026-11-02-a', {}, BODY);
  const before = fs.readFileSync(path.join(box, '2026-11-02-a.md'), 'utf8');
  const key = A.listStories(ctx)[0].key;
  assert.throws(() => A.editStory(ctx, key, { section: 'lesson', text: 'Hỏi Nguyễn Văn Bí.' }), (e) => e.status === 422 && /private list/.test(e.message));
  assert.equal(fs.readFileSync(path.join(box, '2026-11-02-a.md'), 'utf8'), before);
});

test('series group stories by thread; cost adds up the ledger by week, project and session', () => {
  const { ctx, story, repo, env } = setup();
  story('2026-11-01-a', { threads: ['cache'] }, BODY);
  story('2026-11-03-b', { threads: ['cache'] }, BODY);
  story('2026-11-02-c', { threads: ['solo'] }, BODY);
  const series = A.listSeries(ctx);
  assert.equal(series.length, 1);
  assert.deepEqual(series[0].stories.map((s) => s.id), ['2026-11-01-a', '2026-11-03-b']);
  assert.equal(series[0].title, 'Cache');

  const now = new Date(2026, 10, 4, 12);
  const at = (d) => new Date(2026, 10, d, 9).toISOString();
  fs.mkdirSync(env.MOMENTRY_CACHE, { recursive: true });
  fs.writeFileSync(path.join(env.MOMENTRY_CACHE, 'ledger.json'), JSON.stringify({ version: 1, sessions: {
    'claude:11111111': { repoRoot: repo, harvests: [{ at: at(3), usd: 0.5, fromLine: 1, toLine: 10, status: 'done' }, { at: at(4), usd: 0.25, fromLine: 11, toLine: 20, status: 'done' }] },
    'codex:22222222': { repoRoot: repo, harvests: [{ at: at(1), usd: 1, fromLine: 1, toLine: 9, status: 'done' }, { at: at(1), usd: null, status: 'failed' }] },
  } }));
  const c = A.costView(ctx, now);
  assert.equal(c.thisWeek, 0.75);
  assert.equal(c.today, 0.25);
  assert.equal(c.budget, 3);
  assert.equal(c.waiting, 0);
  assert.equal(c.lastWeek, 1);
  assert.equal(c.total, 1.75);
  assert.equal(c.unknownReads, 1);
  assert.equal(c.weeks[7].start, '2026-11-02');
  assert.deepEqual(c.byProject, [{ name: 'proj', usd: 1.75 }]);
  assert.equal(A.privacyView(ctx).sent.length, 4);
});

test('quick note goes to the box when names exist, else is held back', async () => {
  const { ctx, base, env, box } = setup();
  const pid = A.listProjects(ctx)[0].id;
  const held = await A.addNote(ctx, { project: pid, title: 'Không có danh sách', note: 'Ghi thử.' });
  assert.equal(held.saved, false);
  assert.match(held.message, /no private name list/);
  const names = path.join(base, 'names.txt');
  fs.writeFileSync(names, 'Ai Đó\n');
  fs.mkdirSync(path.dirname(env.MOMENTRY_CONFIG), { recursive: true });
  fs.writeFileSync(env.MOMENTRY_CONFIG, JSON.stringify({ privacy: { sources: [{ type: 'lines', path: names }] } }));
  const r = await A.addNote(ctx, { project: pid, title: 'Ghi tay', note: 'p95 giảm một nửa.' });
  assert.equal(r.saved, true);
  assert.ok(fs.readdirSync(box).some((f) => f.endsWith('-ghi-tay.md')));
  await assert.rejects(() => A.addNote(ctx, { project: pid, title: ' ', note: '' }), /Write a title/);
});

test('gitignore for the story folder is added once and detected', () => {
  const { repo, env, box } = setup();
  assert.equal(A.ignoreBox(repo, env), true);
  assert.equal(A.ignoreBox(repo, env), false);
  assert.equal(A.isIgnored(repo, box), true);
  assert.match(fs.readFileSync(path.join(repo, '.gitignore'), 'utf8'), /^\/docs\/storytelling-material\/$/m);
});

test('find runs the CLI scan in the background and reports in plain words', async () => {
  const { ctx } = setup();
  const pid = A.listProjects(ctx)[0].id;
  let args = null;
  const listeners = {};
  ctx.spawn = (cmd, a) => { args = a; return { stdout: { resume() {} }, on: (ev, fn) => { listeners[ev] = fn; } }; };
  assert.equal(A.startFind(ctx, { project: pid, max: 3 }).running, true);
  assert.deepEqual(args.slice(1, 4), ['scan', '--max-sessions', '3']);
  listeners.close(4);
  const j = A.jobView(ctx, pid);
  assert.equal(j.state, 'failed');
  assert.match(j.message, /Claude did not answer/);
});

function request(port, { method = 'GET', path: p, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.end(JSON.stringify(body)); else req.end();
  });
}

test('server: token, Host and Origin checks; static files stay inside ui/', async () => {
  const { ctx, story } = setup();
  story('2026-11-02-a', {}, BODY);
  const token = 'x'.repeat(32);
  let port = 0;
  const server = createUiServer({ env: ctx.env, cwd: ctx.cwd, token, port: () => port });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  try {
    const auth = { 'x-momentry-token': token };
    assert.equal((await request(port, { path: '/api/stories' })).status, 401);
    assert.equal((await request(port, { path: '/api/stories', headers: { ...auth, 'x-momentry-token': 'y'.repeat(32) } })).status, 401);
    assert.equal((await request(port, { path: '/api/stories', headers: { ...auth, host: `evil.test:${port}` } })).status, 421);
    assert.equal((await request(port, { path: '/api/stories', headers: { ...auth, origin: 'http://evil.test' } })).status, 403);
    const ok = await request(port, { path: '/api/stories', headers: auth });
    assert.equal(ok.status, 200);
    assert.equal(JSON.parse(ok.body)[0].id, '2026-11-02-a');
    const key = JSON.parse(ok.body)[0].key;
    const marked = await request(port, { method: 'POST', path: `/api/stories/${key}/mark`, headers: { ...auth, 'content-type': 'application/json', origin: `http://127.0.0.1:${port}` }, body: { action: 'use' } });
    assert.equal(JSON.parse(marked.body).status, 'picked');
    const bad = await request(port, { method: 'POST', path: `/api/stories/${key}/mark`, headers: auth, body: { action: 'nope' } });
    assert.equal(bad.status, 400);
    assert.match(JSON.parse(bad.body).error, /Unknown action/);
    const page = await request(port, { path: '/' });
    assert.equal(page.status, 200);
    assert.match(page.headers['content-security-policy'], /default-src 'self'/);
    assert.equal((await request(port, { path: '/%2e%2e/lib/config.mjs' })).status, 404);
    assert.equal((await request(port, { path: `/api/projects/${key.split('/')[0]}/export?t=${token}` })).status, 401);
    const exp = await request(port, { path: `/api/projects/${key.split('/')[0]}/export`, headers: auth });
    assert.equal(exp.status, 200);
    assert.match(exp.headers['content-disposition'], /proj-stories\.md/);
  } finally {
    server.close();
  }
});

test('review fixes: delete keeps a repo whose story folder is the repo itself', () => {
  const { ctx, repo, story, names } = setup();
  names('Không Ai');
  fs.writeFileSync(path.join(repo, '.momentry.json'), JSON.stringify({ box: '.' }));
  fs.writeFileSync(path.join(repo, 'code.js'), 'keep me\n');
  fs.writeFileSync(path.join(repo, '2026-11-02-a.md'), stringify({ id: '2026-11-02-a', date: '2026-11-02', status: 'raw' }, BODY));
  const pid = A.listProjects(ctx)[0].id;
  const r = A.deleteProject(ctx, { project: pid, confirm: 'proj' });
  assert.equal(r.removed, 2); // the story file and .momentry.json
  assert.ok(fs.existsSync(path.join(repo, 'code.js')));
  assert.ok(fs.existsSync(path.join(repo, '.git')));
  assert.ok(!fs.existsSync(path.join(repo, '2026-11-02-a.md')));
  void story;
});

test('review fixes: ids that are not story ids never reach a path; bad scopes and keys are refused', async () => {
  const { ctx, story, names } = setup();
  names('Không Ai');
  story('2026-11-02-a', { links: ['../../etc/passwd', '2026-11-02-a'] }, BODY);
  const pid = A.listProjects(ctx)[0].id;
  assert.throws(() => A.getStory(ctx, `${pid}/..%2F..%2Fx`), (e) => e.status === 404);
  assert.throws(() => A.getStory(ctx, `${pid}/../../x`), (e) => e.status === 404);
  assert.throws(() => A.getStory(ctx, `../x/2026-11-02-a`), (e) => e.status === 404);
  const s = A.getStory(ctx, `${pid}/2026-11-02-a`);
  assert.equal(s.links[0].exists, false);
  assert.throws(() => A.saveSetting(ctx, { key: 'harvest.runs', value: 2, scope: 'x' }), /Unknown settings level/);
  assert.throws(() => A.saveSetting(ctx, { key: 'privacy.allowFile', value: '/tmp/a', scope: 'project', project: pid }), /same for every project/);
  assert.throws(() => A.saveSetting(ctx, { key: 'box', value: '..', scope: 'project', project: pid }), /not the project itself/);
  await assert.rejects(() => A.healthView(ctx, { project: 'ffffffffff' }), (e) => e.status === 404);
});

test('review fixes: section edits keep blank-line spacing and refuse bold labels; no name list means no edit', () => {
  const spaced = '\n# T\n\n**Bối cảnh:** a\n\n**Bài học:** b\n';
  assert.equal(A.editBody(spaced, { section: 'context', text: 'c' }), '\n# T\n\n**Bối cảnh:** c\n\n**Bài học:** b\n');
  assert.equal(A.editBody(spaced, { section: 'artefact', text: 'd' }), '\n# T\n\n**Bối cảnh:** a\n\n**Bài học:** b\n\n**Artefact:** d\n');
  assert.throws(() => A.editBody(BODY, { section: 'lesson', text: 'x\n**Note:** y' }), /bold label/);
  const { ctx, story } = setup();
  story('2026-11-02-a', {}, BODY);
  assert.throws(() => A.editStory(ctx, A.listStories(ctx)[0].key, { section: 'lesson', text: 'y' }), (e) => e.status === 409);
});

test('review fixes: CLI config set keeps text keys as typed and takes 1/0 for switches', () => {
  const { repo, env } = setup();
  writeConfig({ cwd: repo, env, key: 'repo', value: '2024' });
  writeConfig({ cwd: repo, env, key: 'outsider.enabled', value: '0' });
  assert.deepEqual(JSON.parse(fs.readFileSync(env.MOMENTRY_CONFIG, 'utf8')), { repo: '2024', outsider: { enabled: false } });
});

test('a project budget lives in the user config, is ignored in the repo file, and reaches the loader', () => {
  const { ctx, repo, env } = setup();
  const pid = A.listProjects(ctx)[0].id;
  const v = A.saveProjectBudget(ctx, { project: pid, usd: 1.5 });
  assert.equal(v.projects[0].budget, 1.5);
  assert.deepEqual(JSON.parse(fs.readFileSync(env.MOMENTRY_CONFIG, 'utf8')), { budget: { projects: { [repo]: 1.5 } } });
  fs.writeFileSync(path.join(repo, '.momentry.json'), JSON.stringify({ budget: { projects: { [repo]: 99 } } }));
  assert.equal(A.settingsView(ctx).projects[0].budget, 1.5);
  assert.throws(() => A.saveProjectBudget(ctx, { project: pid, usd: -1 }), /at least 0/);
  assert.equal(A.saveProjectBudget(ctx, { project: pid, usd: null }).projects[0].budget, null);
  assert.equal(fs.readFileSync(env.MOMENTRY_CONFIG, 'utf8').trim(), '{}');
});

test('private mode is a user-config flag per project that the repo file cannot turn off', () => {
  const { ctx, repo, env } = setup();
  const pid = A.listProjects(ctx)[0].id;
  assert.equal(A.savePrivateMode(ctx, { project: pid, on: true }).projects[0].privateMode, true);
  fs.writeFileSync(path.join(repo, '.momentry.json'), JSON.stringify({ privacy: { privateProjects: [] } }));
  assert.equal(A.settingsView(ctx).projects[0].privateMode, true);
  assert.deepEqual(A.privacyView(ctx).privateProjects.map((p) => p.name), ['proj']);
  assert.equal(A.savePrivateMode(ctx, { project: pid, on: false }).projects[0].privateMode, false);
  assert.equal(fs.readFileSync(env.MOMENTRY_CONFIG, 'utf8').trim(), '{}');
});

test('review fixes: turning gitignore off removes only our lines', () => {
  const { ctx, repo, env } = setup();
  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules\n\n# keep\n');
  A.ignoreBox(repo, env);
  A.setGitignore(ctx, { project: A.listProjects(ctx)[0].id, on: false });
  assert.equal(fs.readFileSync(path.join(repo, '.gitignore'), 'utf8'), 'node_modules\n\n# keep\n');
});

test('tailnet: only Tailscale addresses and names are accepted, and only when listening there', async () => {
  assert.ok(isTailnetIp('100.64.0.1') && isTailnetIp('100.127.255.254') && isTailnetIp('fd7a:115c:a1e0::1'));
  assert.ok(!isTailnetIp('100.63.0.1') && !isTailnetIp('100.128.0.1') && !isTailnetIp('192.168.1.2') && !isTailnetIp('fd00::1'));
  const ifaces = { lo: [{ address: '127.0.0.1', internal: true }], tailscale0: [{ address: '100.101.102.103', internal: false }, { address: 'fd7a:115c:a1e0::5', internal: false }], eth0: [{ address: '10.0.0.2', internal: false }] };
  assert.deepEqual(tailnetAddrs(ifaces), ['100.101.102.103', 'fd7a:115c:a1e0::5']);
  const tn = ['100.101.102.103', 'fd7a:115c:a1e0::5'];
  assert.ok(hostAllowed('127.0.0.1:4825', 4825, []));
  assert.ok(hostAllowed('100.101.102.103:4825', 4825, tn));
  assert.ok(hostAllowed('[fd7a:115c:a1e0::5]:4825', 4825, tn));
  assert.ok(hostAllowed('box.tail1234.ts.net:4825', 4825, tn));
  assert.ok(!hostAllowed('box.tail1234.ts.net:4825', 4825, []), 'no tailnet listener, no tailnet names');
  assert.ok(!hostAllowed('100.101.102.103:4826', 4825, tn));
  assert.ok(!hostAllowed('evil.test:4825', 4825, tn));
  assert.ok(!hostAllowed('ts.net.evil.test:4825', 4825, tn));
  assert.deepEqual(remoteUrls({ port: 4825, token: 'k', tailnet: ['100.101.102.103'], dnsName: 'box.tail1234.ts.net' }), ['http://box.tail1234.ts.net:4825/#t=k', 'http://100.101.102.103:4825/#t=k']);
  assert.deepEqual(remoteUrls({ port: 4825, token: 'k' }), []);

  const { ctx } = setup();
  const token = 'x'.repeat(32);
  let port = 0;
  let tailnet = [];
  const server = createUiServer({ env: ctx.env, cwd: ctx.cwd, token, port: () => port, tailnet: () => tailnet });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  try {
    const auth = { 'x-momentry-token': token };
    const viaName = { ...auth, host: `box.tail1234.ts.net:${port}`, origin: `http://box.tail1234.ts.net:${port}` };
    assert.equal((await request(port, { path: '/api/stories', headers: viaName })).status, 421);
    tailnet = ['100.101.102.103'];
    assert.equal((await request(port, { path: '/api/stories', headers: viaName })).status, 200);
    assert.equal((await request(port, { path: '/api/stories', headers: { ...viaName, 'x-momentry-token': 'y'.repeat(32) } })).status, 401, 'the access key is still required');
    assert.equal((await request(port, { path: '/api/stories', headers: { ...viaName, origin: 'http://evil.test' } })).status, 403);
  } finally { server.close(); }
});

test('tailnet listening is on by default and off only through the user config', () => {
  const { ctx } = setup();
  assert.equal(tailscaleWanted(ctx.env), true);
  writeConfig({ cwd: ctx.cwd, env: ctx.env, key: 'ui.tailscale', value: false, parsed: true });
  assert.equal(tailscaleWanted(ctx.env), false);
});
