// hook.log writer (PRD 6.3): one JSON line per event. Never copies story content; never throws.
import fs from 'node:fs';
import path from 'node:path';
import { cacheDir as defaultCacheDir, ensurePrivateDir } from './config.mjs';

/** Field names that may carry story or transcript text; dropped before writing. */
export const CONTENT_KEYS = new Set([
  'title', 'text', 'body', 'note', 'hook', 'summary', 'what_happened', 'context', 'lesson',
  'artefact', 'term', 'terms', 'content', 'prompt', 'result', 'sides', 'stdin',
]);
const MAX_STR = 300;

/**
 * Error -> its kind only (`kind`, a string `code`, or `name`); messages may quote transcript or model text.
 * @param {Error & {kind?: string, code?: any}} e @returns {string}
 */
export function errorKind(e) {
  const k = e?.kind || (typeof e?.code === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(e.code) ? e.code : '') || e?.name || 'Error';
  return String(k).slice(0, 60);
}

/** Errors are reduced to errorKind. @param {Record<string, any>} fields @returns {Record<string, any>} */
export function sanitize(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (CONTENT_KEYS.has(k) || typeof v === 'function') continue;
    if (typeof v === 'string') out[k] = v.length > MAX_STR ? v.slice(0, MAX_STR) + '…' : v;
    else if (v === null || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (v instanceof Error) out[k] = errorKind(v);
    else if (Array.isArray(v) && v.every((x) => typeof x === 'number' || typeof x === 'string')) out[k] = v.slice(0, 50);
  }
  return out;
}

/** @param {{cacheDir?: string}} [opts] */
export function logPath({ cacheDir } = {}) {
  return path.join(cacheDir || defaultCacheDir(), 'hook.log');
}

/**
 * Appends `{ts, pid, event, ...sanitize(fields)}` to hook.log.
 * @param {string} event @param {Record<string, any>} [fields] @param {{cacheDir?: string}} [opts]
 */
export function logEvent(event, fields = {}, { cacheDir } = {}) {
  try {
    const dir = ensurePrivateDir(cacheDir || defaultCacheDir());
    const line = JSON.stringify({ ts: new Date().toISOString(), pid: process.pid, event, ...sanitize(fields) });
    fs.appendFileSync(path.join(dir, 'hook.log'), line + '\n', { mode: 0o600 });
  } catch { /* logging must never break a hook */ }
}
