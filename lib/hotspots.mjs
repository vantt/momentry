// Hotspots (PRD 5.3). Pure per-Entry detectors ported from harness/reduce.mjs; they look at op/paths, not tool names.
// The vocabulary (phrases, path and git patterns, number-pair noise words) lives in rules/hotspots.json, read once at
// first use; the detection algorithms, thresholds and signal labels stay here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_RULES } from './hotspots-default.mjs';

/**
 * @typedef {'nonzeroExit'|'blocked'|'metricPair'|'gitReversal'|'metaWrite'|'lessonWrite'|'ownerVoice'|'bip'} HotspotKind
 * @typedef {object} Hotspot
 * @property {string} id        `H<L>` of the first line, global across chunks
 * @property {HotspotKind} kind
 * @property {number} L
 * @property {number} Lend      last line after merging same-kind hits ≤ window lines apart
 * @property {string[]} signals short labels, no transcript text
 */

/** Absolute path of the shipped vocabulary table. */
export const RULES_FILE = fileURLToPath(new URL('../rules/hotspots.json', import.meta.url));

/** A rules table that cannot be used; `entry` names the offending list or entry (e.g. `ownerVoice.choiceWords.vi[2]`). */
export class RulesError extends Error {
  /** @param {string} entry @param {string} why */
  constructor(entry, why) {
    super(`luật điểm nóng ${entry}: ${why}`);
    this.name = 'RulesError';
    this.entry = entry;
  }
}

// Numbers as written in Vietnamese or English: "4 301", "1.360", "0,667", "8,3%". Number syntax, not vocabulary.
const NUM = String.raw`\d{1,3}(?:[  ]\d{3})+(?:[.,]\d+)?%?|\d+(?:[.,]\d+)?%?`;
const NOT_LETTER = String.raw`(?![\p{L}])`;

// Every list in the table: where it is, and the flags of the regex it is joined into (fragments are checked with them).
const LISTS = {
  'harnessText.prefixes': '',
  'blocked.patterns': 'i',
  'metricPair.connectors': 'iu',
  'metricPair.rangeConnectors': 'i',
  'metricPair.positionWords': 'i',
  'metricPair.idPrefixes': 'i',
  'metricPair.unitWords': 'iu',
  'gitReversal.commands': '',
  'gitReversal.squashWords': '',
  'gitReversal.rebaseRewriteFlags': '',
  'gitReversal.lockfiles': '',
  'gitReversal.upstreams': '',
  'lessonWrite.copyCommands': '',
  'metaWrite.paths': '',
  'ownerVoice.interrupt': '',
  'ownerVoice.choiceIds': '',
  'ownerVoice.address': 'iu',
  'ownerVoice.choiceWords': 'iu',
  'ownerVoice.pushbackStart': 'iu',
  'ownerVoice.pushbackAnywhere': 'iu',
};
const SECTIONS = { harnessText: 0, blocked: 0, metricPair: 0, gitReversal: 0, lessonWrite: ['kinds'], metaWrite: 0, ownerVoice: 0 };
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = o => Object.keys(o).filter(k => !k.startsWith('$'));

/** A fragment that compiles under `flags`, opens no capturing group, and is NFC. Returns the source. */
function fragment(where, entry, flags, keys = ['id', 'pattern', 'comment']) {
  const obj = isObj(entry);
  const src = obj ? entry.pattern : entry;
  const name = obj && typeof entry.id === 'string' ? `${where} (${entry.id})` : where;
  if (obj) {
    for (const k of Object.keys(entry)) if (!keys.includes(k)) throw new RulesError(name, `khoá lạ "${k}"`);
    if (entry.id !== undefined && typeof entry.id !== 'string') throw new RulesError(name, 'id phải là chuỗi');
  }
  if (typeof src !== 'string' || !src) throw new RulesError(name, 'mẫu phải là chuỗi không rỗng');
  if (src !== src.normalize('NFC')) throw new RulesError(name, 'chữ phải ở dạng NFC (dấu dựng sẵn)');
  let groups;
  try { groups = new RegExp(`(?:${src})|`, flags).exec('').length - 1; } catch (e) { throw new RulesError(name, `regex sai: ${e.message}`); }
  if (groups) throw new RulesError(name, 'không được mở nhóm bắt (dùng (?:...))');
  return src;
}

/** One list: an array, or an object of arrays by language (vi, en, ...) joined in key order. */
function list(table, key, flags) {
  const [sec, name] = key.split('.');
  const v = table[sec]?.[name];
  const parts = Array.isArray(v) ? [['', v]] : isObj(v) ? own(v).map(k => [`.${k}`, v[k]]) : null;
  if (!parts) throw new RulesError(key, 'thiếu danh sách (mảng, hoặc đối tượng mảng theo ngôn ngữ)');
  const out = [];
  for (const [lang, arr] of parts) {
    if (!Array.isArray(arr)) throw new RulesError(`${key}${lang}`, 'phải là mảng');
    arr.forEach((entry, i) => out.push(fragment(`${key}${lang}[${i}]`, entry, flags)));
  }
  if (!out.length) throw new RulesError(key, 'danh sách rỗng');
  return out.join('|');
}

function regex(key, src, flags) {
  try { return new RegExp(src, flags); } catch (e) { throw new RulesError(key, `regex ghép sai: ${e.message}`); }
}

/**
 * @typedef {object} Rules compiled vocabulary, built by compileRules
 * @property {RegExp} harness @property {RegExp} block @property {RegExp} pair @property {RegExp} rangeConn
 * @property {RegExp} rangeBefore @property {RegExp} rangeAfter @property {RegExp} git @property {RegExp} rebaseRewrite
 * @property {RegExp} lockfile @property {RegExp} upstream @property {[string, RegExp][]} lessonKinds @property {RegExp} copy
 * @property {RegExp} meta @property {RegExp} interrupt @property {RegExp} choiceId @property {RegExp} choiceWord
 * @property {RegExp} pushStart @property {RegExp} pushAny
 */

/**
 * Validates a parsed table and compiles its regexes. Throws RulesError naming the first bad list or entry.
 * @param {any} table @returns {Rules}
 */
export function compileRules(table) {
  if (!isObj(table)) throw new RulesError('(gốc)', 'phải là đối tượng JSON');
  if (table.version !== 1) throw new RulesError('version', `chỉ hỗ trợ 1, gặp ${JSON.stringify(table.version)}`);
  for (const k of own(table)) if (k !== 'version' && !(k in SECTIONS)) throw new RulesError(k, 'mục lạ');
  for (const [sec, extra] of Object.entries(SECTIONS)) {
    if (!isObj(table[sec])) throw new RulesError(sec, 'thiếu mục');
    const known = new Set([...Object.keys(LISTS).filter(k => k.startsWith(`${sec}.`)).map(k => k.slice(sec.length + 1)), ...(extra || [])]);
    for (const k of own(table[sec])) if (!known.has(k)) throw new RulesError(`${sec}.${k}`, 'danh sách lạ');
  }
  const L = Object.fromEntries(Object.entries(LISTS).map(([k, f]) => [k, list(table, k, f)]));

  const kinds = table.lessonWrite.kinds;
  if (!Array.isArray(kinds) || !kinds.length) throw new RulesError('lessonWrite.kinds', 'phải là mảng không rỗng');
  const lessonKinds = kinds.map((k, i) => {
    const where = `lessonWrite.kinds[${i}]`;
    if (!isObj(k)) throw new RulesError(where, 'phải là {id, label, pattern, flags}');
    const name = typeof k.id === 'string' ? `${where} (${k.id})` : where;
    if (typeof k.label !== 'string' || !k.label.trim()) throw new RulesError(name, 'thiếu label');
    const flags = k.flags ?? '';
    if (typeof flags !== 'string' || !/^(?!.*(.).*\1)[imsu]*$/.test(flags)) throw new RulesError(name, `flags chỉ gồm i m s u, gặp ${JSON.stringify(flags)}`);
    return /** @type {[string, RegExp]} */ ([k.label, new RegExp(fragment(where, k, flags, ['id', 'label', 'pattern', 'flags', 'comment']), flags)]);
  });

  return {
    harness: regex('harnessText.prefixes', String.raw`^\s*(?:${L['harnessText.prefixes']})`, ''),
    block: regex('blocked.patterns', L['blocked.patterns'], 'i'),
    pair: regex('metricPair.connectors', String.raw`(?<![\d.,])(${NUM})\s*(${L['metricPair.connectors']})\s*(${NUM})`, 'giu'),
    rangeConn: regex('metricPair.rangeConnectors', `^(?:${L['metricPair.rangeConnectors']})$`, 'i'),
    rangeBefore: regex('metricPair.positionWords', String.raw`(?:\b(?:${L['metricPair.positionWords']})\s+|${L['metricPair.idPrefixes']})$`, 'i'),
    rangeAfter: regex('metricPair.unitWords', String.raw`^\s*(?:${L['metricPair.unitWords']})${NOT_LETTER}`, 'iu'),
    git: regex('gitReversal.commands', String.raw`\bgit\s+(${L['gitReversal.commands']})([^;&|\n]*)|\b(${L['gitReversal.squashWords']})\b`, 'g'),
    rebaseRewrite: regex('gitReversal.rebaseRewriteFlags', String.raw`\s(?:${L['gitReversal.rebaseRewriteFlags']})(?=\s|$)`, ''),
    lockfile: regex('gitReversal.lockfiles', String.raw`(?:^|\/)(?:${L['gitReversal.lockfiles']})$`, ''),
    upstream: regex('gitReversal.upstreams', String.raw`\s(?:${L['gitReversal.upstreams']})\s*$`, ''),
    lessonKinds,
    copy: regex('lessonWrite.copyCommands', String.raw`\b(?:${L['lessonWrite.copyCommands']})\b([^;&|\n]*)`, 'g'),
    meta: regex('metaWrite.paths', String.raw`(?:^|\/)(?:${L['metaWrite.paths']})`, ''),
    interrupt: regex('ownerVoice.interrupt', `^(?:${L['ownerVoice.interrupt']})`, ''),
    choiceId: regex('ownerVoice.choiceIds', String.raw`^\(?(?:${L['ownerVoice.choiceIds']})\)?[.!]?$`, ''),
    choiceWord: regex('ownerVoice.choiceWords', String.raw`^(?:(?:${L['ownerVoice.address']})\s+)?(?:${L['ownerVoice.choiceWords']})${NOT_LETTER}`, 'iu'),
    pushStart: regex('ownerVoice.pushbackStart', `^(?:${L['ownerVoice.pushbackStart']})${NOT_LETTER}`, 'iu'),
    pushAny: regex('ownerVoice.pushbackAnywhere', `(?:${L['ownerVoice.pushbackAnywhere']})`, 'iu'),
  };
}

const warned = new Set();
const warnOnce = (msg) => { if (warned.has(msg)) return; warned.add(msg); process.stderr.write(`momentry: ${msg}\n`); };

/**
 * Reads and compiles a rules file. A missing, unreadable or invalid file falls back to the built-in default table
 * (lib/hotspots-default.mjs) and warns once per message. A later user layer would merge into the table before compileRules.
 * @param {string} [file] @param {{warn?: (msg: string) => void}} [opts] @returns {Rules}
 */
export function loadRules(file = RULES_FILE, { warn = warnOnce } = {}) {
  try {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) { throw new RulesError('(file)', `không đọc được ${file}: ${e.code || e.message}`); }
    let table;
    try { table = JSON.parse(text); } catch (e) { throw new RulesError('(file)', `JSON sai: ${e.message}`); }
    return compileRules(table);
  } catch (e) {
    if (!(e instanceof RulesError)) throw e;
    warn(`${e.message}; dùng bảng từ vựng điểm nóng mặc định`);
    return compileRules(DEFAULT_RULES);
  }
}

/** @type {Rules|null} */
let cached = null;
/** The shipped table, compiled once on first use. @returns {Rules} */
export const rules = () => (cached ??= loadRules());
// Detectors take an optional compiled table; anything else (an array index when passed as a callback) means the shipped one.
const use = (r) => (r?.harness instanceof RegExp ? r : rules());

const failed = e => (Number.isInteger(e.exitCode) && e.exitCode !== 0) || !!e.isError;

// A tool call stopped by the environment, not by the command: hook veto, permission or sandbox refusal, worktree guard.
/** result the harness or a hook refused to run (not a command failure). @param {import('./sources/claude.mjs').Entry} e @param {Rules} [table] @returns {string|null} */
export function blocked(e, table = null) {
  const r = use(table);
  if (e?.kind !== 'result' || e.rejected || !failed(e)) return null;
  return r.block.test(String(e.text ?? '').slice(0, 400)) ? 'bị chặn' : null;
}

/** result with exitCode ≠ 0 (not null) or isError, except blocked calls and calls the user rejected. @param {import('./sources/claude.mjs').Entry} e @param {Rules} [table] @returns {string|null} label */
export function nonzeroExit(e, table = null) {
  const r = use(table);
  if (e?.kind !== 'result' || e.rejected || !failed(e) || blocked(e, r)) return null;
  return `exit ${Number.isInteger(e.exitCode) && e.exitCode !== 0 ? e.exitCode : 'error'}`;
}

// Notifications and cross-session messages arrive as user lines; they start with a tag or a fixed sentence.
const isHarnessText = (e, r) => r.harness.test(String(e.text ?? ''));

const value = n => {
  const t = n.replace(/[  %]/g, '');
  const grouped = /[  ]/.test(n) || /^[1-9]\d{0,2}([.,]\d{3})+$/.test(t);
  return grouped ? t.replace(/[.,]/g, '') : t.replace(',', '.');
};

/** user/assistant text with a number pair joined by a connector; equal pairs, harness-injected user lines, position ranges and id ranges ignored. @param {import('./sources/claude.mjs').Entry} e @param {Rules} [table] @returns {string|null} */
export function metricPair(e, table = null) {
  const r = use(table);
  if (e?.kind !== 'assistant' && e?.kind !== 'user') return null;
  if (e.kind === 'user' && isHarnessText(e, r)) return null;
  const text = String(e.text ?? '');
  for (const m of text.matchAll(r.pair)) {
    const [whole, a, conn, b] = m;
    if (value(a) === value(b)) continue;
    if (r.rangeBefore.test(text.slice(0, m.index))) continue;
    if (/^0\d/.test(a) || /^0\d/.test(b)) continue;
    if (r.rangeConn.test(conn) && r.rangeAfter.test(text.slice(m.index + whole.length))) continue;
    return `số ${a}→${b}`;
  }
  return null;
}

// Heredoc bodies are text being written, not commands: drop them so words inside never match.
function commandLines(text) {
  const out = [];
  let end = null;
  for (const line of String(text ?? '').split('\n')) {
    if (end !== null) { if (line.trim() === end) end = null; continue; }
    out.push(line);
    const h = line.match(/<<-?\s*(['"]?)([\w-]+)\1/);
    if (h) end = h[2];
  }
  return out.join('\n');
}

/** op shell: git history rewrites and squash. Plain rebase onto upstream and restoring a lockfile are routine, not reversals. @param {import('./sources/claude.mjs').Entry} e @param {Rules} [table] @returns {string|null} */
export function gitReversal(e, table = null) {
  const r = use(table);
  if (e?.kind !== 'tool' || e.op !== 'shell') return null;
  for (const m of commandLines(e.text).matchAll(r.git)) {
    if (m[3]) return 'git squash';
    if (m[1].startsWith('checkout') && m[2].trim().split(/\s+/).every(a => r.lockfile.test(a.replace(/^["']|["']$/g, '')))) continue;
    if (m[1] === 'rebase' && !r.rebaseRewrite.test(m[2]) && r.upstream.test(m[2])) continue;
    return `git ${m[1].replace(/\s+/g, ' ')}`;
  }
  return null;
}

const lessonKind = (p, r) => r.lessonKinds.find(([, re]) => re.test(String(p).replace(/\\/g, '/')))?.[0] ?? null;
const REDIRECT_RE = /(?:^|[^<>&\d])(?:\d?>>?|&>>?)\s*["']?([^\s"'|;&<>()]+)|\btee(?:\s+-\S+)*\s+["']?([^\s"'|;&<>()]+)/g;

/** Paths a shell command writes to: > >> tee, and the last argument of a copy command (cp/mv/install). */
function shellTargets(command, r) {
  const text = commandLines(command);
  const out = [];
  for (const m of text.matchAll(REDIRECT_RE)) out.push(m[1] ?? m[2]);
  for (const m of text.matchAll(r.copy)) {
    const args = m[1].trim().split(/\s+/).filter(a => a && !a.startsWith('-')).map(a => a.replace(/^["']|["']$/g, ''));
    if (args.length > 1) out.push(args.at(-1));
  }
  return out.filter(p => p && !p.startsWith('/dev/'));
}

/** write to memory notes, decision records, journals or CHANGELOG, by edit tool or by shell (> >> tee heredoc cp mv). @param {import('./sources/claude.mjs').Entry} e @param {Rules} [table] @returns {string|null} */
export function lessonWrite(e, table = null) {
  const r = use(table);
  if (e?.kind !== 'tool') return null;
  const targets = e.op === 'write' ? e.paths ?? [] : e.op === 'shell' ? shellTargets(e.text, r) : [];
  for (const p of targets) {
    const kind = lessonKind(p, r);
    if (kind) return `ghi ${kind} ${path.basename(String(p).replace(/\\/g, '/'))}`;
  }
  return null;
}

/** op write to agent configuration (.claude/ .codex/ .agents/ AGENTS.md CLAUDE.md skills/ hooks/ settings*.json); lesson records belong to lessonWrite. @param {import('./sources/claude.mjs').Entry} e @param {Rules} [table] @returns {string|null} */
export function metaWrite(e, table = null) {
  const r = use(table);
  if (e?.kind !== 'tool' || e.op !== 'write') return null;
  const hit = (e.paths ?? []).find(p => r.meta.test(String(p).replace(/\\/g, '/')) && !lessonKind(p, r));
  return hit ? `ghi meta ${path.basename(hit)}` : null;
}

/** The owner's own turn: a user entry that is neither /bip nor injected by the harness. @param {import('./sources/claude.mjs').Entry} e @param {Rules} [table] @returns {boolean} */
export const isOwnerTurn = (e, table = null) => e?.kind === 'user' && !e.bip && !isHarnessText(e, use(table));

const LONG_STRETCH = 30; // entries without an owner turn
const SHORT_TURN = 100;  // chars
const PUSH_MAX = 300;

/**
 * The owner speaking: interrupt, rejected tool call, choice answer, pushback, or a short turn after a long agent stretch.
 * @param {import('./sources/claude.mjs').Entry} e @param {number} [stretch] entries since the previous owner turn @param {Rules} [table]
 * @returns {string|null}
 */
export function ownerVoice(e, stretch = 0, table = null) {
  const r = use(table);
  if (e?.kind === 'result') return e.rejected ? 'chủ từ chối tool' : null;
  if (!isOwnerTurn(e, r)) return null;
  const t = String(e.text ?? '').trim();
  if (r.interrupt.test(t)) return 'chủ ngắt';
  if (t.length <= 200 && (r.choiceId.test(t) || r.choiceWord.test(t))) return 'chủ chọn';
  if (t.length <= PUSH_MAX && (r.pushStart.test(t) || r.pushAny.test(t))) return 'chủ phản đối hoặc thúc';
  if (t.length <= SHORT_TURN && stretch >= LONG_STRETCH) return 'chủ trả lời ngắn sau chạy dài';
  return null;
}

/** user entry with bip: true. @param {import('./sources/claude.mjs').Entry} e @returns {string|null} */
export function bipMark(e) {
  return e?.kind === 'user' && e.bip === true ? 'bip' : null;
}

/** @type {[HotspotKind, (e: any, stretch: number, r: Rules) => string|null][]} */
const DETECTORS = [
  ['nonzeroExit', (e, s, r) => nonzeroExit(e, r)], ['blocked', (e, s, r) => blocked(e, r)],
  ['metricPair', (e, s, r) => metricPair(e, r)], ['gitReversal', (e, s, r) => gitReversal(e, r)],
  ['metaWrite', (e, s, r) => metaWrite(e, r)], ['lessonWrite', (e, s, r) => lessonWrite(e, r)],
  ['ownerVoice', (e, s, r) => ownerVoice(e, s, r)], ['bip', (e) => bipMark(e)],
];

/**
 * All detectors, merged per kind within `window` lines, sorted by L.
 * @param {import('./sources/claude.mjs').Entry[]} entries @param {{window?: number, rules?: Rules}} [opts] rules: a compiled table (default: the shipped one)
 * @returns {Hotspot[]}
 */
export function detect(entries, opts = {}) {
  const window = opts.window ?? 5;
  const r = opts.rules ?? rules();
  const hits = [];
  let stretch = 0; // entries since the last owner turn
  for (const e of entries) {
    for (const [kind, fn] of DETECTORS) {
      const s = fn(e, stretch, r);
      if (s) hits.push({ kind, L: e.L, signal: s });
    }
    stretch = isOwnerTurn(e, r) || e.bip ? 0 : stretch + 1;
  }
  hits.sort((a, b) => a.L - b.L);
  const merged = [];
  const last = {};
  for (const h of hits) {
    const prev = last[h.kind];
    if (prev && h.L - prev.Lend <= window) {
      prev.Lend = h.L;
      if (!prev.signals.includes(h.signal)) prev.signals.push(h.signal);
      continue;
    }
    const hs = { id: `H${h.L}`, kind: h.kind, L: h.L, Lend: h.L, signals: [h.signal] };
    merged.push(hs);
    last[h.kind] = hs;
  }
  // two kinds can start on the same line; keep ids unique
  const seen = new Map();
  for (const h of merged) {
    const n = seen.get(h.id) ?? 0;
    seen.set(h.id, n + 1);
    if (n) h.id = `${h.id}${String.fromCharCode(97 + n - 1)}`;
  }
  return merged;
}

/** Prompt text for `{hotspots}`: one line per hotspot `H<L> [L<L>-L<Lend>] signals`. @param {Hotspot[]} hotspots @returns {string} */
export function format(hotspots) {
  return hotspots.map(h => `${h.id} [L${h.L}${h.Lend !== h.L ? '-L' + h.Lend : ''}] ${h.signals.slice(0, 4).join('; ')}`).join('\n');
}
