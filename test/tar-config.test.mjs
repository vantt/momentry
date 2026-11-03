import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { pack, read, extract } from '../lib/tar.mjs';
import { runConfig, KEYS } from '../lib/config-cmd.mjs';
import { decide, parseChecksums, vtag } from '../lib/update.mjs';

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

test('tar: round trip, deterministic, long names', () => {
  const long = `top/lib/${'a'.repeat(60)}/${'b'.repeat(60)}.mjs`;
  const entries = [{ name: 'top/bin/x.mjs', data: Buffer.from('#!/usr/bin/env node\n'), mode: 0o755 }, { name: long, data: Buffer.from('y') }];
  const a = pack(entries, { mtime: 1700000000 });
  assert.deepEqual(a, pack([...entries].reverse(), { mtime: 1700000000 }));
  const r = read(a);
  assert.deepEqual(r.map((e) => [e.name, e.data.toString()]), [['top/bin/x.mjs', '#!/usr/bin/env node\n'], [long, 'y']]);
  const d = path.join(tmp('dm-tar-'), 'out');
  assert.deepEqual(extract(a, d, { top: 'top', allow: ['bin', 'lib'] }).sort(), ['bin/x.mjs', long.slice(4)].sort());
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(d, 'bin/x.mjs')).mode & 0o111, 0o111);
});

function rawTar(name, type = '0', data = Buffer.from('x')) {
  // build a single-entry archive by hand, bypassing pack()'s own rules
  const h = Buffer.alloc(512);
  h.write(name, 0); h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
  h.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124); h.write('00000000000\0', 136); h.write('        ', 148);
  h.write(type, 156); h.write('ustar\0', 257); h.write('00', 263);
  let s = 0; for (const b of h) s += b;
  h.write(`${s.toString(8).padStart(6, '0')}\0 `, 148);
  const pad = Buffer.alloc((512 - (data.length % 512)) % 512);
  return zlib.gzipSync(Buffer.concat([h, data, pad, Buffer.alloc(1024)]));
}

test('tar: rejects traversal, absolute paths, links and entries outside the allow-list', () => {
  assert.throws(() => read(rawTar('top/../../etc/passwd')), /không an toàn/);
  assert.throws(() => read(rawTar('/etc/passwd')), /không an toàn/);
  assert.throws(() => read(rawTar('C:/x')), /không an toàn/);
  assert.throws(() => read(rawTar('top/bin/x', '2')), /symlink/);
  assert.throws(() => read(rawTar('top/bin/x', '1')), /hardlink/);
  assert.throws(() => extract(rawTar('top/evil/x'), path.join(tmp('dm-tar-'), 'o'), { top: 'top', allow: ['bin'] }), /danh sách cho phép/);
  assert.throws(() => extract(rawTar('other/bin/x'), path.join(tmp('dm-tar-'), 'o'), { top: 'top', allow: ['bin'] }), /ngoài top/);
  const bad = Buffer.from(zlib.gunzipSync(rawTar('top/bin/x'))); bad[0] ^= 1;
  assert.throws(() => read(zlib.gzipSync(bad)), /checksum/);
});

test('config: set validates and writes atomically, show reports the layer, unknown keys get a suggestion', () => {
  const d = tmp('dm-cfg-');
  const env = { HOME: d, MOMENTRY_CONFIG: path.join(d, 'c', 'config.json') };
  assert.match(runConfig(['path'], { cwd: d, env }).lines[0], /config\.json$/);
  assert.ok(KEYS.includes('harvest.runs') && KEYS.includes('privacy.sources'));
  runConfig(['set', 'harvest.runs', '2'], { cwd: d, env });
  assert.deepEqual(JSON.parse(fs.readFileSync(env.MOMENTRY_CONFIG, 'utf8')), { harvest: { runs: 2 } });
  if (process.platform !== 'win32') assert.equal(fs.statSync(env.MOMENTRY_CONFIG).mode & 0o777, 0o600);
  const s = runConfig(['show'], { cwd: d, env }).data.values;
  assert.deepEqual(s['harvest.runs'], { value: 2, source: 'người dùng' });
  assert.equal(s['harvest.model'].source, 'mặc định');
  assert.throws(() => runConfig(['set', 'harvest.runs', '0'], { cwd: d, env }), /không hợp lệ/);
  assert.deepEqual(JSON.parse(fs.readFileSync(env.MOMENTRY_CONFIG, 'utf8')), { harvest: { runs: 2 } }, 'invalid value leaves the file');
  assert.throws(() => runConfig(['set', 'harvest.run', '2'], { cwd: d, env }), (e) => /khoá lạ/.test(e.message) && /harvest\.runs/.test(e.why));
  runConfig(['unset', 'harvest.runs'], { cwd: d, env });
  assert.deepEqual(JSON.parse(fs.readFileSync(env.MOMENTRY_CONFIG, 'utf8')), {});
  assert.throws(() => runConfig(['frob'], { cwd: d, env }), (e) => e.exitCode === 2);
  assert.ok(JSON.parse(runConfig(['default'], { cwd: d, env }).lines[0]).harvest);
});

test('config privacy-add: one command creates the names file (0600) and declares it once', () => {
  const d = tmp('dm-priv-add-');
  const env = { HOME: d, MOMENTRY_CONFIG: path.join(d, 'c', 'config.json') };
  const r = runConfig(['privacy-add', 'Trần Văn A', 'du-an-x'], { cwd: d, env }).data;
  assert.deepEqual(r.added, ['Trần Văn A', 'du-an-x']);
  assert.equal(r.sourceAdded, true);
  assert.equal(fs.readFileSync(r.file, 'utf8'), 'Trần Văn A\ndu-an-x\n');
  if (process.platform !== 'win32') assert.equal(fs.statSync(r.file).mode & 0o777, 0o600);
  const again = runConfig(['privacy-add', 'du-an-x', 'Người B'], { cwd: d, env }).data;
  assert.deepEqual(again.added, ['Người B']);
  assert.equal(again.sourceAdded, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(env.MOMENTRY_CONFIG, 'utf8')).privacy.sources, [{ type: 'lines', path: r.file }]);
  assert.throws(() => runConfig(['privacy-add'], { cwd: d, env }), (e) => e.exitCode === 2);
});

test('update policy and checksums parsing', () => {
  assert.equal(decide('0.1.0', 'v0.1.1'), 'update');
  assert.equal(decide('0.1.1', 'v0.1.1'), 'same');
  assert.equal(decide('0.1.1', 'v0.1.1', { force: true }), 'update');
  assert.equal(decide('0.2.0', 'v0.1.1'), 'older');
  assert.equal(decide('0.2.0', 'v0.1.1', { explicit: true }), 'update');
  assert.equal(vtag('1.2.3'), 'v1.2.3');
  const m = parseChecksums(`${'a'.repeat(64)}  momentry-v1.0.0.tar.gz\n${'b'.repeat(64)} *install.sh\njunk\n`);
  assert.deepEqual([...m.keys()], ['momentry-v1.0.0.tar.gz', 'install.sh']);
});
