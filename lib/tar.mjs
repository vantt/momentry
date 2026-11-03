// Minimal ustar + gzip, enough for momentry's own release archive. Reading is strict: only regular files and
// directories under one expected top dir, no absolute paths, no `..`, no links or devices, bounded size.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const BLOCK = 512;

function octal(buf, off, len) {
  const s = buf.toString('ascii', off, off + len).replace(/\0.*$/s, '').trim();
  if (!s) return 0;
  if (!/^[0-7]+$/.test(s)) throw new Error(`tar: trường số hỏng: ${JSON.stringify(s)}`);
  return parseInt(s, 8);
}
const str = (buf, off, len) => buf.toString('utf8', off, off + len).replace(/\0.*$/s, '');

function header({ name, size, mode, mtime, type }) {
  const h = Buffer.alloc(BLOCK, 0);
  let n = name, prefix = '';
  if (Buffer.byteLength(n) > 100) {
    const i = n.lastIndexOf('/', n.length - 1 - (n.endsWith('/') ? 1 : 0));
    prefix = n.slice(0, i); n = n.slice(i + 1);
    if (Buffer.byteLength(n) > 100 || Buffer.byteLength(prefix) > 155) throw new Error(`tar: tên quá dài: ${name}`);
  }
  h.write(n, 0, 100, 'utf8');
  h.write(`${mode.toString(8).padStart(7, '0')}\0`, 100, 8, 'ascii');
  h.write('0000000\0', 108, 8, 'ascii');
  h.write('0000000\0', 116, 8, 'ascii');
  h.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  h.write(`${Math.floor(mtime).toString(8).padStart(11, '0')}\0`, 136, 12, 'ascii');
  h.write('        ', 148, 8, 'ascii');
  h.write(type, 156, 1, 'ascii');
  h.write('ustar\0', 257, 6, 'ascii');
  h.write('00', 263, 2, 'ascii');
  h.write(prefix, 345, 155, 'utf8');
  let sum = 0;
  for (const b of h) sum += b;
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return h;
}

/**
 * Deterministic .tar.gz: entries sorted, uid/gid 0, fixed mtime.
 * @param {Array<{name: string, data?: Buffer, mode?: number, dir?: boolean}>} entries
 * @param {{mtime: number}} o mtime in seconds
 * @returns {Buffer}
 */
export function pack(entries, { mtime }) {
  const parts = [];
  for (const e of [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (e.dir) { parts.push(header({ name: e.name.endsWith('/') ? e.name : `${e.name}/`, size: 0, mode: e.mode ?? 0o755, mtime, type: '5' })); continue; }
    const data = e.data ?? Buffer.alloc(0);
    parts.push(header({ name: e.name, size: data.length, mode: e.mode ?? 0o644, mtime, type: '0' }), data);
    const pad = (BLOCK - (data.length % BLOCK)) % BLOCK;
    if (pad) parts.push(Buffer.alloc(pad, 0));
  }
  parts.push(Buffer.alloc(BLOCK * 2, 0));
  return zlib.gzipSync(Buffer.concat(parts), { level: 9 });
}

/** Rejects names that could escape the destination. */
function safeRelative(name) {
  if (!name || name.includes('\0') || name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name)) return false;
  return name.split('/').every((p) => p !== '..' && p !== '.' || p === '');
}

/**
 * Lists entries of a .tar.gz after validating every header.
 * @param {Buffer} gz @param {{maxBytes?: number}} [o]
 * @returns {Array<{name: string, type: 'file'|'dir', mode: number, data: Buffer}>}
 */
export function read(gz, o = {}) {
  const max = o.maxBytes ?? 64 * 1024 * 1024;
  const buf = zlib.gunzipSync(gz, { maxOutputLength: max });
  const out = [];
  let off = 0;
  while (off + BLOCK <= buf.length) {
    const h = buf.subarray(off, off + BLOCK);
    if (h.every((b) => b === 0)) break;
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
    if (sum !== octal(h, 148, 8)) throw new Error('tar: checksum header sai');
    const prefix = str(h, 345, 155);
    const name = (prefix ? `${prefix}/` : '') + str(h, 0, 100);
    const size = octal(h, 124, 12);
    const flag = String.fromCharCode(h[156] || 48);
    if (flag !== '0' && flag !== '5') throw new Error(`tar: loại mục không cho phép (${flag === '1' ? 'hardlink' : flag === '2' ? 'symlink' : flag}): ${name}`);
    if (!safeRelative(name)) throw new Error(`tar: đường dẫn không an toàn: ${name}`);
    off += BLOCK;
    if (off + size > buf.length) throw new Error('tar: file bị cắt cụt');
    out.push({ name: name.replace(/\/$/, ''), type: flag === '5' ? 'dir' : 'file', mode: octal(h, 100, 8) & 0o777, data: buf.subarray(off, off + size) });
    off += Math.ceil(size / BLOCK) * BLOCK;
  }
  return out;
}

/**
 * Extracts an archive whose entries all live under `top/` and match `allow` (first path component after top).
 * @param {Buffer} gz @param {string} dest created; must not exist yet
 * @param {{top: string, allow: string[], maxBytes?: number}} o
 * @returns {string[]} extracted file paths relative to dest
 */
export function extract(gz, dest, o) {
  const entries = read(gz, o);
  const files = [];
  for (const e of entries) {
    const [first, ...rest] = e.name.split('/');
    if (first !== o.top) throw new Error(`tar: mục ngoài ${o.top}/: ${e.name}`);
    if (!rest.length) continue;
    if (!o.allow.includes(rest[0])) throw new Error(`tar: mục không có trong danh sách cho phép: ${e.name}`);
  }
  fs.mkdirSync(dest, { recursive: false });
  for (const e of entries) {
    const rel = e.name.split('/').slice(1).join('/');
    if (!rel) continue;
    const target = path.join(dest, ...rel.split('/'));
    if (e.type === 'dir') { fs.mkdirSync(target, { recursive: true }); continue; }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, e.data, { mode: e.mode & 0o755 });
    files.push(rel);
  }
  return files;
}
