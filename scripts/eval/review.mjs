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
import { makeLabel, slugAll, idSlug, matches } from './labels.mjs';
import { tailnetAddrs, hostAllowed, magicDnsName } from '../../lib/ui-server.mjs';

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

/**
 * Stories momentry found in the newest capture of a session, and per-label rank from the newest scored replay.
 * `matched` is judged on the title only (the capture keeps no body), so it is a hint for spotting missing answers.
 */
function context(dataDir, id, rows) {
  const labels = rows.flatMap((r) => { try { return [makeLabel(r, '')]; } catch { return []; } });
  const runs = path.join(dataDir, id, 'runs');
  const run = newest(runs, (f) => /^\d+$/.test(f));
  const cap = run && readJson(path.join(run, 'capture.json'));
  const res = readJson(newest(path.join(dataDir, 'results'), (f) => f.endsWith('.json') && !f.includes('capture')) ?? '');
  const row = res?.rows?.find((r) => r.id === id && r.rank);
  const ranks = Object.fromEntries((row?.rank?.perLabel ?? []).map((p) => [p.name, p.rank]));
  const stories = (cap?.ranked ?? []).map((s) => {
    const story = { id: s.id, data: { hook: s.title } };
    return { id: s.id, slug: idSlug(s.id), title: s.title, matched: labels.some((l) => matches(story, l)) };
  });
  return { stories, ranks, total: row?.stories ?? null };
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
        return send(res, 200, { id: m[1], meta, rows, ...context(o.data, m[1], rows) });
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
