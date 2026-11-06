// Frozen copy of lib/hotspots.mjs from before its vocabulary moved to rules/hotspots.json.
// Reference for the equivalence test only: do not edit.
// Hotspots (PRD 5.3). Pure per-Entry detectors ported from harness/reduce.mjs; they look at op/paths, not tool names.
import path from 'node:path';

/**
 * @typedef {'nonzeroExit'|'blocked'|'metricPair'|'gitReversal'|'metaWrite'|'lessonWrite'|'ownerVoice'|'bip'} HotspotKind
 * @typedef {object} Hotspot
 * @property {string} id        `H<L>` of the first line, global across chunks
 * @property {HotspotKind} kind
 * @property {number} L
 * @property {number} Lend      last line after merging same-kind hits ≤ window lines apart
 * @property {string[]} signals short labels, no transcript text
 */

// A tool call stopped by the environment, not by the command: hook veto, permission or sandbox refusal, worktree guard.
const BLOCK_RE = /PreToolUse:\S+ hook error|^<tool_use_error>Blocked:|Permission (?:for this command|to use [^\n]{0,60}) (?:was |has been )?denied|isolated in the worktree|blocked by (?:the )?sandbox|sandbox[^\n]{0,40}(?:denied|blocked)/i;
const failed = e => (Number.isInteger(e.exitCode) && e.exitCode !== 0) || !!e.isError;

/** result the harness or a hook refused to run (not a command failure). @param {import('./sources/claude.mjs').Entry} e @returns {string|null} */
export function blocked(e) {
  if (e?.kind !== 'result' || e.rejected || !failed(e)) return null;
  return BLOCK_RE.test(String(e.text ?? '').slice(0, 400)) ? 'bị chặn' : null;
}

/** result with exitCode ≠ 0 (not null) or isError, except blocked calls and calls the user rejected. @param {import('./sources/claude.mjs').Entry} e @returns {string|null} label */
export function nonzeroExit(e) {
  if (e?.kind !== 'result' || e.rejected || !failed(e) || blocked(e)) return null;
  return `exit ${Number.isInteger(e.exitCode) && e.exitCode !== 0 ? e.exitCode : 'error'}`;
}

// Notifications and cross-session messages arrive as user lines; they start with a tag or a fixed sentence.
const isHarnessText = e => /^\s*(?:<|Another Claude session sent)/.test(String(e.text ?? ''));

// Numbers as written in Vietnamese or English: "4 301", "1.360", "0,667", "8,3%".
const NUM = String.raw`\d{1,3}(?:[  ]\d{3})+(?:[.,]\d+)?%?|\d+(?:[.,]\d+)?%?`;
const PAIR_RE = new RegExp(String.raw`(?<![\d.,])(${NUM})\s*(→|->|=>|lên|xuống|thành|tới|to)\s*(${NUM})`, 'giu');
// "rows 0 to 190", "dòng 12 tới 40", "mapping-0241 to 0300": position and id ranges, not a before/after
const RANGE_BEFORE_RE = /(?:\b(?:rows?|lines?|dòng|hàng|pages?|trang|bytes?|chars?|ký tự)\s+|[A-Za-z]-|[#_/])$/i;
const RANGE_AFTER_RE = /^\s*(?:[kmgt]?i?b|bytes?|rows?|lines?|dòng|hàng|files?|ngày|days?|tuần|weeks?|tháng|months?|pages?|trang)(?![\p{L}])/iu;
const value = n => {
  const t = n.replace(/[  %]/g, '');
  const grouped = /[  ]/.test(n) || /^[1-9]\d{0,2}([.,]\d{3})+$/.test(t);
  return grouped ? t.replace(/[.,]/g, '') : t.replace(',', '.');
};

/** user/assistant text with a number pair joined by → -> => lên xuống thành tới to; equal pairs, harness-injected user lines, position ranges and id ranges ignored. @param {import('./sources/claude.mjs').Entry} e @returns {string|null} */
export function metricPair(e) {
  if (e?.kind !== 'assistant' && e?.kind !== 'user') return null;
  if (e.kind === 'user' && isHarnessText(e)) return null;
  const text = String(e.text ?? '');
  for (const m of text.matchAll(PAIR_RE)) {
    const [whole, a, conn, b] = m;
    if (value(a) === value(b)) continue;
    if (RANGE_BEFORE_RE.test(text.slice(0, m.index))) continue;
    if (/^0\d/.test(a) || /^0\d/.test(b)) continue;
    if (/^(?:to|tới)$/i.test(conn) && RANGE_AFTER_RE.test(text.slice(m.index + whole.length))) continue;
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

const GIT_RE = /\bgit\s+(reset|revert|rebase|restore|checkout\s+--(?=\s|$)|commit\s+--amend|push\s+(?:-f|--force))([^;&|\n]*)|\b(squash)\b/g;
const REBASE_REWRITE_RE = /\s(?:-i|--interactive|--abort|--onto|--root|--exec|--autosquash)(?=\s|$)/;
const LOCKFILE_RE = /(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|[^/]*\.lock)$/;
const UPSTREAM_RE = /\s(?:origin\/\S+|upstream\/\S+|@\{u(?:pstream)?\}|main|master|develop|trunk)\s*$/;

/** op shell: git reset/revert/rebase/restore/checkout --/commit --amend/push -f, squash. Plain rebase onto upstream and restoring a lockfile are routine, not reversals. @param {import('./sources/claude.mjs').Entry} e @returns {string|null} */
export function gitReversal(e) {
  if (e?.kind !== 'tool' || e.op !== 'shell') return null;
  for (const m of commandLines(e.text).matchAll(GIT_RE)) {
    if (m[3]) return 'git squash';
    if (m[1].startsWith('checkout') && m[2].trim().split(/\s+/).every(a => LOCKFILE_RE.test(a.replace(/^["']|["']$/g, '')))) continue;
    if (m[1] === 'rebase' && !REBASE_REWRITE_RE.test(m[2]) && UPSTREAM_RE.test(m[2])) continue;
    return `git ${m[1].replace(/\s+/g, ' ')}`;
  }
  return null;
}

// Lesson and decision records: agent memory, decision records, journals, changelog.
const LESSON_KINDS = [
  ['bài học', /(^|\/)(memory\/|MEMORY\.md$)/],
  ['quyết định', /(^|\/)(decisions?\/|adrs?\/|ADR[-_]?\d)/i],
  ['nhật ký', /(^|\/)journals?\//],
  ['changelog', /(^|\/)CHANGELOG(\.md)?$/i],
];
const lessonKind = p => LESSON_KINDS.find(([, re]) => re.test(String(p).replace(/\\/g, '/')))?.[0] ?? null;
const REDIRECT_RE = /(?:^|[^<>&\d])(?:\d?>>?|&>>?)\s*["']?([^\s"'|;&<>()]+)|\btee(?:\s+-\S+)*\s+["']?([^\s"'|;&<>()]+)/g;
const COPY_RE = /\b(?:cp|mv|install)\b([^;&|\n]*)/g;

/** Paths a shell command writes to: > >> tee, and the last argument of cp/mv/install. */
function shellTargets(command) {
  const text = commandLines(command);
  const out = [];
  for (const m of text.matchAll(REDIRECT_RE)) out.push(m[1] ?? m[2]);
  for (const m of text.matchAll(COPY_RE)) {
    const args = m[1].trim().split(/\s+/).filter(a => a && !a.startsWith('-')).map(a => a.replace(/^["']|["']$/g, ''));
    if (args.length > 1) out.push(args.at(-1));
  }
  return out.filter(p => p && !p.startsWith('/dev/'));
}

/** write to memory notes, decision records, journals or CHANGELOG, by edit tool or by shell (> >> tee heredoc cp mv). @param {import('./sources/claude.mjs').Entry} e @returns {string|null} */
export function lessonWrite(e) {
  if (e?.kind !== 'tool') return null;
  const targets = e.op === 'write' ? e.paths ?? [] : e.op === 'shell' ? shellTargets(e.text) : [];
  for (const p of targets) {
    const kind = lessonKind(p);
    if (kind) return `ghi ${kind} ${path.basename(String(p).replace(/\\/g, '/'))}`;
  }
  return null;
}

const META_RE = /(^|\/)(\.claude\/|\.codex\/|\.agents\/|AGENTS\.md|CLAUDE\.md|skills\/|hooks?\/|settings(\.local)?\.json)/;

/** op write to .claude/ .codex/ .agents/ AGENTS.md CLAUDE.md skills/ hooks/ settings*.json; lesson records belong to lessonWrite. @param {import('./sources/claude.mjs').Entry} e @returns {string|null} */
export function metaWrite(e) {
  if (e?.kind !== 'tool' || e.op !== 'write') return null;
  const hit = (e.paths ?? []).find(p => META_RE.test(String(p).replace(/\\/g, '/')) && !lessonKind(p));
  return hit ? `ghi meta ${path.basename(hit)}` : null;
}

/** The owner's own turn: a user entry that is neither /bip nor injected by the harness. @param {import('./sources/claude.mjs').Entry} e @returns {boolean} */
export const isOwnerTurn = e => e?.kind === 'user' && !e.bip && !isHarnessText(e);

const NOT_LETTER = String.raw`(?![\p{L}])`;
const CHOICE_ID_RE = /^\(?(?:[A-Fa-f]\d?|\d[A-Fa-f]?)\)?[.!]?$/;
const CHOICE_WORD_RE = new RegExp(String.raw`^(?:em\s+|anh\s+)?(?:chọn|đồng ý|duyệt|phương án|pa|option|go with|pick|choose|approve)${NOT_LETTER}`, 'iu');
const PUSH_START_RE = new RegExp(String.raw`^(?:không|khong|ko|no|nope|stop|dừng|đừng|sai|wrong|why)${NOT_LETTER}`, 'iu');
const PUSH_ANY_RE = /sao (?:lại|mà|vẫn|chưa)|thông minh hơn|lâu quá|quá lâu|mãi (?:mà )?chưa|làm gì mà|too slow|taking too long|why (?:did|are|is|do|would)|that'?s wrong/iu;
const LONG_STRETCH = 30; // entries without an owner turn
const SHORT_TURN = 100;  // chars
const PUSH_MAX = 300;

/**
 * The owner speaking: interrupt, rejected tool call, choice answer, pushback, or a short turn after a long agent stretch.
 * @param {import('./sources/claude.mjs').Entry} e @param {number} [stretch] entries since the previous owner turn
 * @returns {string|null}
 */
export function ownerVoice(e, stretch = 0) {
  if (e?.kind === 'result') return e.rejected ? 'chủ từ chối tool' : null;
  if (!isOwnerTurn(e)) return null;
  const t = String(e.text ?? '').trim();
  if (/^\[Request interrupted by user/.test(t)) return 'chủ ngắt';
  if (t.length <= 200 && (CHOICE_ID_RE.test(t) || CHOICE_WORD_RE.test(t))) return 'chủ chọn';
  if (t.length <= PUSH_MAX && (PUSH_START_RE.test(t) || PUSH_ANY_RE.test(t))) return 'chủ phản đối hoặc thúc';
  if (t.length <= SHORT_TURN && stretch >= LONG_STRETCH) return 'chủ trả lời ngắn sau chạy dài';
  return null;
}

/** user entry with bip: true. @param {import('./sources/claude.mjs').Entry} e @returns {string|null} */
export function bipMark(e) {
  return e?.kind === 'user' && e.bip === true ? 'bip' : null;
}

const DETECTORS = [
  ['nonzeroExit', nonzeroExit], ['blocked', blocked], ['metricPair', metricPair], ['gitReversal', gitReversal],
  ['metaWrite', metaWrite], ['lessonWrite', lessonWrite], ['ownerVoice', ownerVoice], ['bip', bipMark],
];

/** All detectors, merged per kind within `window` lines, sorted by L. @param {import('./sources/claude.mjs').Entry[]} entries @param {{window?: number}} [opts] @returns {Hotspot[]} */
export function detect(entries, opts = {}) {
  const window = opts.window ?? 5;
  const hits = [];
  let stretch = 0; // entries since the last owner turn
  for (const e of entries) {
    for (const [kind, fn] of DETECTORS) {
      const s = fn(e, stretch);
      if (s) hits.push({ kind, L: e.L, signal: s });
    }
    stretch = isOwnerTurn(e) || e.bip ? 0 : stretch + 1;
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
