// What the owner asked for in a session: their own request turns, as context for the story angle (PRD 5.2 step 13).
// A request opens the session and more come scattered through it; short go-aheads ("tiếp tục", "ok", "commit push")
// carry no context and are left out.
import { isOwnerTurn } from './hotspots.mjs';
import { stripDiacritics } from './viet.mjs';

/** Longest single request kept (cut marked `…[+n]`), and the default budget of the whole block. */
export const ASK_MAX_CHARS = 600;
export const ASKS_MAX_CHARS = 2400;
/** Requests in the block at most: the first of the session plus the nearest ones before the story. */
export const ASKS_MAX = 4;

// Go-ahead words, diacritics dropped. A turn made only of these is not a request.
const TRIVIAL = new Set(`
  tiep tuc theo di lam ok oke okay okie yes y yep yeah ya co duoc dc roi u uh um uhm vang da a nhe nha luon ngay
  commit push merge pull rebase deploy release ship test tests chay run go ahead proceed continue next done xong tot
  good great nice fine sure thanks thank tks cam on you please pls lai the it and va then that roi vay day nao
  em anh minh toi ban giup help me do now nua them tiepp k ko khong no nope stop dung
`.split(/\s+/).filter(Boolean));
const INTERRUPT_RE = /^\[Request interrupted by user/;
const CHOICE_RE = /^\(?(?:[A-Fa-f]\d?|\d{1,2}[A-Fa-f]?)\)?[.!]?$/;

const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length > n ? `${s.slice(0, n)} …[+${s.length - n}]` : s);

/**
 * True for a turn that carries no request: an interrupt marker, a bare choice ("B", "2"), or only go-ahead words.
 * @param {string} text @returns {boolean}
 */
export function isTrivialAsk(text) {
  const t = oneLine(text);
  if (!t || INTERRUPT_RE.test(t) || CHOICE_RE.test(t)) return true;
  const words = stripDiacritics(t).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.length === 0 || words.every((w) => TRIVIAL.has(w));
}

/**
 * The owner's request turns of a session, in transcript order: user entries that are neither /bip, nor injected by the
 * harness (lib/hotspots.mjs isOwnerTurn), nor trivial.
 * @param {import('./sources/claude.mjs').Entry[]} entries @returns {{L: number, text: string}[]}
 */
export function sessionAsks(entries) {
  const out = [];
  for (const e of entries ?? []) if (isOwnerTurn(e) && !isTrivialAsk(e.text)) out.push({ L: e.L, text: oneLine(e.text) });
  return out;
}

/**
 * Request block for one story: the session's first request plus the nearest requests at or before `line` (the story's
 * first evidence line), newest first until `maxChars` or `maxAsks` is reached, then shown in transcript order as
 * `[Lnnn] USER: ...`. `lines` are the tags in the text, citable like excerpt lines. null when there is no request.
 * @param {{L: number, text: string}[]} asks @param {number} line
 * @param {{maxChars?: number, maxAsks?: number}} [o] @returns {{text: string, lines: number[]}|null}
 */
export function asksFor(asks, line, { maxChars = ASKS_MAX_CHARS, maxAsks = ASKS_MAX } = {}) {
  if (!asks?.length) return null;
  const render = (a) => `[L${a.L}] USER: ${cut(a.text, ASK_MAX_CHARS)}`;
  const first = asks[0];
  const picked = [first];
  let used = render(first).length;
  for (let i = asks.length - 1; i > 0 && picked.length < maxAsks; i--) {
    const a = asks[i];
    if (a.L > line) continue;
    const n = render(a).length + 1;
    if (used + n > maxChars) break;
    picked.push(a);
    used += n;
  }
  picked.sort((a, b) => a.L - b.L);
  return { text: picked.map(render).join('\n'), lines: picked.map((a) => a.L) };
}
