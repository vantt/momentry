import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { render, PROMPTS_DIR } from '../lib/prompts.mjs';

const VARS = {
  harvest: { transcript: '[L1] USER: x', hotspots: 'H1 [L1] exit 1' },
  'harvest-fill': { transcript: '[L1] USER: x', hotspots: 'H1 [L1] exit 1' },
  cluster: { n: 2, r: 1, stories: 'r1-c1-S1 | a | b | lines 1' },
  'hook-tension': { stories: 'M1. a\n   b' },
  stakes: { n: 1, stories: 'M1. a\n   b' },
  outsider: { transcript: '[L1] USER: x', clusters: 'K1. a' },
  bip: { bin: '"/usr/bin/node" "/x/bin/momentry.mjs"' },
  angle: { story: 'hook: a\n\n# b', excerpt: '[L1] USER: x' },
};

test('every prompt file renders, no placeholder left, no leading comment', () => {
  assert.deepEqual(fs.readdirSync(PROMPTS_DIR).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort(), Object.keys(VARS).sort());
  for (const [name, vars] of Object.entries(VARS)) {
    const out = render(name, vars);
    assert.doesNotMatch(out, /\{[a-z][a-z_]*\}/, name);
    assert.doesNotMatch(out, /^\s*<!--/, name);
    assert.doesNotMatch(out, /CHƯA PORT/, name);
    for (const v of Object.values(vars)) assert.ok(out.includes(String(v)), `${name} ${v}`);
  }
});

test('render: missing var throws; values are not re-scanned; unknown name throws', () => {
  assert.throws(() => render('stakes', { n: 1 }), /thiếu giá trị: stories/);
  const out = render('hook-tension', { stories: 'M1. {stories} {n}' });
  assert.ok(out.includes('M1. {stories} {n}'));
  assert.throws(() => render('../x', {}), /prompt lạ/);
});

test('harvest has hotspot answers, no outsider part (PRD 5.4); fill is restricted to missing hotspots', () => {
  for (const name of ['harvest', 'harvest-fill']) {
    const p = render(name, VARS[name]);
    assert.match(p, /Với TỪNG điểm nóng, trả trong "hotspots"/);
    assert.match(p, /KHÔNG tự lọc/);
    assert.doesNotMatch(p, /người ngoài"|"outsider"|Bước người ngoài/);
    assert.ok(p.trimEnd().endsWith('"hotspots":[{"id":"H1","verdict":"story|skip","story_title":"","reason":""}]}'));
  }
  assert.match(render('harvest-fill', VARS['harvest-fill']), /chưa trả lời các điểm nóng/);
});

test('bip template calls add --by human', () => {
  const p = render('bip', VARS.bip);
  assert.ok(p.startsWith('---\ndescription:'));
  assert.ok(p.includes('"/usr/bin/node" "/x/bin/momentry.mjs" add --by human'));
  assert.ok(p.includes('$ARGUMENTS'));
});

// Verbatim check against the experiment's prompts-rank.md, when the repo docs are present.
const RANK = fileURLToPath(new URL('../docs/experiments/2026-11-03-harvest/harness/prompts-rank.md', import.meta.url));
test('cluster, hook-tension, stakes, outsider match prompts-rank.md', { skip: !fs.existsSync(RANK) && 'docs không có' }, () => {
  const blocks = [...fs.readFileSync(RANK, 'utf8').matchAll(/```text\n([\s\S]*?)```/g)].map(m => m[1].trimEnd());
  const toTemplate = b => b
    .replace(/^\{id\} \| \{title\}.*\n\.\.\.$/m, '{stories}')
    .replace(/^\{id\}\. \{title\}\n {3}\{summary\}\n\.\.\.$/m, '{stories}')
    .replace('{N}', '{n}').replace('{R}', '{r}');
  const S = '\u0000S\u0000';
  const want = [
    ['cluster', { n: '{n}', r: '{r}', stories: '{stories}' }],
    ['hook-tension', { stories: '{stories}' }],
    ['stakes', { n: '{n}', stories: '{stories}' }],
  ];
  want.forEach(([name, vars], i) => assert.equal(render(name, vars), toTemplate(blocks[i]), name));
  const out = render('outsider', { transcript: S, clusters: 'S1. {title}\n...' });
  const tail = out.slice(out.indexOf('Một lượt trước'));
  assert.equal(tail, blocks[3].replace('S-id nếu', 'id ở đầu dòng nếu'));
});
