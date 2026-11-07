// Project profile (PRD 5.2 step 13): 3–5 sentences on what a project is, who it is for, its key constraints and current
// goal, written once per project from the documents at its root and in docs/ by one cheap model call, so a story angle
// can open with context an outsider needs. Kept as an editable markdown file in the cache dir:
// <cacheDir>/profiles/<repo>-<project id>.md (lib/project-id.mjs). It is written again only when the documents change and nobody edited it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parse, stringify } from './frontmatter.mjs';
import { ensurePrivateDir } from './config.mjs';
import { projectId, checkoutId } from './project-id.mjs';
import { repoName } from './repo.mjs';
import { render as renderPrompt } from './prompts.mjs';
import { callJson, callUsd } from './llm.mjs';
import { validateProfile } from './validate.mjs';
import { account } from './harvest.mjs';

/**
 * Document kinds read for a profile, in prompt order; per kind the first match wins (repo root before docs/, then by
 * name). Names are matched without regard to case.
 */
export const SOURCE_KINDS = Object.freeze([
  ['readme', /^readme(?:\.[\w.-]+)?$/i],
  ['prd', /^prd[\w.-]*$/i],
  ['vision', /^vision[\w.-]*$/i],
  ['requirements', /^requirements?[\w.-]*$/i],
  ['agents', /^agents\.md$/i],
  ['claude', /^claude\.md$/i],
  ['gemini', /^gemini\.md$/i],
  ['antigravity', /^antigravity\.md$/i],
]);
const TEXT_NAME = /^[^.]+$|\.(?:md|markdown|mdx|txt|rst|adoc|org)$/i;
/** Chars of one document and of all documents sent to the model (about 4.4k tokens in total). */
export const SOURCE_MAX = Object.freeze({ perFile: 4000, total: 14000 });
/** Larger files are never read (a generated dump, not a description). */
const READ_MAX_BYTES = 1 << 20;

/** @typedef {{kind: string, rel: string, text: string}} ProfileSource */

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const safe = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, '_');

/** Files of a dir, sorted by name; [] when unreadable. */
function filesOf(dir) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names.sort().filter((n) => {
    try { const st = fs.statSync(path.join(dir, n)); return st.isFile() && st.size <= READ_MAX_BYTES; } catch { return false; }
  });
}

/**
 * Documents describing the project at `root` and `root/docs`: README*, PRD/prd*, vision*, requirement(s)*, AGENTS.md,
 * CLAUDE.md, GEMINI.md, ANTIGRAVITY.md; first match per kind, whole text (cut only when the prompt is built).
 * @param {string} root @returns {ProfileSource[]}
 */
export function findSources(root) {
  const dirs = [['', root], ['docs', path.join(root, 'docs')]].map(([rel, abs]) => ({ rel, abs, files: filesOf(abs) }));
  const out = [];
  for (const [kind, re] of SOURCE_KINDS) {
    for (const d of dirs) {
      const name = d.files.find((n) => re.test(n) && TEXT_NAME.test(n));
      if (!name) continue;
      let text;
      try { text = fs.readFileSync(path.join(d.abs, name), 'utf8'); } catch { continue; }
      if (!text.trim()) continue;
      out.push({ kind, rel: d.rel ? `${d.rel}/${name}` : name, text });
      break;
    }
  }
  return out;
}

/** Hash of the documents (names and whole text): a change in any of them makes a new profile due. @param {ProfileSource[]} sources */
export function sourceHash(sources) {
  return sha(sources.map((s) => `${s.rel}\0${s.text}\0`).join(''));
}

/** Prompt block: each document under `### <path>`, cut to SOURCE_MAX per file and in total. @param {ProfileSource[]} sources */
export function sourcesText(sources, max = SOURCE_MAX) {
  const parts = [];
  let left = max.total;
  for (const s of sources) {
    if (left <= 0) break;
    const n = Math.min(max.perFile, left);
    const t = s.text.trim();
    const body = t.length > n ? `${t.slice(0, n)} …[+${t.length - n}]` : t;
    parts.push(`### ${s.rel}\n${body}`);
    left -= Math.min(t.length, n);
  }
  return parts.join('\n\n');
}

/**
 * Profile file of a project, named by its project id (the same on every machine, lib/project-id.mjs). A profile an
 * older install filed under the checkout id (path hash) is renamed to it the first time, unless one is there already.
 * @param {string} cacheDir @param {string} root
 */
export function profilePath(cacheDir, root) {
  const dir = path.join(cacheDir, 'profiles');
  const name = safe(repoName(root));
  const file = path.join(dir, `${name}-${projectId(root, { cacheDir })}.md`);
  const legacy = path.join(dir, `${name}-${checkoutId(root)}.md`);
  if (legacy !== file && !fs.existsSync(file) && fs.existsSync(legacy)) {
    try { fs.renameSync(legacy, file); } catch { /* read from the old name next time */ }
  }
  return file;
}

/**
 * The profile file as it is: frontmatter, text, and whether someone edited it after momentry wrote it (its text no
 * longer matches `body_hash`, or it has no momentry frontmatter at all). null when there is no file.
 * @param {string} file @returns {{data: Record<string, any>, text: string, edited: boolean}|null}
 */
export function readProfile(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  let data = {}, body = raw;
  try { ({ data, body } = parse(raw)); } catch { /* written by hand without frontmatter: theirs */ }
  const text = body.trim();
  return { data, text, edited: typeof data.body_hash !== 'string' || sha(text) !== data.body_hash };
}

function writeProfile(file, data, text) {
  ensurePrivateDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, stringify({ ...data, body_hash: sha(text) }, text ? `${text}\n` : ''), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/**
 * What a profile run would do, without calling the model: `user` (edited file, kept), `none` (no documents),
 * `cached` (documents unchanged), or `generate`.
 * @param {string} root @param {string} cacheDir @returns {'user'|'none'|'cached'|'generate'}
 */
export function profileState(root, cacheDir) {
  const cur = readProfile(profilePath(cacheDir, root));
  if (cur?.edited) return 'user';
  const sources = findSources(root);
  if (!sources.length) return 'none';
  return cur && cur.data.source_hash === sourceHash(sources) ? 'cached' : 'generate';
}

/**
 * Estimated USD of one profile call: up to ~14k chars of documents (~6k real tokens) plus the template, and haiku's
 * thinking. @param {import('./config.mjs').Config} cfg
 */
export function profileCallUsd(cfg) {
  return callUsd(cfg.angle.profileModel, 8000, /haiku/i.test(cfg.angle.profileModel) ? 1000 : 300, cfg.llm.promptCache);
}

/**
 * @typedef {object} Profile
 * @property {string|null} text   profile text, null when there is none
 * @property {'user'|'none'|'cached'|'generated'|'stale'} status  stale: the documents changed but the new call failed,
 *   the older profile is used
 * @property {string} file
 * @property {string} [error]
 */

/**
 * The project's profile, written (one model call, `ctx.key`, default `profile-1`) when it is missing or its documents
 * changed, unless someone edited the file: their text is always kept. No documents: no profile, never invented.
 * Throws (exitCode 4) when the call fails and there is no older profile to fall back on.
 * @param {string} root @param {import('./config.mjs').Config} cfg
 * @param {{key?: string, llm?: Partial<import('./llm.mjs').CallOpts>, stats?: object}} [ctx] @returns {Promise<Profile>}
 */
export async function ensureProfile(root, cfg, ctx = {}) {
  const file = profilePath(cfg.cacheDir, root);
  const cur = readProfile(file);
  if (cur?.edited) return { text: cur.text || null, status: 'user', file };
  const sources = findSources(root);
  if (!sources.length) return { text: null, status: 'none', file };
  const hash = sourceHash(sources);
  if (cur && cur.data.source_hash === hash) return { text: cur.text || null, status: 'cached', file };
  let r;
  try {
    r = await callJson({
      ...(ctx.llm || {}), key: ctx.key ?? 'profile-1', model: cfg.angle.profileModel, timeoutSec: cfg.harvest.timeoutSec,
      prompt: renderPrompt('profile', { sources: sourcesText(sources) }), validate: validateProfile,
    });
  } catch (e) {
    account(ctx, e);
    if (cur) return { text: cur.text || null, status: 'stale', file, error: e.message };
    throw e;
  }
  account(ctx, r);
  const none = r.json.none === true;
  const text = none ? '' : String(r.json.profile).replace(/[ \t]+/g, ' ').trim();
  writeProfile(file, {
    project: path.resolve(root), sources: sources.map((s) => s.rel), source_hash: hash, model: cfg.angle.profileModel,
    generated: new Date().toISOString(), ...(none ? { none: String(r.json.reason).trim() } : {}),
  }, text);
  return { text: text || null, status: 'generated', file };
}
