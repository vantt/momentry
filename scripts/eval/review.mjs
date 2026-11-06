#!/usr/bin/env node
// Local page for reviewing label files: tick `t`, drop rows, add stories momentry found, mark a session reviewed.
// Reads and writes the same markdown files the harness reads (scripts/eval/README.md). Listens on 127.0.0.1 and,
// unless --local, on this machine's Tailscale addresses (same rules as `momentry ui`); every API call needs the key.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { makeLabel, slugAll, idSlug, matches, ANGLE_VERDICTS, UNDERSTOOD } from './labels.mjs';
import { tailnetAddrs, hostAllowed, magicDnsName } from '../../lib/ui-server.mjs';
import { assignCodes, normalizeCode } from '../../lib/story-code.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const COLS = ['#', 'slug', 'tiêu đề', 'dòng', 'keywords', 't', 'lý do'];
const FIELD = { slug: 'slug', 'tieu-de': 'title', title: 'title', dong: 'lines', lines: 'lines', keywords: 'keywords', t: 't', 'ly-do': 'why', why: 'why', min: 'min' };
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const cell = (v) => String(v ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '/').trim();

/**
 * Splits a label file into frontmatter fields, its raw text and editable rows.
 * @param {string} text @returns {{meta: Record<string, string>, front: string, rows: Record<string, string>[], hasMin: boolean}}
 */
export function readLabelFile(text) {
  const lines = String(text).split(/\r?\n/);
  let i = 0;
  const meta = {};
  let front = '';
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, k) => k > 0 && l.trim() === '---');
    if (end < 0) throw new Error('frontmatter không đóng');
    for (const l of lines.slice(1, end)) { const m = /^([\w-]+):\s*(.*)$/.exec(l); if (m) meta[m[1]] = m[2]; }
    front = lines.slice(0, end + 1).join('\n');
    i = end + 1;
  }
  const rows = [];
  let cols = null;
  let hasMin = false;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) { if (cols) cols = null; continue; }
    const row = cells(line);
    if (!cols) {
      const names = row.map((c) => FIELD[slugAll(c)] ?? null);
      if (names.includes('keywords') && names.includes('t')) { cols = names; hasMin = names.includes('min'); }
      continue;
    }
    if (row.every((c) => /^:?-+:?$/.test(c))) continue;
    const r = { slug: '', title: '', lines: '', keywords: '', t: '', why: '', min: '' };
    cols.forEach((f, k) => { if (f) r[f] = row[k] ?? ''; });
    r.t = /^(x|yes|y|true|1|t)$/i.test(r.t) ? 'x' : '';
    rows.push(r);
  }
  return { meta, front, rows, hasMin };
}

/**
 * Rebuilds a label file from its frontmatter text, a status and rows; every row is checked as the harness would.
 * @param {string} front @param {string} status @param {Record<string, string>[]} rows @param {boolean} [hasMin]
 * @returns {string}
 */
export function writeLabelFile(front, status, rows, hasMin = false) {
  const clean = rows.map((r, k) => {
    const row = { slug: cell(r.slug) || slugAll(r.title).slice(0, 60), title: cell(r.title), lines: cell(r.lines), keywords: cell(r.keywords), t: r.t ? 'x' : '', why: cell(r.why), min: cell(r.min) };
    makeLabel(row, `dòng ${k + 1}`);
    return row;
  });
  let fm = front || '---\n---';
  if (/^status:.*$/m.test(fm)) fm = fm.replace(/^status:.*$/m, `status: ${status}`);
  else fm = fm.replace(/\n---$/, `\nstatus: ${status}\n---`);
  const cols = hasMin ? [...COLS.slice(0, 6), 'min', COLS[6]] : COLS;
  const out = [fm, `| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`];
  clean.forEach((r, k) => {
    const v = [String(k + 1), r.slug, r.title, r.lines, r.keywords, r.t, ...(hasMin ? [r.min] : []), r.why];
    out.push(`| ${v.join(' | ')} |`);
  });
  return `${out.join('\n')}\n`;
}

const newest = (dir, filter) => { try { return fs.readdirSync(dir).filter(filter).sort().map((f) => path.join(dir, f)).at(-1) ?? null; } catch { return null; } };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

const runNo = (dir) => Number(path.basename(dir));
const newestRun = (runs) => { try { return fs.readdirSync(runs).filter((f) => /^\d+$/.test(f)).map(Number).sort((a, b) => a - b).map((n) => path.join(runs, String(n))).at(-1) ?? null; } catch { return null; } };

/**
 * The earlier angle of each story, to show beside the new one: `prevAngle` / `prevAudience` written into the capture
 * (a trial that redid angles), else the angle of the same story (id without date) in the run before the newest.
 */
function previousAngles(runs, run, cap) {
  const out = new Map();
  for (const s of cap?.ranked ?? []) if (typeof s.prevAngle === 'string') out.set(s.id, { angle: s.prevAngle, audience: s.prevAudience ?? null });
  if (out.size) return out;
  const before = run && runNo(run) > 1 ? readJson(path.join(runs, String(runNo(run) - 1), 'capture.json')) : null;
  const byId = new Map((before?.ranked ?? []).map((s) => [idSlug(s.id), s]));
  for (const s of cap?.ranked ?? []) {
    const p = byId.get(idSlug(s.id));
    if (typeof p?.angle === 'string') out.set(s.id, { angle: p.angle, audience: p.audience ?? null });
  }
  return out;
}

/** Story code of each story in a capture (stored `code`, else computed as in the box). @returns {Map<string, string>} */
const captureCodes = (cap) => assignCodes((cap?.ranked ?? []).map((s) => ({ id: s.id, data: { code: s.code } })));

/**
 * Story id in the newest capture of a session for an id or a story code (any case, `M-` optional); the input itself
 * when nothing matches (the caller reports it).
 */
function captureStoryId(dataDir, id, ref) {
  const code = normalizeCode(ref);
  if (!code) return ref;
  const run = newestRun(path.join(dataDir, id, 'runs'));
  const codes = captureCodes(run && readJson(path.join(run, 'capture.json')));
  return [...codes].find(([, c]) => c === code)?.[0] ?? ref;
}

/**
 * Stories momentry found in the newest capture of a session, and per-label rank from the newest scored replay.
 * `matched` is judged on the title only (the capture keeps no body), so it is a hint for spotting missing answers.
 */
function context(dataDir, id, rows) {
  const labels = rows.flatMap((r) => { try { return [makeLabel(r, '')]; } catch { return []; } });
  const runs = path.join(dataDir, id, 'runs');
  const run = newestRun(runs);
  const cap = run && readJson(path.join(run, 'capture.json'));
  const prev = previousAngles(runs, run, cap);
  const res = readJson(newest(path.join(dataDir, 'results'), (f) => f.endsWith('.json') && !f.includes('capture')) ?? '');
  const row = res?.rows?.find((r) => r.id === id && r.rank);
  const ranks = Object.fromEntries((row?.rank?.perLabel ?? []).map((p) => [p.name, p.rank]));
  const codes = captureCodes(cap);
  const stories = (cap?.ranked ?? []).map((s) => {
    const story = { id: s.id, data: { hook: s.title } };
    const p = prev.get(s.id);
    return {
      id: s.id, code: codes.get(s.id), slug: idSlug(s.id), title: s.title, matched: labels.some((l) => matches(story, l)), angle: s.angle ?? null, audience: s.audience ?? null,
      spine: s.spine ?? null, completeness: s.completeness ?? null,
      prevAngle: p && p.angle !== s.angle ? p.angle : null, prevAudience: p && p.angle !== s.angle ? p.audience : null,
    };
  });
  // the angle of the best-ranked found story matching each answer row (same title-only match as `matched`)
  const withAngle = rows.map((r) => {
    let l;
    try { l = makeLabel(r, ''); } catch { return r; }
    const s = stories.find((x) => x.angle && x.angle !== 'none' && matches({ id: x.id, data: { hook: x.title } }, l));
    return s ? { ...r, angle: s.angle, angleStory: s.id } : r;
  });
  return { stories, rows: withAngle, ranks, total: row?.stories ?? null, ...readAngleChecks(dataDir, id) };
}

const angleFile = (dataDir, id) => path.join(dataDir, 'angle-labels', `${id}.json`);

/**
 * A session's angle check: verdict per story id (`angleChecks`) and the answer to "understood without asking?"
 * (`understood`, yes / no), {} when none saved yet.
 */
function readAngleChecks(dataDir, id) {
  const entries = Object.entries(readJson(angleFile(dataDir, id))?.stories ?? {}).filter(([, v]) => v && typeof v === 'object');
  return {
    angleChecks: Object.fromEntries(entries.filter(([, v]) => Object.hasOwn(ANGLE_VERDICTS, v.verdict)).map(([k, v]) => [k, v.verdict])),
    understood: Object.fromEntries(entries.filter(([, v]) => Object.hasOwn(UNDERSTOOD, v.understood)).map(([k, v]) => [k, v.understood])),
  };
}

/**
 * Saves (or clears, null) one answer about a story with an angle in the newest capture: the verdict, or `understood`
 * (yes / no). The other answer is kept. The file keeps the angle text it judged, so a later prompt change can be
 * compared. Private: folder 0700, file 0600.
 * @param {string} dataDir @param {string} id @param {string} storyId @param {'verdict'|'understood'} field @param {string|null} value
 */
function saveAngleCheck(dataDir, id, storyId, field, value) {
  const allowed = field === 'understood' ? UNDERSTOOD : ANGLE_VERDICTS;
  if (value !== null && !Object.hasOwn(allowed, value)) throw Object.assign(new Error(field === 'understood' ? 'câu trả lời lạ' : 'nhãn góc kể lạ'), { status: 400 });
  const run = newestRun(path.join(dataDir, id, 'runs'));
  const s = (run && readJson(path.join(run, 'capture.json')))?.ranked?.find((x) => x.id === storyId);
  if (!s?.angle || s.angle === 'none') throw Object.assign(new Error('chuyện này không có góc kể trong bản chụp mới nhất'), { status: 400 });
  const file = angleFile(dataDir, id);
  const cur = readJson(file) ?? {};
  const stories = cur.stories && typeof cur.stories === 'object' ? cur.stories : {};
  const { verdict: v0, understood: u0 } = stories[storyId] && typeof stories[storyId] === 'object' ? stories[storyId] : {};
  const next = { verdict: v0, understood: u0, [field]: value ?? undefined };
  if (!next.verdict && !next.understood) delete stories[storyId];
  else stories[storyId] = { ...(next.verdict ? { verdict: next.verdict } : {}), ...(next.understood ? { understood: next.understood } : {}), angle: s.angle, at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ session: id, stories }, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
  return readAngleChecks(dataDir, id);
}

const PAGE = fs.readFileSync(path.join(HERE, 'review.html'), 'utf8');

/** @param {{labels: string, data: string, key: string, tailnet?: string[]}} o */
export function createReviewServer(o) {
  const file = (id) => {
    if (!/^[\w-]+$/.test(id)) throw Object.assign(new Error('id sai'), { status: 400 });
    const f = path.join(o.labels, `${id}.md`);
    if (!fs.existsSync(f)) throw Object.assign(new Error('không có file nhãn'), { status: 404 });
    return f;
  };
  const send = (res, status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  return http.createServer(async (req, res) => {
    try {
      const port = req.socket.localPort;
      const tn = o.tailnet ?? [];
      if (!hostAllowed(req.headers.host, port, tn)) return send(res, 421, 'wrong host', 'text/plain');
      const origin = req.headers.origin;
      if (origin && !(origin.startsWith('http://') && hostAllowed(origin.slice(7), port, tn))) return send(res, 403, { error: 'origin' });
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      if (url.pathname === '/') return send(res, 200, PAGE, 'text/html; charset=utf-8');
      if (req.headers['x-key'] !== o.key) return send(res, 401, { error: 'Thiếu khoá: mở lại link in ra từ lệnh review.' });
      if (req.method === 'GET' && url.pathname === '/api/sessions') {
        const ids = fs.readdirSync(o.labels).filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => f.slice(0, -3)).sort();
        return send(res, 200, ids.map((id) => {
          const { meta, rows } = readLabelFile(fs.readFileSync(file(id), 'utf8'));
          return { id, meta, count: rows.length, t: rows.filter((r) => r.t).length };
        }));
      }
      const m = /^\/api\/sessions\/([\w-]+)$/.exec(url.pathname);
      if (m && req.method === 'GET') {
        const { meta, rows } = readLabelFile(fs.readFileSync(file(m[1]), 'utf8'));
        return send(res, 200, { id: m[1], meta, ...context(o.data, m[1], rows) });
      }
      const ma = /^\/api\/sessions\/([\w-]+)\/angle$/.exec(url.pathname);
      if (ma && req.method === 'PUT') {
        file(ma[1]);
        let body = '';
        for await (const c of req) { body += c; if (body.length > 1 << 16) return send(res, 413, { error: 'quá lớn' }); }
        let j;
        try { j = JSON.parse(body); } catch { return send(res, 400, { error: 'dữ liệu sai' }); }
        if (typeof j?.story !== 'string' || !/^[\w-]+$/.test(j.story)) return send(res, 400, { error: 'id chuyện sai' });
        const field = Object.hasOwn(j, 'understood') ? 'understood' : 'verdict';
        return send(res, 200, saveAngleCheck(o.data, ma[1], captureStoryId(o.data, ma[1], j.story), field, j[field] ?? null));
      }
      if (m && req.method === 'PUT') {
        let body = '';
        for await (const c of req) { body += c; if (body.length > 1 << 20) return send(res, 413, { error: 'quá lớn' }); }
        const { rows, status } = JSON.parse(body);
        if (!['draft', 'reviewed'].includes(status) || !Array.isArray(rows)) return send(res, 400, { error: 'dữ liệu sai' });
        const f = file(m[1]);
        const cur = readLabelFile(fs.readFileSync(f, 'utf8'));
        let text;
        try { text = writeLabelFile(cur.front, status, rows, cur.hasMin); } catch (e) { return send(res, 400, { error: e.message }); }
        const tmp = `${f}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, text);
        fs.renameSync(tmp, f);
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'not found' });
    } catch (e) {
      send(res, e.status ?? 500, { error: e.message });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values: a } = parseArgs({ options: { labels: { type: 'string' }, data: { type: 'string' }, port: { type: 'string' }, local: { type: 'boolean' }, key: { type: 'string' } } });
  const base = path.join(ROOT, 'docs/_private/eval');
  const labels = path.resolve(a.labels ?? path.join(base, 'labels'));
  const data = path.resolve(a.data ?? path.join(base, 'new-defaults'));
  // the key stays the same across restarts (private file next to the labels), so an open tab keeps working
  const keyFile = path.join(path.dirname(labels), '.review-key');
  let key = '';
  try { key = fs.readFileSync(keyFile, 'utf8').trim(); } catch { /* first run */ }
  if (a.key) { key = a.key.replace(/^.*#k=/, '').trim(); fs.writeFileSync(keyFile, key, { mode: 0o600 }); }
  if (!/^[\w-]{20,}$/.test(key)) { key = crypto.randomBytes(18).toString('base64url'); fs.writeFileSync(keyFile, key, { mode: 0o600 }); }
  const port = Number(a.port ?? 4826);
  const tailnet = [];
  const listen = (addr) => new Promise((resolve, reject) => {
    const srv = createReviewServer({ labels, data, key, tailnet });
    srv.once('error', reject);
    srv.listen(port, addr, () => resolve(srv));
  });
  try { await listen('127.0.0.1'); } catch (e) {
    console.error(e.code === 'EADDRINUSE' ? `Cổng ${port} đang bận (có thể trang duyệt đã chạy ở terminal khác). Tắt nó, hoặc chọn cổng khác: --port 4827` : e.message);
    process.exit(1);
  }
  if (!a.local) for (const ip of tailnetAddrs()) { try { await listen(ip); tailnet.push(ip); } catch { /* address gone: this machine still works */ } }
  const dns = tailnet.length ? magicDnsName() : null;
  const hp = (h) => (h.includes(':') ? `[${h}]:${port}` : `${h}:${port}`);
  const links = ['127.0.0.1', ...(dns ? [dns] : []), ...tailnet.filter((ip) => !ip.includes(':'))].map((h) => `  http://${hp(h)}/#k=${key}`);
  console.log(`Duyệt nhãn (link có khoá, đừng gửi cho người khác):\n${links.join('\n')}\n${tailnet.length ? 'Máy khác trong tailnet mở được link .ts.net hoặc IP 100.x.' : 'Không thấy Tailscale: chỉ mở được trên máy này.'}\nNhãn: ${labels}\nCtrl+C để tắt.`);
}
