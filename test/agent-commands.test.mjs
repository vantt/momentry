// Agent commands momentry-bip / momentry-ui, the `momentry` skill on every host (Codex and pi through ~/.agents/skills,
// no skill shown twice), migration from older installs (the /bip alias, $CODEX_HOME/skills), clean removal, and the
// `show` / `mark` CLI contract the skill relies on. Temp HOME only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as hosts from '../lib/hosts.mjs';
import * as AF from '../lib/agent-files.mjs';
import { buildChecks } from '../lib/checks.mjs';
import { sha256 } from '../lib/safe-edit.mjs';
import { stringify, parse } from '../lib/frontmatter.mjs';
import * as claude from '../lib/sources/claude.mjs';
import * as agy from '../lib/sources/agy.mjs';

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bin/momentry.mjs');
const PREFIX = '"/home/u/.local/bin/momentry"';

/** A temp HOME with a config dir for every host (default profile only). */
function machine() {
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-agent-'));
  for (const d of ['.claude', '.codex', '.pi/agent', '.omp/agent', '.gemini']) fs.mkdirSync(path.join(h, d), { recursive: true });
  return { h, env: { HOME: h, PATH: '' }, p: (...x) => path.join(h, ...x) };
}

/**
 * Every file momentry owns for each host (default profile). Codex and pi read the shared Agent Skills dir
 * ~/.agents/skills, so their skills sit there once; the old /bip alias is installed nowhere.
 */
const LAYOUT = {
  claude: ['.claude/commands/momentry-bip.md', '.claude/commands/momentry-ui.md', '.claude/skills/momentry/SKILL.md'],
  codex: ['.agents/skills/momentry-bip/SKILL.md', '.agents/skills/momentry-bip/agents/openai.yaml', '.agents/skills/momentry-ui/SKILL.md', '.agents/skills/momentry-ui/agents/openai.yaml', '.agents/skills/momentry/SKILL.md'],
  pi: ['.pi/agent/extensions/momentry.ts', '.pi/agent/prompts/momentry-bip.md', '.pi/agent/prompts/momentry-ui.md', '.agents/skills/momentry/SKILL.md'],
  omp: ['.omp/agent/extensions/momentry.ts', '.omp/agent/commands/momentry-bip.md', '.omp/agent/commands/momentry-ui.md', '.omp/agent/skills/momentry/SKILL.md'],
  agy: ['.gemini/config/skills/momentry-bip/SKILL.md', '.gemini/config/skills/momentry-ui/SKILL.md', '.gemini/config/skills/momentry/SKILL.md'],
};

/** What older versions installed that this one removes (the /bip alias, Codex prompts and $CODEX_HOME/skills, pi's own skill). */
const OLD = [
  '.claude/commands/bip.md', '.pi/agent/prompts/bip.md', '.omp/agent/commands/bip.md', '.gemini/config/skills/bip/SKILL.md', '.codex/prompts/bip.md',
  '.codex/skills/momentry-bip/SKILL.md', '.codex/skills/momentry-bip/agents/openai.yaml', '.codex/skills/momentry-ui/SKILL.md', '.codex/skills/momentry-ui/agents/openai.yaml', '.codex/skills/momentry/SKILL.md',
  '.codex-work/skills/momentry-bip/SKILL.md', '.codex-work/skills/momentry/SKILL.md', '.pi/agent/skills/momentry/SKILL.md',
];

/** Top-level `key: value` lines of a SKILL.md frontmatter (quoted values JSON-decoded, true/false as booleans). */
function front(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(m, 'frontmatter first');
  const val = (v) => (v === 'true' ? true : v === 'false' ? false : v.startsWith('"') ? JSON.parse(v) : v);
  return Object.fromEntries(m[1].split('\n').map((l) => /^([a-z-]+): (.*)$/.exec(l)).map((x) => [x[1], val(x[2])]));
}

/** A markdown file carrying momentry's ownership marker, as an older version wrote it. */
const ownedMd = (body, tag) => `${body}<!-- momentry:${tag} sha256=${sha256(body)} -->\n`;

/**
 * Skill dirs each host reads, by documentation: Codex ~/.agents/skills and the deprecated $CODEX_HOME/skills of every
 * profile; pi <agentDir>/skills and ~/.agents/skills; omp its <agentDir>/skills (other hosts' dirs only when the user
 * opts in, and then identical copies collapse); Claude Code ~/.claude/skills; Antigravity ~/.gemini/config/skills.
 */
const READS = {
  claude: ['.claude/skills'],
  codex: ['.agents/skills', '.codex/skills', '.codex-work/skills'],
  pi: ['.pi/agent/skills', '.agents/skills'],
  omp: ['.omp/agent/skills'],
  agy: ['.gemini/config/skills'],
};
const OMP_OPT_IN = ['.agents/skills', '.claude/skills'];

/** Skill names a host would list from `dirs`, one entry per SKILL.md found. */
function skillNames(p, dirs) {
  return dirs.flatMap((d) => { try { return fs.readdirSync(p(d)).filter((n) => fs.existsSync(p(d, n, 'SKILL.md'))); } catch { return []; } });
}

/** No host lists one of momentry's skills twice; omp's opt-in dirs only hold identical copies of its own. */
function assertNoDuplicateSkills(p) {
  for (const [host, dirs] of Object.entries(READS)) {
    const names = skillNames(p, dirs).filter((n) => n.startsWith('momentry'));
    assert.deepEqual(names, [...new Set(names)], `${host} sees a skill twice: ${names.join(', ')}`);
  }
  const own = p('.omp/agent/skills/momentry/SKILL.md');
  for (const d of OMP_OPT_IN) {
    const other = p(d, 'momentry', 'SKILL.md');
    if (fs.existsSync(other)) assert.equal(fs.readFileSync(other, 'utf8'), fs.readFileSync(own, 'utf8'), `omp collapses ${d}/momentry only when identical`);
  }
}

test('every host gets momentry-bip, momentry-ui and the momentry skill; no /bip alias; no skill shown twice', () => {
  const { env, p } = machine();
  for (const n of hosts.HOST_NAMES) hosts.apply(n, { prefix: PREFIX, env });
  for (const [n, files] of Object.entries(LAYOUT)) {
    for (const f of files) assert.equal(hosts.bipOwnership(p(f)), 'ours', `${n}: ${f}`);
    assert.equal(hosts.inspect(n, PREFIX, env).status, 'ok', n);
    assert.deepEqual(hosts.apply(n, { prefix: PREFIX, env }).changes, [], `${n} idempotent`);
  }
  for (const f of OLD) assert.ok(!fs.existsSync(p(f)), `not installed: ${f}`);
  assert.ok(!fs.existsSync(p('.codex/skills')), 'nothing in the deprecated $CODEX_HOME/skills');
  assert.ok(!fs.existsSync(p('.pi/agent/skills')), 'pi reads the shared copy');
  assertNoDuplicateSkills(p);
  const ui = fs.readFileSync(p('.claude/commands/momentry-ui.md'), 'utf8');
  assert.match(ui, /^---\ndescription: /);
  assert.match(ui, /^ {3}"\/home\/u\/\.local\/bin\/momentry" ui$/m);
  assert.match(ui, /access token/);
  assert.match(fs.readFileSync(p('.pi/agent/prompts/momentry-bip.md'), 'utf8'), /\$ARGUMENTS/);
  // Codex and Antigravity: explicit-only skills named after their dir
  for (const f of ['.agents/skills/momentry-bip/SKILL.md', '.agents/skills/momentry-ui/SKILL.md', '.gemini/config/skills/momentry-ui/SKILL.md', '.gemini/config/skills/momentry-bip/SKILL.md']) {
    const d = front(fs.readFileSync(p(f), 'utf8'));
    assert.equal(d.name, path.basename(path.dirname(f)), f);
    assert.equal(d['disable-model-invocation'], true, f);
    assert.doesNotMatch(fs.readFileSync(p(f), 'utf8'), /\$ARGUMENTS/, f);
  }
  assert.match(fs.readFileSync(p('.agents/skills/momentry-bip/agents/openai.yaml'), 'utf8'), /^policy:\n {2}allow_implicit_invocation: false\n# momentry:policy sha256=[0-9a-f]{64}\n$/);
});

test('every Codex profile shares the one ~/.agents/skills copy; pi alone installs only the momentry skill there', () => {
  const { env, p } = machine();
  fs.mkdirSync(p('.codex-work'));
  const r = hosts.apply('codex', { prefix: PREFIX, env });
  assert.equal(r.changes.filter((c) => c.includes('.agents')).length, 5, 'written once, not once per profile');
  assert.ok(!fs.existsSync(p('.codex-work/skills')));
  assert.equal(hosts.inspect('codex', PREFIX, env).status, 'ok');

  const { env: env2, p: p2 } = machine();
  hosts.apply('pi', { prefix: PREFIX, env: env2 });
  assert.deepEqual(fs.readdirSync(p2('.agents/skills')), ['momentry'], 'Codex\'s commands are not slipped into pi');
});

test('the momentry skill: same text on every host, model-invocable, short description, CLI with --json only', () => {
  const { env, p } = machine();
  for (const n of hosts.HOST_NAMES) hosts.apply(n, { prefix: PREFIX, env });
  const texts = Object.values(LAYOUT).map((fs_) => fs_.find((f) => f.endsWith('/momentry/SKILL.md'))).map((f) => fs.readFileSync(p(f), 'utf8'));
  assert.ok(texts.every((t) => t === texts[0]), 'identical, so hosts that read other hosts\' skill dirs (omp) collapse the copies');
  const d = front(texts[0]);
  assert.equal(d.name, 'momentry');
  assert.equal(d.description, AF.SKILL_DESCRIPTION);
  assert.equal(d['disable-model-invocation'], undefined, 'the model loads it when the user asks about stories');
  assert.ok(d.description.length <= 400, 'only the description sits in every session\'s context');
  assert.match(d.description, /tuần này có chuyện gì hay/);
  assert.ok(texts[0].includes(`Call momentry exactly as \`${PREFIX}\``), 'the installed command, once');
  for (const c of ['list --rank --json', 'show <id> --json', 'mark <id> use|later|drop --json']) assert.ok(texts[0].includes(`\`momentry ${c}\``), c);
  assert.doesNotMatch(texts[0], /mcp/i);
});

test('Windows shim: commands and skills call momentry by name', () => {
  const { env, p } = machine();
  const win = '"C:/Users/a/AppData/Local/momentry/bin/momentry.cmd"';
  for (const n of ['claude', 'agy']) hosts.apply(n, { prefix: win, env });
  assert.match(fs.readFileSync(p('.claude/commands/momentry-ui.md'), 'utf8'), /^ {3}momentry ui$/m);
  assert.match(fs.readFileSync(p('.claude/skills/momentry/SKILL.md'), 'utf8'), /Call momentry exactly as `momentry`/);
  assert.match(fs.readFileSync(p('.gemini/config/skills/momentry-bip/SKILL.md'), 'utf8'), /^ {3}momentry add --by human/m);
});

/**
 * What the previous versions left behind: the /bip alias on Claude, pi, omp and Antigravity, Codex skills in
 * $CODEX_HOME/skills of every profile (and the even older Codex prompt), pi's skill in its own agent dir.
 */
function oldInstall(env, p) {
  fs.mkdirSync(p('.codex-work'));
  for (const n of hosts.HOST_NAMES) hosts.apply(n, { prefix: PREFIX, env });
  for (const root of ['.codex', '.codex-work']) fs.cpSync(p('.agents/skills'), p(root, 'skills'), { recursive: true });
  fs.mkdirSync(p('.pi/agent/skills'), { recursive: true });
  fs.cpSync(p('.agents/skills/momentry'), p('.pi/agent/skills/momentry'), { recursive: true });
  fs.rmSync(p('.agents'), { recursive: true });
  for (const d of ['.claude/commands', '.pi/agent/prompts', '.omp/agent/commands']) fs.copyFileSync(p(d, 'momentry-bip.md'), p(d, 'bip.md'));
  fs.mkdirSync(p('.gemini/config/skills/bip'));
  fs.writeFileSync(p('.gemini/config/skills/bip/SKILL.md'), ownedMd(AF.bipSkill(AF.binFor(PREFIX), 'bip'), 'bip'));
  fs.mkdirSync(p('.codex/prompts'));
  fs.writeFileSync(p('.codex/prompts/bip.md'), hosts.bipText(PREFIX));
  for (const f of OLD) assert.equal(hosts.bipOwnership(p(f)), 'ours', `old install has ${f}`);
}

/** What `update` runs in the new version: doctor --fix without --yes (no consent to connect new profiles). */
async function doctorFix(env, p) {
  const ctx = { cwd: p(), env, platform: process.platform, prefix: PREFIX, connect: false };
  for (const c of buildChecks(ctx).filter((x) => x.code.startsWith('host.'))) await c.apply(ctx);
}

test('update (doctor --fix, no new consent) drops the /bip alias and moves Codex and pi skills to ~/.agents/skills', async () => {
  const { env, p } = machine();
  oldInstall(env, p);
  for (const n of hosts.HOST_NAMES) {
    const s = hosts.inspect(n, PREFIX, env);
    assert.equal(s.status, 'stale', `${n}: ${s.detail}`);
    assert.deepEqual(s.missing, [], `${n}: a connected profile is not "missing", so repair needs no consent`);
  }
  await doctorFix(env, p);
  for (const [n, files] of Object.entries(LAYOUT)) {
    for (const f of files) assert.equal(hosts.bipOwnership(p(f)), 'ours', `${n}: ${f}`);
    assert.equal(hosts.inspect(n, PREFIX, env).status, 'ok', n);
  }
  for (const f of OLD) assert.ok(!fs.existsSync(p(f)), `removed: ${f}`);
  for (const d of ['.codex/skills', '.codex-work/skills', '.pi/agent/skills']) assert.deepEqual(fs.readdirSync(p(d)), [], `${d}: emptied skill dirs pruned`);
  assert.ok(!fs.existsSync(p('.gemini/config/skills/bip')), 'Antigravity alias dir pruned');
  assertNoDuplicateSkills(p);
});

test('connect migrates too; files the user edited stay, and doctor says when a host would see a skill twice', async () => {
  const { env, p } = machine();
  oldInstall(env, p);
  const tweak = (f) => fs.writeFileSync(p(f), fs.readFileSync(p(f), 'utf8').replace('Việc của bạn:', 'Việc của bạn (my tweak):'));
  tweak('.claude/commands/bip.md');
  tweak('.codex/skills/momentry-bip/SKILL.md');
  assert.equal(hosts.bipOwnership(p('.claude/commands/bip.md')), 'edited');
  const r = hosts.apply('codex', { prefix: PREFIX, env });
  assert.ok(r.skipped.some((s) => s.includes(p('.codex/skills/momentry-bip/SKILL.md')) && /hai lần/.test(s)), r.skipped.join('\n'));
  assert.match(fs.readFileSync(p('.codex/skills/momentry-bip/SKILL.md'), 'utf8'), /my tweak/);
  assert.ok(fs.existsSync(p('.codex/skills/momentry-bip/agents/openai.yaml')), 'the policy of an edited skill stays with it');
  assert.ok(!fs.existsSync(p('.codex/skills/momentry-ui')) && !fs.existsSync(p('.codex-work/skills/momentry-bip')), 'unedited ones moved');
  const s = hosts.inspect('codex', PREFIX, env);
  assert.equal(s.status, 'foreign');
  assert.match(s.detail, /hai lần/);

  const c = hosts.apply('claude', { prefix: PREFIX, env });
  assert.ok(c.skipped.some((x) => x.includes('bip.md')), 'the edited alias is reported once and kept');
  assert.match(fs.readFileSync(p('.claude/commands/bip.md'), 'utf8'), /my tweak/);
  assert.equal(hosts.inspect('claude', PREFIX, env).status, 'ok', 'an edited alias is just the user\'s own command now');
  await doctorFix(env, p);
  assert.match(fs.readFileSync(p('.claude/commands/bip.md'), 'utf8'), /my tweak/, 'doctor --fix keeps it too');

  // pi: the user's own skill named momentry in pi's dir would collide with the shared one, so doctor says so
  fs.mkdirSync(p('.pi/agent/skills/momentry'), { recursive: true });
  fs.writeFileSync(p('.pi/agent/skills/momentry/SKILL.md'), '---\nname: momentry\ndescription: mine\n---\n');
  assert.match(hosts.inspect('pi', PREFIX, env).detail, /hai lần/);
});

test('a profile never connected stays "missing" (needs consent); a user\'s own file under an old name is left alone', () => {
  const { env, p } = machine();
  const s = hosts.inspect('claude', PREFIX, env);
  assert.equal(s.status, 'missing');
  assert.deepEqual(s.missing, [p('.claude')]);
  hosts.apply('codex', { prefix: PREFIX, env });
  fs.mkdirSync(p('.codex/prompts'));
  fs.writeFileSync(p('.codex/prompts/bip.md'), 'my own prompt\n');
  assert.equal(hosts.inspect('codex', PREFIX, env).status, 'ok');
  hosts.apply('codex', { prefix: PREFIX, env });
  hosts.apply('codex', { prefix: PREFIX, remove: true, env });
  assert.equal(fs.readFileSync(p('.codex/prompts/bip.md'), 'utf8'), 'my own prompt\n');
});

test('removing one host keeps the shared skill another connected host still reads', () => {
  const { env, p } = machine();
  for (const n of ['codex', 'pi']) hosts.apply(n, { prefix: PREFIX, env });
  const r = hosts.apply('codex', { prefix: PREFIX, remove: true, env });
  assert.ok(fs.existsSync(p('.agents/skills/momentry/SKILL.md')), 'pi still reads it');
  assert.ok(r.skipped.some((s) => /pi vẫn dùng/.test(s)), r.skipped.join('\n'));
  assert.ok(!fs.existsSync(p('.agents/skills/momentry-bip')) && !fs.existsSync(p('.agents/skills/momentry-ui')), 'Codex-only skills go');
  assert.equal(hosts.inspect('pi', PREFIX, env).status, 'ok');
  hosts.apply('pi', { prefix: PREFIX, remove: true, env });
  assert.deepEqual(fs.readdirSync(p('.agents/skills')), [], 'the last host out removes it');

  for (const n of ['codex', 'pi']) hosts.apply(n, { prefix: PREFIX, env });
  const both = ['codex', 'pi'].map((n) => hosts.apply(n, { prefix: PREFIX, remove: true, removing: ['codex', 'pi'], dryRun: true, env }));
  assert.ok(both[0].changes.some((c) => c.includes(p('.agents/skills/momentry/SKILL.md'))), 'removed together: the plan lists the shared skill');
});

test('remove deletes old and new names, prunes our skill dirs, keeps the user\'s skills and edited files', () => {
  const { env, p } = machine();
  oldInstall(env, p);
  for (const n of hosts.HOST_NAMES) hosts.apply(n, { prefix: PREFIX, env });
  // connect removed the old files; put some back, as on a machine a newer and an older version both touched
  fs.mkdirSync(p('.codex/prompts'), { recursive: true });
  fs.writeFileSync(p('.codex/prompts/bip.md'), hosts.bipText(PREFIX));
  fs.copyFileSync(p('.claude/commands/momentry-bip.md'), p('.claude/commands/bip.md'));
  fs.mkdirSync(p('.claude/skills/mine'));
  fs.writeFileSync(p('.claude/skills/mine/SKILL.md'), '---\nname: mine\n---\n');
  fs.appendFileSync(p('.omp/agent/commands/momentry-ui.md'), 'my tweak\n');
  for (const n of hosts.HOST_NAMES) hosts.apply(n, { prefix: PREFIX, remove: true, env });
  for (const files of Object.values(LAYOUT)) for (const f of files) if (f !== '.omp/agent/commands/momentry-ui.md') assert.ok(!fs.existsSync(p(f)), f);
  for (const f of OLD) assert.ok(!fs.existsSync(p(f)), f);
  assert.ok(fs.existsSync(p('.omp/agent/commands/momentry-ui.md')), 'edited file kept');
  for (const d of ['.claude/skills/momentry', '.agents/skills/momentry-bip', '.agents/skills/momentry-ui', '.agents/skills/momentry', '.gemini/config/skills/momentry']) assert.ok(!fs.existsSync(p(d)), `${d} pruned`);
  assert.ok(fs.existsSync(p('.claude/skills/mine/SKILL.md')), 'user skill kept');
});

test('uninstall removes the commands, old names and places, and the shared skills on every host', async () => {
  const Un = await import('../lib/uninstall.mjs');
  const { env, p } = machine();
  oldInstall(env, p);
  for (const n of ['claude', 'pi']) hosts.apply(n, { prefix: PREFIX, env });
  const plan = Un.plan({ env: { ...env, MOMENTRY_HOME: p('none'), MOMENTRY_INSTALL_DIR: p('nobin') }, prefix: PREFIX, platform: 'linux' });
  const what = plan.steps.map((s) => s.what).join('\n');
  assert.match(what, /momentry-ui\.md/);
  assert.ok(what.includes(p('.agents/skills/momentry/SKILL.md')), 'the shared skill is in the plan');
  assert.equal(Un.execute(plan.steps).failed, null);
  for (const files of Object.values(LAYOUT)) for (const f of files) assert.ok(!fs.existsSync(p(f)), f);
  for (const f of OLD) assert.ok(!fs.existsSync(p(f)), f);
});

test('a user\'s own skill dir under our name is left alone, and no openai.yaml is slipped into it', () => {
  const { env, p } = machine();
  fs.mkdirSync(p('.agents/skills/momentry-bip'), { recursive: true });
  fs.writeFileSync(p('.agents/skills/momentry-bip/SKILL.md'), '---\nname: momentry-bip\ndescription: mine\n---\n');
  const r = hosts.apply('codex', { prefix: PREFIX, env });
  assert.equal(r.skipped.length, 1);
  assert.ok(!fs.existsSync(p('.agents/skills/momentry-bip/agents')));
  assert.equal(hosts.inspect('codex', PREFIX, env).status, 'foreign');
});

// ---------- show / mark ----------

const BODY = '\n# Cache cũ\n\n**Bối cảnh:** API chậm.\n**Chuyện gì xảy ra:** Đổi Map sang LRU, p95 từ 800ms xuống 90ms.\n**Bài học:** Đo trước.\n';

function repo() {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'dm-show-')));
  const root = path.join(base, 'proj');
  const box = path.join(root, 'docs', 'storytelling-material');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.mkdirSync(box, { recursive: true });
  fs.writeFileSync(path.join(root, '.momentry.json'), '{}\n');
  const id = '2026-11-02-cache-lru';
  fs.writeFileSync(path.join(box, `${id}.md`), stringify({ id, date: '2026-11-02', status: 'raw', tension: 'nho_ma_to', stakes: 3, strength: 3 }, BODY));
  const env = { PATH: process.env.PATH, HOME: path.join(base, 'home'), USERPROFILE: path.join(base, 'home'), MOMENTRY_CACHE: path.join(base, 'cache'), MOMENTRY_CONFIG: path.join(base, 'none.json') };
  const run = (args, cwd = root) => {
    const r = spawnSync(process.execPath, [BIN, ...args], { cwd, env, encoding: 'utf8' });
    return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout) };
  };
  return { base, root, box, id, run, file: path.join(box, `${id}.md`) };
}

test('show --json: the story with its sections, read-only; plain text for people', () => {
  const { id, run, file, base } = repo();
  const before = fs.readFileSync(file, 'utf8');
  const r = run(['show', id, '--json']);
  assert.equal(r.code, 0, r.out + r.err);
  const j = r.json();
  assert.equal(j.ok, true);
  assert.equal(j.data.id, id);
  assert.equal(j.data.title, 'Cache cũ');
  assert.equal(j.data.status, 'raw');
  assert.equal(j.data.date, '2026-11-02');
  assert.equal(j.data.sections.what, 'Đổi Map sang LRU, p95 từ 800ms xuống 90ms.');
  assert.equal(j.data.sections.artefact, '');
  assert.equal(j.data.file, file);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'show writes nothing');
  assert.ok(!fs.existsSync(path.join(base, 'cache', 'ui-state.json')), 'show does not mark the story seen');
  const t = run(['show', id]);
  assert.match(t.out, /^# Cache cũ\n/);
  assert.match(t.out, /What happened: Đổi Map sang LRU/);
});

test('show / mark: id checked before anything is read; unknown story and outside a repo are errors with a fix', () => {
  const { run, base } = repo();
  for (const bad of ['../../etc/passwd', '2026-11-02-A', 'cache-lru', '2026-11-02-x/../y']) {
    for (const args of [['show', bad], ['mark', bad, 'use']]) {
      const r = run([...args, '--json']);
      assert.equal(r.code, 2, `${args.join(' ')}: ${r.out}`);
      assert.match(r.json().error.why, /id chuyện sai khuôn/);
    }
  }
  const missing = run(['show', '2026-01-01-nope', '--json']);
  assert.equal(missing.code, 1);
  assert.equal(missing.json().error.code, 'no-story');
  assert.equal(missing.json().error.fix, 'momentry list --rank');
  fs.mkdirSync(path.join(base, 'elsewhere'));
  const outside = run(['show', '2026-11-02-cache-lru', '--json'], path.join(base, 'elsewhere'));
  assert.equal(outside.code, 1);
  assert.equal(outside.json().ok, false);
  assert.equal(run(['show', '--json']).code, 2, 'id required');
});

test('mark use|later|drop --json: same effect as the UI buttons; bad label refused; --dry-run writes nothing', () => {
  const { id, run, file, base, root } = repo();
  const status = () => parse(fs.readFileSync(file, 'utf8')).data.status;
  assert.equal(run(['mark', id, 'publish', '--json']).code, 2);
  const dry = run(['mark', id, 'use', '--dry-run', '--json']);
  assert.equal(dry.code, 0);
  assert.deepEqual(dry.json().data, { dryRun: true, id, action: 'use', status: 'raw' });
  assert.equal(status(), 'raw');

  let j = run(['mark', id, 'use', '--json']).json();
  assert.equal(j.ok, true);
  assert.equal(j.data.action, 'use');
  assert.equal(j.data.status, 'picked');
  assert.equal(status(), 'picked');

  j = run(['mark', id, 'later', '--json']).json();
  assert.equal(j.data.later, true);
  assert.equal(status(), 'picked', 'later is kept on this machine, the file does not change');
  assert.ok(fs.existsSync(path.join(base, 'cache', 'ui-state.json')));

  const dr = run(['mark', id, 'drop', '--json', '--repo', root], base);
  j = dr.json();
  assert.equal(j.ok, true, dr.out);
  assert.equal(j.data.status, 'dropped');
  assert.equal(j.data.later, false);
  assert.equal(status(), 'dropped');
  assert.match(run(['mark', id, 'use']).out, /^đã đánh dấu 2026-11-02-cache-lru: use \(status: picked\)/);
});

test('transcripts: /momentry-bip is marked like /bip (Claude command, Antigravity skill)', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-bipmark-'));
  const user = (content) => JSON.stringify({ cwd: '/r', sessionId: 'x', type: 'user', timestamp: '2026-11-05T09:00:00.000Z', message: { role: 'user', content } });
  const cf = path.join(d, 'c.jsonl');
  fs.writeFileSync(cf, [
    user('<command-message>momentry-bip</command-message>\n<command-name>/momentry-bip</command-name>\n<command-args>p95 xuống 90ms</command-args>'),
    user('<command-message>bip</command-message>\n<command-name>/bip</command-name>\n<command-args>bí danh</command-args>'),
    user('<command-message>momentry-ui</command-message>\n<command-name>/momentry-ui</command-name>\n<command-args></command-args>'),
  ].join('\n') + '\n');
  assert.deepEqual(claude.readEntries(cf).map((e) => [e.bip, e.text]), [[true, '/bip p95 xuống 90ms'], [true, '/bip bí danh']]);
  const af = path.join(d, 'transcript_full.jsonl');
  const step = (i, content) => JSON.stringify({ step_index: i, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: '2026-11-05T09:00:00Z', content });
  fs.writeFileSync(af, [step(0, '/momentry-bip test xanh'), step(1, '/bip cũ'), step(2, '/momentry-ui')].join('\n') + '\n');
  assert.deepEqual(agy.readEntries(af).map((e) => e.bip), [true, true, false]);
});
