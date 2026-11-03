// YAML-subset frontmatter (PRD 6.6). Values: integer, JSON-quoted string, bare string, one-line list.
const KEY_RE = /^([a-z_]+):(?:[ \t]+(.*)|[ \t]*)$/;
const INT_RE = /^-?(?:0|[1-9]\d*)$/;
const ALWAYS_QUOTED = new Set(['hook', 'source']);
const ALWAYS_QUOTED_ITEMS = new Set(['sides']);

export class FrontmatterError extends Error {
  /** @param {string} msg @param {number} [line] 1-based line in the file */
  constructor(msg, line) {
    super(line ? `dòng ${line}: ${msg}` : msg);
    this.name = 'FrontmatterError';
    this.line = line ?? null;
  }
}

function scanString(s, i, line) {
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === '\\') j++;
    else if (s[j] === '"') return j + 1;
  }
  throw new FrontmatterError('chuỗi ngoặc kép không đóng', line);
}

function parseQuoted(s, line) {
  try { return JSON.parse(s); } catch { throw new FrontmatterError(`chuỗi ngoặc kép sai luật JSON: ${s}`, line); }
}

function checkTail(rest, line) {
  if (rest.trim() !== '' && !/^\s+#/.test(rest)) throw new FrontmatterError(`thừa ký tự sau giá trị: ${rest.trim()}`, line);
}

const bareScalar = (s) => (INT_RE.test(s) ? Number(s) : s);

function parseList(s, line) {
  const items = [];
  let i = 1;
  const ws = () => { while (s[i] === ' ' || s[i] === '\t') i++; };
  ws();
  if (s[i] === ']') return { items, end: i + 1 };
  for (;;) {
    ws();
    if (i >= s.length) throw new FrontmatterError('danh sách không đóng', line);
    if (s[i] === '"') {
      const end = scanString(s, i, line);
      items.push(parseQuoted(s.slice(i, end), line));
      i = end;
    } else {
      let j = i;
      while (j < s.length && s[j] !== ',' && s[j] !== ']') {
        if (s[j] === '"' || s[j] === '[') throw new FrontmatterError(`phần tử trần chứa ${s[j]}`, line);
        j++;
      }
      const raw = s.slice(i, j).trim();
      if (!raw) throw new FrontmatterError('phần tử rỗng', line);
      items.push(bareScalar(raw));
      i = j;
    }
    ws();
    if (s[i] === ',') { i++; continue; }
    if (s[i] === ']') return { items, end: i + 1 };
    throw new FrontmatterError('danh sách không đóng', line);
  }
}

function parseValue(raw, line) {
  const s = raw.replace(/[ \t]+$/, '');
  if (s === '') return '';
  if (s[0] === '"') {
    const end = scanString(s, 0, line);
    checkTail(s.slice(end), line);
    return parseQuoted(s.slice(0, end), line);
  }
  if (s[0] === '[') {
    const { items, end } = parseList(s, line);
    checkTail(s.slice(end), line);
    return items;
  }
  const m = s.match(/\s#/);
  return bareScalar((m ? s.slice(0, m.index) : s).trim());
}

/**
 * @param {string} md whole file
 * @returns {{data: Record<string, string|number|(string|number)[]>, body: string}}
 * @throws {FrontmatterError}
 */
export function parse(md) {
  const open = md.match(/^---\r?\n/);
  if (!open) throw new FrontmatterError('thiếu frontmatter (dòng đầu phải là ---)', 1);
  const data = {};
  let pos = open[0].length;
  let lineNo = 1;
  for (;;) {
    lineNo++;
    if (pos >= md.length) throw new FrontmatterError('frontmatter không đóng', lineNo);
    const nl = md.indexOf('\n', pos);
    const lineEnd = nl === -1 ? md.length : nl;
    const line = md.slice(pos, lineEnd).replace(/\r$/, '');
    pos = nl === -1 ? md.length : nl + 1;
    if (line === '---') return { data, body: md.slice(pos) };
    const t = line.trim();
    if (t === '' || t.startsWith('#')) continue;
    const m = line.match(KEY_RE);
    if (!m) throw new FrontmatterError(`dòng không phải "khoá: giá trị": ${line}`, lineNo);
    if (Object.hasOwn(data, m[1])) throw new FrontmatterError(`khoá lặp: ${m[1]}`, lineNo);
    data[m[1]] = parseValue(m[2] ?? '', lineNo);
  }
}

const looksNumeric = (s) => s.trim() !== '' && !Number.isNaN(Number(s));

/** True if a string must be JSON-quoted to round-trip. @param {string} s */
export function needsQuote(s) {
  return s === '' || /[:#,[\]"]/.test(s) || /[\u0000-\u001f\u007f]/.test(s) || s !== s.trim() || looksNumeric(s);
}

function fmtScalar(v, key, force) {
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new FrontmatterError(`${key}: chỉ nhận số nguyên, gặp ${v}`);
    return String(v);
  }
  if (typeof v !== 'string') throw new FrontmatterError(`${key}: kiểu không hỗ trợ (${typeof v})`);
  return force || needsQuote(v) ? JSON.stringify(v) : v;
}

/**
 * Serialises data in insertion order; null/undefined keys are skipped.
 * @param {Record<string, any>} data @param {string} [body] text after the closing `---\n`
 * @returns {string}
 */
export function stringify(data, body = '') {
  const lines = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    if (!/^[a-z_]+$/.test(k)) throw new FrontmatterError(`khoá sai: ${k}`);
    if (Array.isArray(v)) {
      const force = ALWAYS_QUOTED_ITEMS.has(k);
      lines.push(`${k}: [${v.map((x) => fmtScalar(x, k, force)).join(', ')}]`);
    } else {
      lines.push(`${k}: ${fmtScalar(v, k, ALWAYS_QUOTED.has(k))}`);
    }
  }
  return `---\n${lines.map((l) => l + '\n').join('')}---\n${body}`;
}
