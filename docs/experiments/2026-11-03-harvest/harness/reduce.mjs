// Rút gọn transcript Claude Code thành văn bản cho harvest, kèm danh sách điểm nóng.
// node reduce.mjs <transcript.jsonl> <lastLine> <outDir> [--no-compact]
import fs from 'node:fs';
import path from 'node:path';

const [file, lastLineArg, outDir, flag] = process.argv.slice(2);
const noCompact = flag === '--no-compact';
const suffix = noCompact ? '-nocompact' : '';
const lastLine = Number(lastLineArg) || Infinity;
const lines = fs.readFileSync(file, 'utf8').split('\n');

const cut = (s, n) => (s.length > n ? s.slice(0, n) + ` …[+${s.length - n}]` : s);
const oneLine = s => s.replace(/\s+/g, ' ').trim();
const textOf = c =>
  typeof c === 'string' ? c : Array.isArray(c) ? c.filter(x => x.type === 'text').map(x => x.text).join('\n') : '';
const resultText = r =>
  typeof r.content === 'string' ? r.content : Array.isArray(r.content) ? r.content.map(x => x.text || '').join('\n') : '';

// --- 4 hàm điểm nóng: thuần, chỉ nhìn một mục đã chuẩn hoá ---
const EXIT_RE = /Exit code (\d+)/;
function hotNonzeroExit(e) {
  if (e.kind !== 'result') return null;
  const m = e.text.match(EXIT_RE);
  if (e.isError || (m && m[1] !== '0')) return `exit ${m ? m[1] : 'error'}`;
  return null;
}
const NUM = String.raw`\d+(?:[.,]\d+)?`;
const PAIR_RE = new RegExp(String.raw`(${NUM})\s*(?:→|->|=>|lên|xuống|thành|tới|to)\s*(${NUM})`, 'i');
function hotMetricPair(e) {
  if (e.kind !== 'assistant' && e.kind !== 'user') return null;
  const m = e.text.match(PAIR_RE);
  if (!m || m[1] === m[2]) return null;
  return `số ${m[1]}→${m[2]}`;
}
const GIT_RE = /\bgit\s+(reset|revert|rebase|restore|checkout\s+--|commit\s+--amend|push\s+(?:-f|--force))|\bsquash\b/;
function hotGitReversal(e) {
  if (e.kind !== 'tool' || e.name !== 'Bash') return null;
  const m = e.text.match(GIT_RE);
  return m ? `git ${m[1] || 'squash'}` : null;
}
const META_RE = /(^|\/)(\.claude\/|\.codex\/|\.agents\/|AGENTS\.md|CLAUDE\.md|skills\/|hooks?\/|settings(\.local)?\.json)/;
function hotMetaWrite(e) {
  if (e.kind !== 'tool' || !['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(e.name)) return null;
  return META_RE.test(e.path || '') ? `ghi meta ${path.basename(e.path)}` : null;
}
const HOT = [hotNonzeroExit, hotMetricPair, hotGitReversal, hotMetaWrite];

// --- chuẩn hoá ---
const entries = [];
for (let i = 0; i < Math.min(lines.length, lastLine); i++) {
  if (!lines[i]) continue;
  let o;
  try { o = JSON.parse(lines[i]); } catch { continue; }
  const L = i + 1;
  const c = o.message?.content;
  if (o.type === 'user' && o.isCompactSummary) {
    if (!noCompact) entries.push({ L, kind: 'compact', text: textOf(c) });
  } else if (o.type === 'user') {
    if (Array.isArray(c) && c.some(x => x.type === 'tool_result')) {
      for (const r of c.filter(x => x.type === 'tool_result'))
        entries.push({ L, kind: 'result', text: resultText(r), isError: !!r.is_error });
    } else {
      const t = textOf(c);
      if (t && !/^<(command-|local-command|system-reminder)/.test(t)) entries.push({ L, kind: 'user', text: t });
    }
  } else if (o.type === 'assistant' && Array.isArray(c)) {
    for (const x of c) {
      if (x.type === 'text' && x.text.trim()) entries.push({ L, kind: 'assistant', text: x.text });
      if (x.type === 'tool_use') {
        const inp = x.input || {};
        const p = inp.file_path || inp.notebook_path || '';
        const t = inp.command || inp.description || inp.prompt || inp.pattern || p || JSON.stringify(inp);
        entries.push({ L, kind: 'tool', name: x.name, path: p, text: String(t) });
      }
    }
  }
}

// --- render ---
const out = [];
const hot = [];
for (const e of entries) {
  for (const h of HOT) {
    const s = h(e);
    if (s) hot.push({ L: e.L, signal: s });
  }
  switch (e.kind) {
    case 'compact': out.push(`[L${e.L}] === TÓM TẮT COMPACT ===\n${cut(e.text, 12000)}`); break;
    case 'user': out.push(`[L${e.L}] USER: ${cut(e.text.trim(), 2500)}`); break;
    case 'assistant': out.push(`[L${e.L}] AGENT: ${cut(e.text.trim(), 2000)}`); break;
    case 'tool': out.push(`[L${e.L}] TOOL ${e.name}: ${cut(oneLine(e.text), 300)}`); break;
    case 'result': {
      const ls = e.text.split('\n').filter(s => s.trim());
      const err = hotNonzeroExit(e);
      const keep = err ? ls.slice(-3) : ls.slice(0, 2);
      out.push(`[L${e.L}] RESULT${err ? ' (' + err + ')' : ''}: ${cut(keep.map(oneLine).join(' | '), err ? 500 : 250)}`);
      break;
    }
  }
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `reduced${suffix}.txt`), out.join('\n'));
// gộp điểm nóng trùng loại trong cửa sổ 5 dòng để danh sách khỏi dài
const merged = [];
for (const h of hot) {
  const kind = h.signal.split(' ')[0];
  const prev = merged.findLast(m => m.kind === kind);
  if (prev && h.L - prev.Lend <= 5) { prev.Lend = h.L; prev.signals.add(h.signal); continue; }
  merged.push({ kind, L: h.L, Lend: h.L, signals: new Set([h.signal]) });
}
const hotText = merged.map((m, i) => `H${i + 1} [L${m.L}${m.Lend !== m.L ? '-L' + m.Lend : ''}] ${[...m.signals].slice(0, 4).join('; ')}`);
fs.writeFileSync(path.join(outDir, `hotspots${suffix}.txt`), hotText.join('\n'));
const chars = out.join('\n').length;
console.log(JSON.stringify({ entries: entries.length, chars, approxTokens: Math.round(chars / 3.2), hotspots: merged.length,
  byKind: merged.reduce((a, m) => ((a[m.kind] = (a[m.kind] || 0) + 1), a), {}) }));
